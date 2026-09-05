import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { evaluateFixture, parseJsonLines, percentile } from '../src/tooling/bestsource-evaluation.mjs';
import {
  buildPreparationCacheKey,
  createPreparationWorkspace,
  loadPreparationEntry,
  publishPreparationWorkspace,
} from '../src/preparation/preparation-cache.mjs';
import { PreparationCoordinator } from '../src/preparation/preparation-coordinator.mjs';
import { selectPreparationPolicy } from '../src/preparation/preparation-policy.mjs';
import { PreparationProgressTracker } from '../src/preparation/preparation-progress.mjs';
import { selectPreparationTargets } from '../src/preparation/preparation-targets.mjs';
import {
  buildSampledPreparationIdentity,
  sampledContentSignaturesMatch,
} from '../src/preparation/sampled-content-signature.mjs';
import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const positionalProfile = args.find((value) => ['policy-matrix', 'targeted', 'held-step'].includes(value));
const profile = valueAfter('--profile') ?? process.env.npm_config_profile ?? positionalProfile ??
  (hasFlag('--resume') ? 'targeted' : 'policy-matrix');
const reset = hasFlag('--reset');
const resume = hasFlag('--resume');
const renderOnly = hasFlag('--render-only');
if (reset && resume) throw new Error('--reset and --resume are mutually exclusive.');
if (!['policy-matrix', 'targeted', 'held-step'].includes(profile)) {
  throw new Error(`Unknown preparation profile: ${profile}`);
}

const artifactRoot = path.join(spikeRoot, 'artifacts');
const policyPath = path.join(artifactRoot, 'bestsource-preparation-policy.json');
const rawPath = path.join(artifactRoot, 'bestsource-preparation-raw.json');
const checkpointPath = path.join(artifactRoot, 'bestsource-preparation-checkpoint.json');
const reportPath = path.join(spikeRoot, 'docs', 'bestsource-preparation-gate-results.md');
const cacheRoot = path.join(spikeRoot, '.deps', 'prepared-review-cache');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const ffmpeg = path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe');
const scanner = path.join(spikeRoot, 'build', 'bestsource-gate', 'media_packet_scan.exe');
const sampleSignature = path.join(spikeRoot, 'build', 'bestsource-gate', 'media_sample_signature.exe');
const harness = path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe');
const indexCompare = path.join(spikeRoot, 'build', 'bestsource-gate', 'index_compare.exe');
const environment = {
  ...process.env,
  PATH: [
    path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
    path.join(releaseRoot, 'bin'),
    path.join(releaseRoot, 'tools', 'ffmpeg'),
    'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
    process.env.PATH,
  ].join(';'),
};
const indexOptions = { decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268_435_456 };
const normalizationRecipe = 'timestamp stream-copy; Matroska for MPEG-4 Part 2, NUT for H.264 packet preservation; no unpack filter';

await mkdir(artifactRoot, { recursive: true });
if (renderOnly) {
  const stored = await readJson(rawPath) ?? await readJson(checkpointPath);
  if (!stored) throw new Error('No preparation evidence exists to render.');
  await writeFile(reportPath, renderReport(stored), 'utf8');
  console.log(`Rendered ${reportPath}`);
  process.exit(0);
}

await requireFile(scanner);
await requireFile(sampleSignature);
await requireFile(harness);
await requireFile(indexCompare);
await requireFile(ffmpeg);
const inventory = JSON.parse(await readFile(path.join(artifactRoot, 'media-inventory.json'), 'utf8'));
const dependencies = JSON.parse(await readFile(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));

if (profile === 'policy-matrix') {
  const policyEvidence = await runPolicyMatrix(inventory);
  await writeFile(policyPath, `${JSON.stringify(policyEvidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${policyPath}`);
  process.exit(policyEvidence.results.some((result) => result.action === 'failure') ? 1 : 0);
}

if (profile === 'held-step') {
  const stored = await readJson(rawPath) ?? await readJson(checkpointPath);
  if (!stored?.completedAtUtc) throw new Error('The held-step profile requires a completed targeted run.');
  stored.settings.normalizationRecipe = normalizationRecipe;
  const heldResults = stored.results.filter((result) =>
    result.kind === 'timestamp-normalization' || result.kind === 'healthy-control');
  for (const result of heldResults) {
    console.log(`${result.id}: sustained held-step evidence`);
    result.heldStep = await measureHeldStep(result, result.numFrames, result.id);
    await saveRun(stored);
  }
  stored.settings.heldStepCount = 60;
  stored.settings.heldStepIntervalMs = 90;
  stored.settings.heldStepMinimumDurationMs = 5_000;
  await saveRun(stored, true);
  console.log(`Wrote ${reportPath}`);
  process.exit(heldResults.every((result) => result.heldStep.pass) ? 0 : 1);
}

