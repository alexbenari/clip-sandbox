import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const artifactRoot = path.join(spikeRoot, 'artifacts', 'bridge');
const electron = path.join(spikeRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const main = path.join(spikeRoot, 'electron', 'benchmark-main.cjs');
const requested = valueAfter('--target');
const transportMode = valueAfter('--transport') ?? 'binary';
const previewMode = valueAfter('--preview') ?? 'source';
const scrubDebounceMs = Number(valueAfter('--scrub-debounce-ms') ?? 0);
if (!['binary', 'shared-ring'].includes(transportMode)) {
  throw new Error(`Unsupported transport mode: ${transportMode}`);
}
if (!['source', 'viewport'].includes(previewMode)) {
  throw new Error(`Unsupported preview mode: ${previewMode}`);
}
if (!Number.isSafeInteger(scrubDebounceMs) || scrubDebounceMs < 0 || scrubDebounceMs > 1_000) {
  throw new Error('Scrub debounce must be an integer between 0 and 1000 milliseconds.');
}
const targetIds = requested ? requested.split(',').filter(Boolean) : ['media-005', 'media-017', 'media-035'];
if (targetIds.length === 0) throw new Error('At least one benchmark target is required.');
const isBaseline = previewMode === 'source' && scrubDebounceMs === 0;
const artifactPrefix = isBaseline
  ? transportMode
  : `${transportMode}-${previewMode}-d${scrubDebounceMs}`;
const reportPath = path.join(spikeRoot, 'docs', isBaseline
  ? 'electron-bridge-results.md'
  : 'electron-bridge-m4b-results.md');

await mkdir(artifactRoot, { recursive: true });
const results = [];
for (const targetId of targetIds) {
  const outputPath = path.join(artifactRoot, `${artifactPrefix}-${targetId}.json`);
  await rm(outputPath, { force: true });
  console.log(`${targetId}: Electron bridge benchmark`);
  const execution = await executeStreaming(electron, [main], {
    cwd: spikeRoot,
    env: {
      ...process.env,
      FRAME_BRIDGE_TARGET_ID: targetId,
      FRAME_BRIDGE_OUTPUT_PATH: outputPath,
      FRAME_BRIDGE_TRANSPORT_MODE: transportMode,
      FRAME_BRIDGE_PREVIEW_MODE: previewMode,
      FRAME_BRIDGE_SCRUB_DEBOUNCE_MS: String(scrubDebounceMs),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeoutMs: 15 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
    onStderrLine: (line) => console.log(`${targetId}: ${line}`),
  });
  const evidence = JSON.parse(await readFile(outputPath, 'utf8'));
  if (evidence.error) throw new Error(`${targetId} renderer failed: ${evidence.error}\n${execution.stderr}`);
  results.push(evidence);
}

const run = {
  schemaVersion: 2,
  generatedAtUtc: new Date().toISOString(),
  transportMode,
  previewMode,
  scrubDebounceMs,
  targetIds,
  results,
};
await writeFile(path.join(artifactRoot, `${artifactPrefix}-bridge-benchmark.json`), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
const baseline = isBaseline ? null : await readBaseline();
await writeFile(reportPath, render(run, baseline), 'utf8');
console.log(`Wrote ${reportPath}`);

function render(run, baseline) {
  const rows = run.results.map((result) => {
    const exact = summarize(result.exact);
    const adjacent = summarize(result.adjacent);
    const playback = result.playback;
    const maxDropped = Math.max(0, ...playback.frames.map((frame) => frame.droppedBeforeWrite));
    const pixelsPass = [...result.exact, ...result.adjacent].every(pixelCheckPass) &&
      playback.frames.every(pixelCheckPass);
    const frame = result.exact[0] ?? result.adjacent[0];
    return `| ${result.targetId} | ${result.sourceName} | ${sourceDimensions(result)} | ${dimensions(result)} | ${number(payloadReduction(frame))}x | ${number(exact.decode)} | ${number(exact.conversion)} | ${number(exact.bridge)} | ${number(exact.total)} | ${number(adjacent.bridge)} | ${number(adjacent.total)} | ${number(result.scrub.settlementMs)} | ${result.scrub.fulfilled}/${result.scrub.requested} | ${number(playback.visibleFps)} | ${maxDropped} | ${pixelsPass ? 'yes' : 'no'} |`;
  }).join('\n');
  const bridgeP95 = Math.max(...run.results.flatMap((result) =>
    [percentile([...result.exact, ...result.adjacent].map((frame) => bridgeOverhead(frame.timings)), 0.95)]));
  const scrubPass = run.results.every((result) => result.scrub.latestFrameIndex >= 0 &&
    result.scrub.fulfilled === 1);
  const bounded = run.results.every((result) => result.scrub.fulfilled === 1 &&
    result.scrub.stale === 19 && result.scrub.rejected === 0);
  const pixelPass = run.results.every((result) =>
    [...result.exact, ...result.adjacent, ...result.playback.frames].every(pixelCheckPass));
  const ordinaryBinaryPass = bridgeP95 <= 100 && bounded && pixelPass;
  const fourK = run.results.find((result) => result.targetId === 'media-035');
  const fourKBridgeP95 = fourK
    ? percentile([...fourK.exact, ...fourK.adjacent].map((frame) => bridgeOverhead(frame.timings)), 0.95)
    : null;
  const fourKPass = fourKBridgeP95 === null ? null : fourKBridgeP95 <= 100;
  const scrubSettlements = run.results.map((result) => result.scrub.settlementMs);
  const comparison = baseline ? renderComparison(run, baseline) : '';
  const title = run.previewMode === 'viewport'
    ? 'Electron Frame-Bridge M4b Results'
    : 'Electron Frame-Bridge Results';
  const resultLabel = ordinaryBinaryPass
    ? 'PASS'
    : run.previewMode === 'viewport'
      ? fourKPass === true ? 'M4B 4K PASS; OVERALL 100 MS GATE MISS' :
        fourKPass === false ? 'M4B 4K FAIL' : 'M4B OVERALL 100 MS GATE MISS; 4K NOT MEASURED'
      : 'BINARY 4K FAIL; SHARED-RING IPC BLOCKED';
  const decision = ordinaryBinaryPass
    ? `Viewport-sized previews remove bridge transport as the reason to enter the native-window gate.
Source decode latency remains visible and is not repaired by smaller preview payloads.`
    : `When the binary path fails, see [Electron Shared-Ring Experiment](electron-shared-ring-results.md)
for the bounded follow-up and the native-window decision gate.`;
  return `# ${title}

## Result

**${resultLabel}**

- Measured transport: ${run.transportMode}
- Preview policy: ${run.previewMode === 'viewport' ? 'fit oversized sources to the renderer viewport without upscaling' : 'source resolution'}
- Scrub debounce: ${run.scrubDebounceMs} ms
- Ordinary length-prefixed binary stdio plus Electron structured-clone transfer: ${ordinaryBinaryPass ? 'sufficient' : 'insufficient'}
- Viewport-sized 4K bridge gate: ${fourKPass === null ? 'not measured' : fourKPass ? 'pass' : 'fail'}${fourKBridgeP95 === null ? '' : ` (${number(fourKBridgeP95)} ms p95)`}
- Shared-memory ring-buffer experiment: ${fourKPass ? 'not required for viewport-sized preview frames' : fourKPass === null ? 'decision deferred until 4K is measured' : 'previously attempted; blocked by Electron 37 IPC'}
- Latest-wins scrub queue bounded to one in-flight plus one pending: ${bounded ? 'yes' : 'no'}
- Newest scrub request was the only delivered result: ${scrubPass ? 'yes' : 'no'}
- Renderer pixel checks passed: ${pixelPass ? 'yes' : 'no'}
- Worst measured p95 bridge-copy/upload overhead: ${number(bridgeP95)} ms

Bridge overhead is native-to-main pipe transfer plus main serialization, main-to-renderer transfer,
and Canvas 2D upload/draw. Decode time is reported separately so known codec/GOP costs do not get
misattributed to Electron IPC.

| Target | Source | Source frame | Preview frame | Payload reduction | Exact decode p95 ms | Conversion p95 ms | Exact bridge p95 ms | Exact total p95 ms | Adjacent bridge p95 ms | Adjacent total p95 ms | Scrub settle ms | Scrub delivered | Playback visible fps | Native drops | Pixels |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}

${comparison}

## Interpretation

The bridge gate uses a 100 ms p95 ceiling for delivery and draw overhead. Exceeding native decode
targets alone does not trigger shared memory because shared memory cannot accelerate decoding. The
benchmark uses one persistent LibVLC playback process and one persistent BestSource exact-frame
process; only the engine supplying the current viewport actively decodes frames.

The scrub scheduler waits ${run.scrubDebounceMs} ms for a quiet point before beginning native work.
It still cannot cancel a BestSource landing already executing. Measured settlement ranged from
${number(Math.min(...scrubSettlements))} ms to ${number(Math.max(...scrubSettlements))} ms.

${decision}
`;
}

function summarize(frames) {
  return {
    decode: percentile(frames.map((frame) => frame.timings.decodeMs), 0.95),
    conversion: percentile(frames.map((frame) => frame.timings.conversionMs), 0.95),
    bridge: percentile(frames.map((frame) => bridgeOverhead(frame.timings)), 0.95),
    total: percentile(frames.map((frame) => frame.timings.endToEndMs), 0.95),
  };
}

function renderComparison(current, baseline) {
  const baselineByTarget = new Map(baseline.results.map((result) => [result.targetId, result]));
  const rows = current.results.map((result) => {
    const before = baselineByTarget.get(result.targetId);
    if (!before) return '';
    const beforeFrames = [...before.exact, ...before.adjacent];
    const currentFrames = [...result.exact, ...result.adjacent];
    return `| ${result.targetId} | ${number(percentile(beforeFrames.map((frame) => bridgeOverhead(frame.timings)), 0.95))} | ${number(percentile(currentFrames.map((frame) => bridgeOverhead(frame.timings)), 0.95))} | ${number(before.scrub.settlementMs)} | ${number(result.scrub.settlementMs)} | ${number(before.playback.visibleFps)} | ${number(result.playback.visibleFps)} |`;
  }).filter(Boolean).join('\n');
  return `## Before/After

The baseline is the full-resolution, zero-debounce Milestone 4 binary run captured on the same
machine. Decode cost remains separate from bridge cost.

| Target | Baseline bridge p95 ms | M4b bridge p95 ms | Baseline scrub settle ms | M4b scrub settle ms | Baseline playback fps | M4b playback fps |
|---|---:|---:|---:|---:|---:|---:|
${rows}`;
}

function bridgeOverhead(timings) {
  return timings.nativeToHostMs + timings.mainSerializationMs +
    timings.mainToRendererMs + timings.uploadDrawMs;
}

function pixelCheckPass(frame) {
  return frame.pixelCheck.sampledPixels > 0 &&
    frame.pixelCheck.sampledMatchingPixels === frame.pixelCheck.sampledPixels;
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1];
}

function dimensions(result) {
  const frame = result.exact[0] ?? result.adjacent[0];
  return frame ? `${frame.width}x${frame.height}` : 'n/a';
}

function sourceDimensions(result) {
  const frame = result.exact[0] ?? result.adjacent[0];
  return frame ? `${frame.sourceWidth ?? frame.width}x${frame.sourceHeight ?? frame.height}` : 'n/a';
}

function payloadReduction(frame) {
  if (!frame) return null;
  const sourceBytes = (frame.sourceWidth ?? frame.width) * (frame.sourceHeight ?? frame.height) * 4;
  return sourceBytes / frame.payloadBytes;
}

async function readBaseline() {
  const baselinePath = path.join(artifactRoot, `${transportMode}-bridge-benchmark.json`);
  try {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    if (baseline.schemaVersion !== 2) {
      throw new Error('Baseline uses an older benchmark schema.');
    }
    return baseline;
  } catch (error) {
    throw new Error(`M4b comparison requires the baseline artifact at ${baselinePath}. Run npm run bridge:benchmark first.`, { cause: error });
  }
}

function number(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a';
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}
