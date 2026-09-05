import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { sampledContentSignaturesMatch } from '../src/preparation/sampled-content-signature.mjs';
import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const artifactRoot = path.join(spikeRoot, 'artifacts');
const rawPath = path.join(artifactRoot, 'bestsource-preparation-raw.json');
const outputPath = path.join(artifactRoot, 'cache-signature-benchmark.json');
const reportPath = path.join(spikeRoot, 'docs', 'cache-signature-results.md');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const sampler = path.join(spikeRoot, 'build', 'bestsource-gate', 'media_sample_signature.exe');
const environment = {
  ...process.env,
  PATH: [
    path.join(releaseRoot, 'bin'),
    path.join(releaseRoot, 'tools', 'ffmpeg'),
    'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
    process.env.PATH,
  ].join(';'),
};

await mkdir(artifactRoot, { recursive: true });
const preparation = JSON.parse(await readFile(rawPath, 'utf8'));
const results = [];
for (const target of preparation.results.filter((result) => result.status === 'complete')) {
  console.log(`${target.id}: balanced sampled signature`);
  const balancedBaseline = await sample(target.sourcePath, 'balanced');
  const balancedValidation = await sample(target.sourcePath, 'balanced');
  console.log(`${target.id}: compact sampled signature`);
  const compactBaseline = await sample(target.sourcePath, 'compact');
  const compactValidation = await sample(target.sourcePath, 'compact');
  results.push({
    id: target.id,
    sourcePath: target.sourcePath,
    sourceName: target.sourceName,
    previousFullValidationMs: target.cacheReopen?.sourceValidationMs ?? target.sourceValidationMs,
    balanced: { baseline: balancedBaseline, validation: balancedValidation,
      deterministic: sampledContentSignaturesMatch(balancedBaseline.signature, balancedValidation.signature) },
    compact: { baseline: compactBaseline, validation: compactValidation,
      deterministic: sampledContentSignaturesMatch(compactBaseline.signature, compactValidation.signature) },
  });
}

const evidence = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  selectedProfile: '3 minutes from start, 3 minutes from end, three deterministic 1-minute interior samples',
  results,
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(reportPath, render(evidence), 'utf8');
console.log(`Wrote ${reportPath}`);
process.exit(results.every((result) => result.balanced.deterministic && result.compact.deterministic) ? 0 : 1);

async function sample(movie, profile) {
  const started = performance.now();
  const args = profile === 'compact' ? [movie, '--compact'] : [movie];
  const execution = await executeStreaming(sampler, args, {
    env: environment,
    timeoutMs: 10 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const events = execution.stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const signature = events.find((event) => event.type === 'sampled-packet-signature');
  if (!signature) throw new Error(`Sample signature tool returned no signature for ${movie}.`);
  return { elapsedMs: performance.now() - started, signature };
}

function render(evidence) {
  const rows = evidence.results.map((result) => {
    const balanced = result.balanced.validation.elapsedMs;
    const compact = result.compact.validation.elapsedMs;
    const old = result.previousFullValidationMs;
    const reduction = Number.isFinite(old) && old > 0 ? `${(old / compact).toFixed(1)}x` : 'n/a';
    const deterministic = result.balanced.deterministic && result.compact.deterministic;
    return `| ${result.id} | ${format(old)} | ${format(balanced)} | ${format(compact)} | ${reduction} | ${format(result.compact.validation.signature.sampledDurationUs / 1_000_000)} | ${result.compact.validation.signature.ranges.length} | ${deterministic ? 'yes' : 'no'} |`;
  }).join('\n');
  const balancedWorst = Math.max(...evidence.results.map((result) => result.balanced.validation.elapsedMs));
  const compactWorst = Math.max(...evidence.results.map((result) => result.compact.validation.elapsedMs));
  return `# Sampled Cache-Signature Results

## Result

The selected cache signature uses ${evidence.selectedProfile}. It hashes compressed selected-track packets and does
not decode frames or wait for media-time playback. File size, duration, selected-track metadata,
the exact stored sample ranges, and sampled packet content all participate in validation.

The initially proposed 5+5+5x1 profile is retained as a comparison. The compact 3+3+3x1 profile is
selected because cache reopening is interactive and the larger profile remained disruptive on the
4K HEVC outlier.

| ID | Previous full scan ms | 5+5+5x1 ms | 3+3+3x1 ms | Compact speedup | Compact media s | Merged ranges | Deterministic |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows}

Worst 5+5+5x1 validation: ${format(balancedWorst)} ms. Worst selected 3+3+3x1 validation:
${format(compactWorst)} ms.

This is probabilistic change detection: content modified outside all sampled ranges can evade the
signature. That residual risk is explicitly accepted for interactive cache reopening. The original
full packet scan remains part of first-time preparation and normalization proof.
`;
}

function format(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a';
}