const policyEvidence = await readJson(policyPath);
if (!policyEvidence) throw new Error('Run the policy-matrix profile before the targeted profile.');
if (policyEvidence.inventoryGeneratedAtUtc !== inventory.generatedAtUtc) {
  throw new Error('The policy matrix belongs to a different media inventory. Re-run policy-matrix.');
}
if (reset) {
  await safeRemove(cacheRoot);
  await rm(rawPath, { force: true });
  await rm(checkpointPath, { force: true });
}
await mkdir(cacheRoot, { recursive: true });

const fixtureManifest = JSON.parse(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
const fixtures = fixtureManifest.fixtures.filter((fixture) => !fixture.expectedFailure).map((fixture) => ({
  id: `fixture-${fixture.id}`,
  kind: 'fixture',
  sourcePath: fixture.path,
  oracle: fixture,
  media: { durationSeconds: Number(fixture.frames.at(-1)?.pts ?? 0) / 1_000 },
}));
const targets = selectPreparationTargets(policyEvidence.results, inventory, fixtures);
let run = resume ? await readJson(checkpointPath) ?? await readJson(rawPath) : null;
if (resume && !run) throw new Error('--resume found no prior targeted run.');
if (!run) {
  run = {
    schemaVersion: 1,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    inventoryGeneratedAtUtc: inventory.generatedAtUtc,
    dependencies: {
      bestsource: dependencies.dependencies.bestsource.version,
      ffmpeg: dependencies.dependencies.ffmpeg.version,
    },
    settings: {
      policyTargetRule: 'all normalize-timestamps plus media-026/media-035/media-036, fixtures, and one healthy control',
      normalizationRecipe,
      heldStepCount: 60,
      heldStepIntervalMs: 90,
      heldStepMinimumDurationMs: 5_000,
      heldStepMinimumFps: 10,
      adjacentP95TargetMs: 100,
      cacheValidationProfile: '3m start + 3m end + 3 deterministic 1m interior packet samples',
    },
    targetIds: targets.map((target) => target.id),
    cancellation: null,
    results: [],
  };
}
if (run.inventoryGeneratedAtUtc !== inventory.generatedAtUtc) {
  throw new Error('The targeted checkpoint belongs to a different media inventory.');
}
run.settings.normalizationRecipe = normalizationRecipe;
run.settings.cacheValidationProfile = '3m start + 3m end + 3 deterministic 1m interior packet samples';
const reopenAll = resume && Boolean(run.completedAtUtc) &&
  run.results.length === targets.length && run.results.every((result) => result.status === 'complete');

if (!run.cancellation) {
  run.cancellation = await runCancellationEvidence(targets);
  await saveRun(run);
}

for (const target of targets) {
  if (!reopenAll && run.results.some((result) => result.id === target.id && result.status === 'complete')) {
    console.log(`${target.id}: resumed completed evidence`);
    continue;
  }
  console.log(`${target.id}: preparing ${path.basename(target.sourcePath)}`);
  const result = await prepareTarget(target).catch((error) => ({
    id: target.id,
    kind: target.kind,
    sourcePath: target.sourcePath,
    status: 'failed',
    error: String(error?.message ?? error),
  }));
  const existing = run.results.findIndex((candidate) => candidate.id === target.id);
  if (existing >= 0 && reopenAll && run.results[existing].status === 'complete' && result.status === 'complete') {
    const cold = run.results[existing];
    run.results.splice(existing, 1, {
      ...cold,
      cacheHit: result.cacheHit,
      cacheReopen: {
        sourceValidationMs: result.sourceValidationMs,
        cacheValidationMs: result.cacheValidationMs,
        totalElapsedMs: result.totalElapsedMs,
        reopen: result.reopen,
      },
      randomAccess: result.randomAccess,
      heldStep: result.heldStep,
    });
  } else if (existing >= 0) run.results.splice(existing, 1, result);
  else run.results.push(result);
  await saveRun(run);
  console.log(`${target.id}: ${result.status}`);
}

run.completedAtUtc = run.results.length === targets.length &&
  run.results.every((result) => result.status === 'complete') ? new Date().toISOString() : null;
await saveRun(run, true);
console.log(`Wrote ${reportPath}`);
process.exit(run.results.some((result) => result.status !== 'complete') ? 1 : 0);

async function runPolicyMatrix(mediaInventory) {
  const evidence = {
    schemaVersion: 1,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    inventoryGeneratedAtUtc: mediaInventory.generatedAtUtc,
    results: [],
  };
  for (const group of mediaInventory.groups) {
    console.log(`${group.id}: packet preflight`);
    try {
      const measured = await scanPackets(group.representativePath, group.id);
      evidence.results.push({ id: group.id, sourcePath: group.representativePath,
        ...selectPreparationPolicy(measured.scan), scan: measured.scan, progress: measured.progress,
        elapsedMs: measured.elapsedMs });
    } catch (error) {
      evidence.results.push({ id: group.id, sourcePath: group.representativePath,
        action: 'failure', error: String(error?.message ?? error) });
    }
  }
  evidence.completedAtUtc = new Date().toISOString();
  return evidence;
}

async function prepareTarget(target) {
  const started = performance.now();
  const sourceSignature = await sampleSource(target.sourcePath);
  const identity = preparationIdentity(sourceSignature.signature);
  const cacheValidationStarted = performance.now();
  let prepared = await loadPreparationEntry(cacheRoot, identity);
  let sourceMeasured = null;
  let sourceScan = null;
  let policy = null;
  let reviewScan = null;
  let cacheHit = false;
  let phaseEvidence = { sourceSignature: { elapsedMs: sourceSignature.elapsedMs } };

  if (prepared) {
    if (!sampledContentSignaturesMatch(prepared.manifest.sourceSignature, sourceSignature.signature) ||
        !prepared.manifest.sourceScan || !prepared.manifest.policy) prepared = null;
  }
  if (prepared) {
    sourceScan = prepared.manifest.sourceScan;
    policy = prepared.manifest.policy;
    cacheHit = Boolean(prepared);
  }
  const cacheValidationMs = performance.now() - cacheValidationStarted;

  if (!prepared) {
    sourceMeasured = await scanPackets(target.sourcePath, `${target.id}/source`);
    sourceScan = sourceMeasured.scan;
    policy = selectPreparationPolicy(sourceScan);
    phaseEvidence.sourceScan = sourceMeasured.progress;
    if (sourceScan.sourceBytes !== sourceSignature.signature.sourceBytes ||
        sourceScan.streamIndex !== sourceSignature.signature.streamIndex) {
      throw new Error('Full preflight and sampled signature selected different source-track identity.');
    }
    const cacheKey = buildPreparationCacheKey(identity);
    const workspace = await createPreparationWorkspace(cacheRoot, cacheKey);
    const reviewFilename = policy.normalizationContainer === 'nut' ? 'review.nut' : 'review.mkv';
    const reviewOutput = path.join(workspace.temporaryPath, reviewFilename);
    const operationEvidence = {};
    let sourceScanServed = false;
    const coordinator = new PreparationCoordinator({
      scan: async (movie, { signal } = {}) => {
        if (movie === target.sourcePath && !sourceScanServed) {
          sourceScanServed = true;
          return sourceScan;
        }
        const measured = await scanPackets(movie, `${target.id}/review`, signal);
        reviewScan = measured.scan;
        operationEvidence.reviewScan = measured.progress;
        return measured.scan;
      },
      normalize: async (movie, { signal } = {}) => {
        const measured = await normalizeTimestamps(movie, reviewOutput,
          target.media?.durationSeconds, `${target.id}/normalize`, signal);
        operationEvidence.normalization = measured;
        return { reviewAsset: reviewOutput, transformMs: measured.elapsedMs };
      },
      index: async (movie, { signal } = {}) => {
        const measured = await buildIndex(movie, workspace.index, `${target.id}/index`, signal);
        operationEvidence.indexing = measured;
        return { index: workspace.index };
      },
      publish: async (candidate) => publishPreparationWorkspace(workspace, {
        schemaVersion: 2,
        cacheKey,
        identity,
        sourceSignature: sourceSignature.signature,
        sourceScan,
        policy,
        sourcePath: target.sourcePath,
        reviewAssetKind: policy.action === 'normalize-timestamps' ? 'normalized-copy' : 'source',
        reviewAsset: reviewFilename,
        reviewPacketPayloadDigest: reviewScan?.packetPayloadDigest ?? sourceScan.packetPayloadDigest,
        index: 'index',
        indexTrack: reviewScan?.streamIndex ?? sourceScan.streamIndex,
        preparedAtUtc: new Date().toISOString(),
        timings: {
          transformMs: candidate.transformMs ?? 0,
          indexMs: operationEvidence.indexing?.elapsedMs ?? null,
        },
      }),
      cleanup: async () => rm(workspace.temporaryPath, { recursive: true, force: true }),
    });
    prepared = await coordinator.prepare({ source: target.sourcePath });
    phaseEvidence = { ...phaseEvidence, ...operationEvidence };
  }

  const reopen = await probe(prepared.reviewAsset, prepared.index, [0], `${target.id}/reopen`);
  const sourceEvent = reopen.events.find((event) => event.type === 'source');
  if (!sourceEvent) throw new Error('Prepared index did not emit source metadata.');
  const numFrames = sourceEvent.numFrames;
  let identityComparison = null;
  if (policy.action === 'normalize-timestamps') {
    identityComparison = await compareCompleteIndexes(target, prepared);
    if (!identityComparison.completeHashOrderPreserved) {
      throw new Error(`Complete source/review frame-hash order differs at ${identityComparison.mismatchCount} frame(s).`);
    }
  }

  let fixtureIdentity = null;
  if (target.oracle) {
    const suite = await runHarness('suite', prepared.reviewAsset, prepared.index, [], `${target.id}/fixture-suite`);
    fixtureIdentity = evaluateFixture(target.oracle, suite.events);
    if (!fixtureIdentity.pass) throw new Error(`Fixture identity failed: ${fixtureIdentity.reasons.join('; ')}`);
  }

  const randomAccess = await measureRandomAccess(prepared, numFrames, target.id);
  const heldStep = (target.kind === 'timestamp-normalization' || target.kind === 'healthy-control')
    ? await measureHeldStep(prepared, numFrames, target.id)
    : null;

  return {
    id: target.id,
    kind: target.kind,
    sourcePath: target.sourcePath,
    sourceName: path.basename(target.sourcePath),
    status: 'complete',
    policy,
    cacheHit,
    cacheKey: prepared.cacheKey,
    reviewAssetKind: prepared.manifest.reviewAssetKind,
    reviewAsset: prepared.reviewAsset,
    index: prepared.index,
    activeIndexCount: 1,
    numFrames,
    cacheValidationMs,
    sourceValidationMs: sourceSignature.elapsedMs,
    sourceSignatureMs: sourceSignature.elapsedMs,
    sourceFullScanMs: sourceMeasured?.elapsedMs ?? null,
    totalElapsedMs: performance.now() - started,
    sourceSignature: sourceSignature.signature,
    sourceScan,
    reviewScan,
    phaseEvidence,
    reopen: summarizeProbe(reopen),
    identityComparison,
    fixtureIdentity,
    randomAccess,
    heldStep,
  };
}

async function scanPackets(movie, label, signal) {
  const progress = progressCapture(label, 'packet-scan');
  const events = [];
  const started = performance.now();
  await executeStreaming(scanner, [movie, '--progress'], {
    env: environment,
    signal,
    timeoutMs: 30 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    onStdoutLine: (line) => {
      const event = parseLine(line);
      events.push(event);
      if (event.type === 'packet-scan-progress') progress.tracker.update(event.currentBytes, event.totalBytes);
    },
  });
  progress.tracker.complete();
  const scan = events.find((event) => event.type === 'packet-scan');
  if (!scan) throw new Error(`Packet scanner produced no result for ${movie}.`);
  return { scan, progress: progress.summary(), elapsedMs: performance.now() - started };
}

async function sampleSource(movie, signal) {
  const started = performance.now();
  const events = [];
  await executeStreaming(sampleSignature, [movie, '--compact'], {
    env: environment,
    signal,
    timeoutMs: 10 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
    onStdoutLine: (line) => events.push(parseLine(line)),
  });
  const signature = events.find((event) => event.type === 'sampled-packet-signature');
  if (!signature) throw new Error(`Sample signature tool produced no result for ${movie}.`);
  return { signature, elapsedMs: performance.now() - started };
}

async function normalizeTimestamps(source, output, durationSeconds, label, signal) {
  const progress = progressCapture(label, 'timestamp-normalization');
  const totalUs = Math.max(1, Number(durationSeconds ?? 0) * 1_000_000);
  const started = performance.now();
  await executeStreaming(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+genpts', '-i', source,
    '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0', '-c', 'copy',
    '-avoid_negative_ts', 'make_non_negative', '-progress', 'pipe:1', '-nostats', output,
  ], {
    env: environment,
    signal,
    timeoutMs: 60 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    onStdoutLine: (line) => {
      const [key, value] = splitKeyValue(line);
      if (key === 'out_time_us') progress.tracker.update(Number(value), totalUs);
    },
  });
  progress.tracker.complete();
  return { elapsedMs: performance.now() - started, progress: progress.summary() };
}

