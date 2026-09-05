import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describeMediaProbe, selectRepresentative } from '../src/tooling/media-signature.mjs';
import { createMediaScope } from '../src/tooling/media-scope.mjs';
import { execute, mapWithConcurrency } from '../src/tooling/process.mjs';

const VIDEO_EXTENSIONS = new Set([
  '.3g2', '.3gp', '.asf', '.avi', '.divx', '.flv', '.m2ts', '.m4v', '.mkv', '.mov', '.mp4',
  '.mpeg', '.mpg', '.mts', '.mxf', '.ogm', '.ogv', '.rm', '.rmvb', '.ts', '.vob', '.webm', '.wmv',
]);

const args = parseArgs(process.argv.slice(2));
const spikeRoot = path.resolve(import.meta.dirname, '..');
const resolvedText = await readFile(path.join(spikeRoot, '.deps', 'resolved-dependencies.json'), 'utf8');
const resolved = JSON.parse(resolvedText.replace(/^\uFEFF/, ''));
const scopeConfig = JSON.parse(await readFile(path.join(spikeRoot, 'media-scope.json'), 'utf8'));
const scope = createMediaScope(args.root, scopeConfig);
const collected = await collectMediaFiles(args.root, scope);
const files = collected.included;
console.log(`Probing ${files.length} media file(s) under ${args.root}...`);

let completed = 0;
const entries = await mapWithConcurrency(files, args.concurrency, async (filePath) => {
  const fileStat = await stat(filePath);
  try {
    const { stdout } = await execute(resolved.ffprobe.path, [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath,
    ], { timeoutMs: args.timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    const descriptor = describeMediaProbe(filePath, fileStat.size, JSON.parse(stdout));
    completed += 1;
    if (completed % 25 === 0 || completed === files.length) console.log(`Probed ${completed}/${files.length}`);
    return { status: 'readable', ...descriptor };
  } catch (error) {
    completed += 1;
    const message = conciseError(error);
    const status = message.includes('No playable video stream') ? 'excluded' : 'probe-failed';
    return { status, path: filePath, sizeBytes: fileStat.size, error: message };
  }
});

const groupsBySignature = new Map();
for (const entry of entries.filter((candidate) => candidate.status === 'readable')) {
  const group = groupsBySignature.get(entry.signature) ?? [];
  group.push(entry);
  groupsBySignature.set(entry.signature, group);
}

const groups = [...groupsBySignature.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
  ([signature, members], index) => {
    const representative = selectRepresentative(members);
    return {
      id: `media-${String(index + 1).padStart(3, '0')}`,
      signature,
      count: members.length,
      representativePath: representative.path,
      representativeReason: 'Highest combined file-size, resolution, and duration demand in this signature.',
      required: true,
      members: members.map((member) => member.path),
    };
  },
);

const inventory = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  root: path.resolve(args.root),
  scope: { config: 'media-scope.json', excludedFiles: collected.excluded },
  ffprobe: resolved.ffprobe,
  counts: { discovered: files.length + collected.excluded.length, inScope: files.length,
    readable: entries.filter((entry) => entry.status === 'readable').length,
    excluded: entries.filter((entry) => entry.status === 'excluded').length,
    scopeExcluded: collected.excluded.length,
    failed: entries.filter((entry) => entry.status === 'probe-failed').length, signatures: groups.length },
  groups,
  files: entries,
};

await writeFile(path.join(spikeRoot, 'artifacts', 'media-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
await writeFile(path.join(spikeRoot, 'docs', 'media-matrix.md'), renderMarkdown(inventory));
console.log(`Selected ${groups.length} signature representative(s); ${inventory.counts.failed} probe failure(s).`);

async function collectMediaFiles(root, scope) {
  const included = [];
  const excluded = [];
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) await visit(childPath);
      else if (child.isFile() && VIDEO_EXTENSIONS.has(path.extname(child.name).toLowerCase())) {
        (scope.includes(childPath) ? included : excluded).push(childPath);
      }
    }
  }
  await visit(path.resolve(root));
  return { included, excluded };
}

function renderMarkdown(inventory) {
  const rows = inventory.groups.map((group) => {
    const file = inventory.files.find((entry) => entry.path === group.representativePath);
    return `| ${group.id} | ${escapeCell(group.signature)} | ${group.count} | \`${escapeCell(group.representativePath)}\` | ${file.durationSeconds ?? 'unknown'} | pending |`;
  });
  const failures = inventory.files.filter((entry) => entry.status === 'probe-failed').map(
    (entry) => `- \`${entry.path}\`: ${entry.error}`,
  );
  const exclusions = inventory.files.filter((entry) => entry.status === 'excluded').map(
    (entry) => `- \`${entry.path}\`: ${entry.error}`,
  );
  return `# Representative Media Matrix

Generated ${inventory.generatedAtUtc} from \`${inventory.root}\` using bounded, read-only FFprobe calls.

- Discovered: **${inventory.counts.discovered}**
- Excluded from product scope: **${inventory.counts.scopeExcluded}**
- In product scope: **${inventory.counts.inScope}**
- Readable video files: **${inventory.counts.readable}**
- Material signatures: **${inventory.counts.signatures}**
- Excluded audio/cover-art files: **${inventory.counts.excluded}**
- Probe failures: **${inventory.counts.failed}**

One demanding representative is selected per signature; duplicate files remain listed in the JSON inventory.
Product-scope exclusions are defined in \`media-scope.json\`. Gate results collected before this
matrix was regenerated are historical evidence and must be matched by source path/signature, not
assumed to apply to a newly selected representative.

| ID | Material signature | Files | Representative | Duration (s) | LibVLC gate |
| --- | --- | ---: | --- | ---: | --- |
${rows.join('\n')}

## Probe Failures

${failures.length ? failures.join('\n') : 'None.'}

## Excluded Non-Video Media

${exclusions.length ? exclusions.join('\n') : 'None.'}
`;
}

function parseArgs(rawArgs) {
  let root = 'D:\\tmp\\media';
  let concurrency = 4;
  let timeoutMs = 20_000;
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === '--media-root') root = rawArgs[++index];
    else if (rawArgs[index] === '--concurrency') concurrency = Number(rawArgs[++index]);
    else if (rawArgs[index] === '--timeout-ms') timeoutMs = Number(rawArgs[++index]);
    else throw new Error(`Unknown argument ${rawArgs[index]}`);
  }
  if (!root || !Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error('Usage: inventory-media.mjs [--media-root path] [--concurrency N] [--timeout-ms N]');
  }
  return { root, concurrency, timeoutMs };
}

function conciseError(error) {
  return String(error?.message ?? error).replace(/\s+/g, ' ').trim().slice(0, 500).trimEnd();
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|');
}
