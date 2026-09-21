import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const buildRoot = process.env.FRAME_REVIEW_BUILD_ROOT ??
  path.join(repositoryRoot, 'native-build', 'frame-review');
const required = [
  'bin/bestsource_media_service.exe',
  'bin/libvlc_media_service.exe',
  'bin/media_packet_scan.exe',
  'bin/media_sample_signature.exe',
  'runtime/ffmpeg/ffmpeg.exe',
  'runtime/ffmpeg/ffprobe.exe',
  'runtime/libvlc/libvlc.dll',
  'runtime/media/libbestsource.dll',
  'runtime/media/libgcc_s_seh-1.dll',
  'runtime/media/libstdc++-6.dll',
  'runtime/media/libwinpthread-1.dll',
];

async function main() {
  for (const relativePath of required) {
    const artifactPath = path.join(buildRoot, relativePath);
    try {
      await access(artifactPath);
    } catch {
      throw new Error(
        `Required frame-review product is missing: ${artifactPath}. ` +
        'Run npm run frame-review:build; application startup will never build it for you.',
      );
    }
  }

  const resolved = JSON.parse(await readFile(
    path.join(repositoryRoot, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json'),
    'utf8',
  ));
  if (path.dirname(resolved.ffmpeg.path).toLowerCase() !==
      path.dirname(resolved.ffprobe.path).toLowerCase()) {
    throw new Error('Resolved FFmpeg and FFprobe do not belong to one distribution.');
  }

  const stagedFfmpeg = path.join(buildRoot, 'runtime', 'ffmpeg', 'ffmpeg.exe');
  const stagedFfprobe = path.join(buildRoot, 'runtime', 'ffmpeg', 'ffprobe.exe');
  for (const [label, executable] of [['FFmpeg', stagedFfmpeg], ['FFprobe', stagedFfprobe]]) {
    const result = spawnSync(executable, ['-version'], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) {
      throw new Error(
        `Staged ${label} product cannot start (exit ${result.status ?? 'unavailable'}). ` +
        'Run npm run frame-review:build.',
      );
    }
  }
  process.stdout.write('Frame-review native product verification passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