async function buildIndex(movie, index, label, signal) {
  const progress = progressCapture(label, 'indexing');
  const run = await runHarness('probe', movie, index, [0], label, signal, (event) => {
    if (event.type === 'index-progress') progress.tracker.update(event.percent, 100);
  });
  progress.tracker.complete();
  const source = run.events.find((event) => event.type === 'source');
  if (!source) throw new Error(`BestSource produced no indexed source event for ${movie}.`);
  return { elapsedMs: run.elapsedMs, constructorMs: source.constructorMs, numFrames: source.numFrames,
    progress: progress.summary() };
}

async function probe(movie, index, frames, label) {
  return runHarness('probe', movie, index, frames, label);
}

async function runHarness(mode, movie, index, frames, label, signal, onEvent) {
  const events = [];
  const started = performance.now();
  const args = [mode, movie, index];
  if (frames.length) args.push(frames.join(','));
  await executeStreaming(harness, args, {
    env: environment,
    signal,
    timeoutMs: 3 * 60 * 60_000,
    maxBuffer: 128 * 1024 * 1024,
    onStdoutLine: (line) => {
      const event = parseLine(line);
      events.push(event);
      onEvent?.(event);
    },
  });
  return { label, events, elapsedMs: performance.now() - started };
}

async function compareCompleteIndexes(target, prepared) {
  const sourceIndex = path.join(spikeRoot, '.deps', 'indexes', 'bestsource-gate', 'media', target.id);
  const started = performance.now();
  try {
    const result = await executeStreaming(indexCompare,
      [target.sourcePath, sourceIndex, prepared.reviewAsset, prepared.index], {
        env: environment, timeoutMs: 60 * 60_000, maxBuffer: 16 * 1024 * 1024,
      });
    return { ...parseJsonLines(result.stdout).at(-1), elapsedMs: performance.now() - started };
  } catch (error) {
    const event = parseJsonLines(error.stdout ?? '').find((candidate) => candidate.type === 'index-comparison');
    if (event) return { ...event, elapsedMs: performance.now() - started };
    throw error;
  }
}

