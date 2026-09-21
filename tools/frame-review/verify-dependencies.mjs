import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const toolRoot = path.resolve(import.meta.dirname);
const defaultManifestPath = path.join(toolRoot, 'dependency-manifest.json');
const defaultResolvedPath = path.join(toolRoot, '.deps', 'resolved-dependencies.json');
const expectedFfmpegFeatures = [
  'core', 'avcodec', 'avfilter', 'avformat', 'dav1d', 'ffmpeg', 'ffprobe',
  'gpl', 'swresample', 'swscale', 'x264',
];

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Dependency manifest field ${label} must be a non-empty string.`);
  }
}

export function assertManifestContract(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest?.platform !== 'windows-x64') {
    throw new Error('Dependency manifest must use schema 1 for windows-x64.');
  }

  for (const name of ['libvlc', 'libvlcSource', 'bestsource', 'vcpkg', 'ffmpeg',
    'x264', 'dav1d', 'xxhash', 'libp2p', 'nlohmannJson']) {
    const dependency = manifest.dependencies?.[name];
    if (!dependency) throw new Error(`Dependency manifest is missing ${name}.`);
    requireString(dependency.version, `${name}.version`);
    requireString(dependency.license, `${name}.license`);
    requireString(dependency.sourceUrl, `${name}.sourceUrl`);
  }
  requireString(manifest.dependencies.libvlc.sha512, 'libvlc.sha512');
  for (const name of ['libvlcSource', 'bestsource', 'vcpkg', 'libp2p']) {
    if (!/^[0-9a-f]{40}$/i.test(manifest.dependencies[name].commit)) {
      throw new Error(`Dependency manifest field ${name}.commit must be a full Git commit.`);
    }
  }
  for (const name of ['ffmpeg', 'x264', 'dav1d', 'xxhash', 'nlohmannJson']) {
    requireString(manifest.dependencies[name].sourceArchiveSha512, `${name}.sourceArchiveSha512`);
    requireString(manifest.dependencies[name].pinSource, `${name}.pinSource`);
  }

  const features = manifest.dependencies.ffmpeg.features;
  if (JSON.stringify(features) !== JSON.stringify(expectedFfmpegFeatures)) {
    throw new Error(`FFmpeg features must be exactly ${expectedFfmpegFeatures.join(', ')}.`);
  }
  const serialized = JSON.stringify(manifest).toLowerCase();
  for (const forbidden of ['qsv', 'libvpl', 'cuda', 'nvenc', 'amf']) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Hardware dependency or feature ${forbidden} is forbidden.`);
    }
  }
  if (manifest.dependencies.ffmpeg.license !== 'GPL-2.0-or-later') {
    throw new Error('The x264-enabled FFmpeg distribution must be recorded as GPL-2.0-or-later.');
  }
}

async function sha512(filePath) {
  const hash = createHash('sha512');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function verifyPinnedFile({
  dependencyName,
  filePath,
  expectedSha512,
  recoveryCommand,
}) {
  const actualSha512 = await sha512(filePath);
  if (actualSha512 !== expectedSha512.toLowerCase()) {
    throw new Error(
      `${dependencyName} SHA-512 mismatch. Expected ${expectedSha512}; got ${actualSha512}. ` +
      `Remove the corrupt cached file or recover with: ${recoveryCommand}`,
    );
  }
  return actualSha512;
}

function runCapabilityProbe(executable, args, label, runtimeDirectories = []) {
  const environment = { ...process.env };
  environment.PATH = [...runtimeDirectories, environment.PATH].filter(Boolean).join(path.delimiter);
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: environment,
  });
  if (result.status !== 0) {
    throw new Error(`${label} capability probe failed with exit code ${result.status}.`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function verifyGitPin(name, source) {
  const result = spawnSync('git', ['-C', source.root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const actualCommit = result.stdout?.trim();
  if (result.status !== 0 || actualCommit !== source.commit) {
    throw new Error(
      `${name} source pin mismatch. Expected ${source.commit}; got ${actualCommit || 'unavailable'}. ` +
      'Run npm run frame-review:bootstrap.',
    );
  }
}

async function verifyResolvedState(manifest, manifestText, resolvedPath) {
  const resolved = JSON.parse(await readFile(resolvedPath, 'utf8'));
  if (resolved.manifestSha256 !== createHash('sha256').update(manifestText).digest('hex')) {
    throw new Error('Resolved dependencies do not match dependency-manifest.json. Run npm run frame-review:bootstrap.');
  }

  await verifyPinnedFile({
    dependencyName: 'libvlc',
    filePath: resolved.libvlc.archive,
    expectedSha512: manifest.dependencies.libvlc.sha512,
    recoveryCommand: 'npm run frame-review:bootstrap -- --ForceDownload',
  });

  for (const [name, artifactPath] of Object.entries(resolved.requiredArtifacts ?? {})) {
    try {
      await access(artifactPath);
    } catch {
      throw new Error(`Required frame-review artifact ${name} is missing at ${artifactPath}. Run npm run frame-review:bootstrap.`);
    }
  }

  for (const name of ['libvlc', 'bestsource', 'vcpkg', 'libp2p']) {
    const source = resolved.sources?.[name];
    if (!source) {
      throw new Error(`Resolved dependency state is missing the ${name} source pin. ` +
        'Run npm run frame-review:bootstrap.');
    }
    verifyGitPin(name, source);
  }

  if (path.dirname(resolved.ffmpeg.path).toLowerCase() !==
      path.dirname(resolved.ffprobe.path).toLowerCase()) {
    throw new Error('FFmpeg and FFprobe must come from the same pinned distribution directory.');
  }
  const encoders = runCapabilityProbe(
    resolved.ffmpeg.path,
    ['-hide_banner', '-encoders'],
    'FFmpeg',
    [resolved.ffmpeg.runtimeDllRoot, resolved.compiler.runtimeDllRoot],
  );
  if (!encoders.includes('libx264rgb')) {
    throw new Error('Pinned FFmpeg is missing the required libx264rgb encoder. Run npm run frame-review:bootstrap.');
  }
  const version = runCapabilityProbe(
    resolved.ffprobe.path,
    ['-version'],
    'FFprobe',
    [resolved.ffprobe.runtimeDllRoot, resolved.compiler.runtimeDllRoot],
  );
  if (!version.includes(`ffprobe version ${manifest.dependencies.ffmpeg.version}`)) {
    throw new Error(`Pinned FFprobe is not version ${manifest.dependencies.ffmpeg.version}.`);
  }
}

async function main() {
  const manifestPath = process.env.FRAME_REVIEW_MANIFEST_PATH ?? defaultManifestPath;
  const resolvedPath = process.env.FRAME_REVIEW_RESOLVED_PATH ?? defaultResolvedPath;
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  assertManifestContract(manifest);
  if (!process.argv.includes('--manifest-only')) {
    await verifyResolvedState(manifest, manifestText, resolvedPath);
  }
  process.stdout.write('Frame-review dependency verification passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