async function measureRandomAccess(prepared, numFrames, label) {
  const frames = [...new Set([0, Math.floor(numFrames / 2), Math.max(0, numFrames - 1)])];
  const run = await probe(prepared.reviewAsset, prepared.index, frames, `${label}/random`);
  return summarizeProbe(run);
}

async function measureHeldStep(prepared, numFrames, label) {
  const count = Math.min(60, Math.max(1, numFrames - 1));
  const intervalMs = 90;
  const maxStart = Math.max(0, numFrames - count - 1);
  const middleStart = Math.min(maxStart, Math.max(0, Math.floor(numFrames / 2) - Math.floor(count / 2)));
  const middle = await heldScenario(prepared, middleStart, count, `${label}/held-middle`);
  const previousKeyframe = middle.landing?.previousKeyframe ?? -1;
  const locations = [
    { name: 'start', start: 0 },
    { name: 'middle', start: middleStart, measured: middle },
    { name: 'end', start: maxStart },
  ];
  if (previousKeyframe >= 0) {
    locations.push({ name: 'before-gop-boundary', start: Math.min(maxStart, Math.max(0, previousKeyframe - 2)) });
    locations.push({ name: 'at-gop-boundary', start: Math.min(maxStart, previousKeyframe) });
  }
  const scenarios = [];
  for (const location of locations.filter((value, index, all) =>
    all.findIndex((candidate) => candidate.start === value.start) === index)) {
    scenarios.push({ name: location.name, ...(location.measured ??
      await heldScenario(prepared, location.start, count, `${label}/held-${location.name}`)) });
  }
  return {
    count,
    intervalMs,
    scenarios,
    pass: scenarios.every((scenario) => scenario.identityPass && scenario.forwardFps >= 10 &&
      scenario.reverseFps >= 10 && scenario.forwardElapsedMs >= 5_000 &&
      scenario.reverseElapsedMs >= 5_000 && scenario.forwardP95Ms <= 100 &&
      scenario.reverseP95Ms <= 100),
  };
}

async function heldScenario(prepared, start, count, label) {
  const intervalMs = 90;
  const run = await runHarness('held-step', prepared.reviewAsset, prepared.index,
    [start, count, intervalMs], label);
  const frames = run.events.filter((event) => event.type === 'frame');
  const summary = run.events.find((event) => event.type === 'held-step-summary');
  if (!summary) throw new Error(`Held-step summary is missing for ${label}.`);
  const forward = frames.filter((frame) => frame.operation === 'held-forward');
  const reverse = frames.filter((frame) => frame.operation === 'held-reverse');
  return {
    start,
    landing: frames.find((frame) => frame.operation === 'held-landing'),
    identityPass: frames.every((frame) => frame.originalFrame === frame.requestedFrame &&
      frame.frameInfoHash),
    forwardFps: count * 1_000 / summary.forwardElapsedMs,
    reverseFps: count * 1_000 / summary.reverseElapsedMs,
    capacityForwardFps: throughput(forward),
    capacityReverseFps: throughput(reverse),
    forwardElapsedMs: summary.forwardElapsedMs,
    reverseElapsedMs: summary.reverseElapsedMs,
    forwardP95Ms: percentile(forward.map((frame) => frame.latencyMs), 0.95),
    reverseP95Ms: percentile(reverse.map((frame) => frame.latencyMs), 0.95),
    reverseCacheMisses: reverse.filter((frame) => !frame.deliveredCacheHit).length,
    maxCachedBytes: Math.max(0, ...frames.map((frame) => frame.deliveredCacheBytes ?? 0)),
    wallElapsedMs: run.elapsedMs,
  };
}

async function runCancellationEvidence(targets) {
  const normalized = targets.find((target) => target.kind === 'timestamp-normalization');
  const indexTarget = targets.find((target) => target.id === 'media-035') ?? targets[0];
  if (!normalized || !indexTarget) throw new Error('Cancellation evidence targets are unavailable.');
  return {
    normalization: await cancelNormalization(normalized),
    indexing: await cancelIndexing(indexTarget),
  };
}

async function cancelNormalization(target) {
  const source = await scanPackets(target.sourcePath, `${target.id}/cancel-normalize-scan`);
  const policy = selectPreparationPolicy(source.scan);
  const signature = await sampleSource(target.sourcePath);
  const identity = preparationIdentity(signature.signature);
  const workspace = await createPreparationWorkspace(cacheRoot, buildPreparationCacheKey(identity), 'cancel-normalize');
  const reviewOutput = path.join(workspace.temporaryPath,
    policy.normalizationContainer === 'nut' ? 'review.nut' : 'review.mkv');
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), 250);
  let acknowledged = false;
  try {
    await normalizeTimestamps(target.sourcePath, reviewOutput, target.media?.durationSeconds,
      `${target.id}/cancel-normalize`, controller.signal);
  } catch (error) {
    acknowledged = error?.name === 'AbortError';
  } finally {
    clearTimeout(timer);
    await rm(workspace.temporaryPath, { recursive: true, force: true });
  }
  return { target: target.id, acknowledged, elapsedMs: performance.now() - started,
    validEntryPublished: await exists(workspace.finalPath) };
}

async function cancelIndexing(target) {
  const signature = await sampleSource(target.sourcePath);
  const identity = preparationIdentity(signature.signature);
  const workspace = await createPreparationWorkspace(cacheRoot, buildPreparationCacheKey(identity), 'cancel-index');
  const started = performance.now();
  let acknowledged = false;
  try {
    await runHarness('cancel', target.sourcePath, workspace.index, [], `${target.id}/cancel-index`);
  } catch (error) {
    acknowledged = error.code === 3 || parseJsonLines(error.stdout ?? '')
      .some((event) => event.type === 'error' && event.mode === 'cancel');
  } finally {
    await rm(workspace.temporaryPath, { recursive: true, force: true });
  }
  return { target: target.id, acknowledged, elapsedMs: performance.now() - started,
    validEntryPublished: await exists(workspace.finalPath) };
}

function preparationIdentity(signature) {
  return buildSampledPreparationIdentity(signature, {
    bestSourceVersion: dependencies.dependencies.bestsource.version,
    ffmpegVersion: dependencies.dependencies.ffmpeg.version,
    indexingOptions: indexOptions,
  });
}

function progressCapture(label, phase) {
  const events = [];
  const started = performance.now();
  let lastLoggedBucket = -1;
  const tracker = new PreparationProgressTracker((event) => {
    const measured = { ...event, label, observedAtMs: performance.now() - started };
    events.push(measured);
    const bucket = event.percent === 100 ? 4 : Math.floor(event.percent / 25);
    if (bucket > lastLoggedBucket) {
      lastLoggedBucket = bucket;
      console.log(`${label}: ${phase} ${event.percent}%${event.etaMs === null ? '' : ` ETA ${formatDuration(event.etaMs)}`}`);
    }
  }, () => performance.now());
  tracker.begin(phase);
  return {
    tracker,
    summary: () => ({ phase, eventCount: events.length,
      firstVisibleMs: events[0]?.observedAtMs ?? null,
      etaObserved: events.some((event) => Number.isFinite(event.etaMs) && event.etaMs > 0),
      events }),
  };
}

function summarizeProbe(run) {
  const source = run.events.find((event) => event.type === 'source');
  const frames = run.events.filter((event) => event.type === 'frame');
  return {
    elapsedMs: run.elapsedMs,
    constructorMs: source?.constructorMs ?? null,
    numFrames: source?.numFrames ?? null,
    frameCount: frames.length,
    p95Ms: percentile(frames.map((frame) => frame.latencyMs), 0.95),
    maxMs: frames.length ? Math.max(...frames.map((frame) => frame.latencyMs)) : null,
    identityPass: frames.every((frame) => frame.originalFrame === frame.requestedFrame &&
      frame.frameInfoHash),
  };
}

function throughput(frames) {
  const totalMs = frames.reduce((sum, frame) => sum + frame.latencyMs, 0);
  return totalMs > 0 ? frames.length * 1_000 / totalMs : Number.POSITIVE_INFINITY;
}

async function saveRun(run, final = false) {
  await writeFile(checkpointPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  if (final) await writeFile(rawPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  await writeFile(reportPath, renderReport(run), 'utf8');
}

function renderReport(run) {
  const completed = run.results?.filter((result) => result.status === 'complete') ?? [];
  const normalized = completed.filter((result) => result.policy.action === 'normalize-timestamps');
  const failed = run.results?.filter((result) => result.status !== 'complete') ?? [];
  const cancellationPass = ['normalization', 'indexing'].every((kind) =>
    run.cancellation?.[kind]?.acknowledged && !run.cancellation?.[kind]?.validEntryPublished &&
    run.cancellation?.[kind]?.elapsedMs <= 2_000);
  const identityPass = normalized.every((result) => result.identityComparison?.completeHashOrderPreserved) &&
    completed.every((result) => result.fixtureIdentity?.pass !== false);
  const cachePass = completed.every((result) => result.activeIndexCount === 1);
  const cacheReopenPass = completed.length > 0 && completed.every((result) =>
    result.cacheHit && Number.isFinite(result.cacheReopen?.reopen?.constructorMs));
  const expectedHeld = completed.filter((result) =>
    result.kind === 'timestamp-normalization' || result.kind === 'healthy-control');
  const heldPass = expectedHeld.length > 0 && expectedHeld.every((result) => result.heldStep?.pass);
  const overall = Boolean(run.completedAtUtc) && !failed.length && cancellationPass && identityPass &&
    cachePass && cacheReopenPass && heldPass;
  const rows = (run.results ?? []).map((result) => `| ${result.id} | ${result.kind} | ${result.status} | ${result.policy?.action ?? 'n/a'} | ${result.reviewAssetKind ?? 'n/a'} | ${reviewContainer(result)} | ${yesNo(result.cacheHit)} | ${number(result.phaseEvidence?.normalization?.elapsedMs)} | ${number(result.phaseEvidence?.indexing?.elapsedMs)} | ${result.numFrames ?? 'n/a'} | ${yesNo(result.identityComparison?.completeHashOrderPreserved ?? result.fixtureIdentity?.pass ?? true)} | ${number(result.randomAccess?.p95Ms)} | ${yesNo(result.heldStep?.pass)} | ${escapeCell(result.error ?? '')} |`).join('\n');
  const heldRows = completed.filter((result) => result.heldStep).flatMap((result) =>
    result.heldStep.scenarios.map((scenario) => `| ${result.id} | ${scenario.name} | ${scenario.start} | ${number(scenario.forwardFps)} | ${number(scenario.reverseFps)} | ${number(scenario.forwardElapsedMs / 1_000)} | ${number(scenario.reverseElapsedMs / 1_000)} | ${number(scenario.forwardP95Ms)} | ${number(scenario.reverseP95Ms)} | ${scenario.reverseCacheMisses} | ${formatBytes(scenario.maxCachedBytes)} | ${yesNo(scenario.identityPass)} |`)).join('\n');
  const reopenRows = completed.map((result) => `| ${result.id} | ${yesNo(result.cacheHit)} | ${number(result.cacheReopen?.sourceValidationMs)} | ${number(result.cacheReopen?.cacheValidationMs)} | ${number(result.cacheReopen?.reopen?.constructorMs)} | ${number(result.cacheReopen?.totalElapsedMs)} |`).join('\n');
  return `# BestSource Prepared-Review Gate Results

Generated from \`artifacts/bestsource-preparation-raw.json\` or the current checkpoint. This is the
Milestone 3b evidence gate; it does not alter the original Milestone 3 result.

## Result

**${overall ? 'PASS' : run.completedAtUtc ? 'FAIL' : 'IN PROGRESS'}**

- Target rule: ${run.settings?.policyTargetRule ?? 'n/a'}
- Completed targets: ${completed.length}/${run.targetIds?.length ?? 0}
- Full normalized source/review frame-map identity: ${yesNo(identityPass)}
- Exactly one active review index per completed source: ${yesNo(cachePass)}
- Valid cache reopen without normalization or full indexing: ${yesNo(cacheReopenPass)}
- Held adjacent-step gate: ${yesNo(heldPass)}
- Cancellation under two seconds with no published partial entry: ${yesNo(cancellationPass)}

## Preparation Evidence

| ID | Role | Status | Policy | Review asset | Container | Cache hit | Normalize ms | Index ms | Frames | Identity | Random p95 ms | Held pass | Error |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
${rows || '| pending | | | | | | | | | | | | | |'}

## Cache Reopen Evidence

Source validation uses ${run.settings?.cacheValidationProfile ?? 'the recorded source-validation profile'}
before accepting a cache hit. It is probabilistic content-change detection combined with file and
selected-track metadata; first-time preparation still performs the complete packet scan. Cache
validation covers the manifest and expected files. Constructor time is the BestSource
persistent-index reopen, not a full rebuild.

| ID | Cache hit | Source validation ms | Cache validation ms | Index reopen ms | Total reopen run ms |
|---|---:|---:|---:|---:|---:|
${reopenRows || '| pending | | | | | |'}

## Held-Step Evidence

Each row represents ${run.settings?.heldStepCount ?? 60} serialized forward requests followed by the
same number of reverse requests from one exact landing. Requests are paced at
${run.settings?.heldStepIntervalMs ?? 90} ms, sustaining each direction for at least five wall-clock
seconds with one request in flight; no operating-system key-repeat queue is used.

| ID | Landing | Start frame | Forward fps | Reverse fps | Forward s | Reverse s | Forward p95 ms | Reverse p95 ms | Reverse misses | Delivered cache | Identity |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${heldRows || '| pending | | | | | | | | | | | |'}

## Cancellation

| Phase | Target | Acknowledged | Elapsed ms | Valid entry published |
|---|---|---:|---:|---:|
| Normalization | ${run.cancellation?.normalization?.target ?? 'pending'} | ${yesNo(run.cancellation?.normalization?.acknowledged)} | ${number(run.cancellation?.normalization?.elapsedMs)} | ${yesNo(run.cancellation?.normalization?.validEntryPublished)} |
| Indexing | ${run.cancellation?.indexing?.target ?? 'pending'} | ${yesNo(run.cancellation?.indexing?.acknowledged)} | ${number(run.cancellation?.indexing?.elapsedMs)} | ${yesNo(run.cancellation?.indexing?.validEntryPublished)} |

## Interpretation

Initial preparation is allowed to exceed the former ten-minute target, but progress must be visible
and the resulting cache must prevent normalization and full indexing on a valid future load. A
timestamp-normalized review copy is a media artifact; its BestSource index is the one canonical
exact-review index. The original movie remains the extraction source.
`;
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag) || process.env[`npm_config_${flag.slice(2).replaceAll('-', '_')}`] === 'true';
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { throw new Error(`Native tool emitted invalid JSON: ${line}`); }
}

function splitKeyValue(line) {
  const index = line.indexOf('=');
  return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
}

async function requireFile(file) {
  try { await access(file); } catch { throw new Error(`Required preparation tool is missing: ${file}`); }
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function safeRemove(target) {
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== path.resolve(spikeRoot, '.deps')) {
    throw new Error(`Refusing to remove unexpected preparation cache path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}

function number(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a';
}

function yesNo(value) {
  return value === undefined || value === null ? 'n/a' : value ? 'yes' : 'no';
}

function reviewContainer(result) {
  if (result.reviewAssetKind === 'source') return 'source';
  if (result.policy?.action !== 'normalize-timestamps') return 'n/a';
  return result.sourceScan?.codec === 'h264' ? 'NUT' : 'Matroska';
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatBytes(bytes) {
  return Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : 'n/a';
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
