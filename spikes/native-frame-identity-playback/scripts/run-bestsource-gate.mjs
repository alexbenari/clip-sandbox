import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assessBestSourceGate,
  compareIdentityMaps,
  evaluateFixture,
  parseJsonLines,
  percentile,
  summarizeBestSourceDebug,
} from '../src/tooling/bestsource-evaluation.mjs';
import { execute, mapWithConcurrency } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const resetIndexes = args.has('--reset-indexes');
const fixturesOnly = args.has('--fixtures-only');
const mediaOnly = args.has('--media-only');
const resume = args.has('--resume');
const warmOnly = args.has('--warm-only');
const renderOnly = args.has('--render-only');
const mediaLimit = valueAfter('--media-limit');
const mediaConcurrency = valueAfter('--media-concurrency') ?? 1;
const warmAccessTargetMs = 750;
const runStarted = new Date();
const artifactPath = path.join(spikeRoot, 'artifacts', 'bestsource-gate-raw.json');
const checkpointPath = path.join(spikeRoot, 'artifacts', 'bestsource-gate-checkpoint.json');
const reportPath = path.join(spikeRoot, 'docs', fixturesOnly ? 'bestsource-fixture-results.md' : 'bestsource-gate-results.md');
const indexRoot = path.join(spikeRoot, '.deps', 'indexes', 'bestsource-gate');
const harness = path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe');
const baselineHarness = path.join(spikeRoot, 'build', 'bestsource-gate', 'direct_libav_baseline.exe');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const environment = {
  ...process.env,
  PATH: [
    path.join(spikeRoot, '.deps', 'bestsource-install', 'bin'),
    path.join(releaseRoot, 'bin'),
    'C:\\cygwin64\\usr\\x86_64-w64-mingw32\\sys-root\\mingw\\bin',
    process.env.PATH,
  ].join(';'),
};

if (warmOnly && resetIndexes) {
  throw new Error('--warm-only cannot be combined with --reset-indexes.');
}
if (resume && resetIndexes) {
  throw new Error('--resume continues the existing checkpoint and cannot reset indexes again.');
}
if (renderOnly && (resetIndexes || fixturesOnly || mediaOnly || resume || warmOnly ||
    mediaLimit !== null || mediaConcurrency !== 1)) {
  throw new Error('--render-only cannot be combined with execution options.');
}

await mkdir(path.dirname(artifactPath), { recursive: true });
if (resetIndexes) {
  await rm(indexRoot, { recursive: true, force: true });
  await rm(checkpointPath, { force: true });
}
await mkdir(indexRoot, { recursive: true });

const fixtureManifest = JSON.parse(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
const inventory = fixturesOnly ? { groups: [] } :
  JSON.parse(await readFile(path.join(spikeRoot, 'artifacts', 'media-inventory.json'), 'utf8'));
const dependencyManifest = JSON.parse(await readFile(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
const prior = await readJsonIfExists(artifactPath) ?? { schemaVersion: 1, runs: [] };
if (renderOnly) {
  if (!prior.runs.length) throw new Error('No BestSource gate run exists to render.');
  await writeFile(reportPath, renderReport(prior));
  console.log(`Rendered ${reportPath}`);
  process.exit(0);
}
let checkpoint = resume ? await readJsonIfExists(checkpointPath) : null;
if (resume && !checkpoint) {
  throw new Error('--resume found no BestSource gate checkpoint.');
}
if (!checkpoint) {
  checkpoint = { schemaVersion: 1, resetIndexes, mediaResults: [] };
}

const run = {
  startedAtUtc: runStarted.toISOString(),
  completedAtUtc: null,
  mode: warmOnly ? 'warm-only' : fixturesOnly ? 'fixtures-only' : mediaOnly ? 'media-only' : 'full',
  resetIndexes: checkpoint.resetIndexes,
  dependencies: Object.fromEntries(Object.entries(dependencyManifest.dependencies)
    .filter(([, value]) => value.conditionalMilestone === 3)
    .map(([name, value]) => [name, { version: value.version, commit: value.commit ?? null, license: value.license }])),
  settings: {
    compiler: dependencyManifest.toolchain.bestSourceCompiler,
    triplet: dependencyManifest.toolchain.bestSourceTriplet,
    ffmpegX86Assembly: dependencyManifest.toolchain.bestSourceFfmpegX86Assembly,
    cacheBytes: 256 * 1024 * 1024,
    decoderInstances: 2,
    mediaConcurrency,
    seekPreRollFrames: 20,
    hardwareDecode: false,
  },
  fixtureResults: [],
  malformed: null,
  cancellation: null,
  forcedTermination: null,
  directLibavBaselines: [],
  mediaResults: [],
  decision: null,
};

if (!mediaOnly) {
  console.log('Running exact BestSource fixture suites...');
  for (const fixture of fixtureManifest.fixtures.filter((candidate) => !candidate.expectedFailure)) {
    const cache = path.join(indexRoot, 'fixtures', fixture.id);
    const indexExistedBefore = await bestSourceIndexExists(cache);
    const first = await runHarness('suite', fixture.path, cache, null, 120_000);
    const reopen = await runHarness('suite', fixture.path, cache, null, 120_000);
    const evaluation = evaluateFixture(fixture, first.events);
    const reopenEvaluation = evaluateFixture(fixture, reopen.events);
    const persistence = compareIdentityMaps(first.events, reopen.events);
    const result = {
      id: fixture.id,
      path: fixture.path,
      indexExistedBefore,
      first: summarizeExecution(first),
      reopen: summarizeExecution(reopen),
      evaluation,
      reopenEvaluation,
      persistence,
      passed: first.completed && reopen.completed && evaluation.pass && reopenEvaluation.pass && persistence.pass,
    };
    run.fixtureResults.push(result);
    console.log(`${fixture.id}: ${result.passed ? 'PASS' : 'FAIL'}; index ${result.first.constructorMs?.toFixed(1) ?? '?'} ms, reopen ${result.reopen.constructorMs?.toFixed(1) ?? '?'} ms`);
  }

  const malformedFixture = fixtureManifest.fixtures.find((candidate) => candidate.expectedFailure);
  const malformed = await runHarness('probe', malformedFixture.path,
    path.join(indexRoot, 'disposable', 'malformed'), null, 30_000);
  run.malformed = {
    passed: !malformed.completed && Boolean(malformed.error),
    error: malformed.error,
    exitCode: malformed.exitCode,
  };

  const cancellationCache = path.join(indexRoot, 'disposable', 'cancel');
  await rm(`${cancellationCache}.0.bsindex`, { force: true });
  const canceled = await runHarness('cancel', fixtureManifest.fixtures[0].path, cancellationCache, null, 30_000);
  const cancellationRecovery = await runHarness('probe', fixtureManifest.fixtures[0].path,
    cancellationCache, '0', 30_000);
  run.cancellation = {
    passed: !canceled.completed && canceled.error?.includes('canceled') && cancellationRecovery.completed,
    error: canceled.error,
    partialIndexAccepted: await exists(`${cancellationCache}.0.bsindex`) && !cancellationRecovery.completed,
    recovery: summarizeExecution(cancellationRecovery),
  };

  const killCache = path.join(indexRoot, 'disposable', 'killed');
  await rm(`${killCache}.0.bsindex`, { force: true });
  const killed = await killDuringIndex(fixtureManifest.fixtures[0].path, killCache);
  const killRecovery = await runHarness('probe', fixtureManifest.fixtures[0].path, killCache, '0', 30_000);
  run.forcedTermination = {
    passed: killed.killed && !killed.indexExistsAfterKill && killRecovery.completed,
    ...killed,
    recovery: summarizeExecution(killRecovery),
  };

  for (const fixture of fixtureManifest.fixtures.filter((candidate) =>
    ['cfr-ffv1', 'bframes-long-gop', 'vfr-ffv1'].includes(candidate.id))) {
    run.directLibavBaselines.push({ id: fixture.id, ...(await runDirectBaseline(fixture.path)) });
  }
}

if (!fixturesOnly) {
  const groups = mediaLimit === null ? inventory.groups : inventory.groups.slice(0, mediaLimit);
  const cached = new Map(checkpoint.mediaResults.map((result) => [result.id, result]));
  let checkpointWrite = Promise.resolve();
  let completed = 0;
  console.log(`Running BestSource coverage on ${groups.length} media signature representative(s)...`);
  run.mediaResults = await mapWithConcurrency(groups, mediaConcurrency, async (group) => {
    if (resume && cached.has(group.id)) {
      completed += 1;
      console.log(`${group.id}: resumed checkpoint (${completed}/${groups.length})`);
      return cached.get(group.id);
    }
    const cache = path.join(indexRoot, 'media', group.id);
    const indexExistedBefore = await bestSourceIndexExists(cache);
    if (warmOnly && !indexExistedBefore) {
      const error = 'Warm-only gate found no valid persistent index from the first run.';
      const unavailable = { completed: false, events: [], frames: [], error, exitCode: null, stderr: '' };
      const result = {
        id: group.id,
        signature: group.signature,
        path: group.representativePath,
        indexExistedBefore,
        first: summarizeExecution(unavailable),
        reopen: summarizeExecution(unavailable),
        stability: { pass: false, leftCount: 0, rightCount: 0 },
        passed: false,
        error,
      };
      cached.set(result.id, result);
      checkpoint.mediaResults = [...cached.values()];
      const checkpointJson = `${JSON.stringify(checkpoint, null, 2)}\n`;
      checkpointWrite = checkpointWrite.then(() => writeFile(checkpointPath, checkpointJson));
      await checkpointWrite;
      completed += 1;
      console.log(`${group.id}: NO INDEX (${completed}/${groups.length})`);
      return result;
    }
    const first = await runHarness('probe', group.representativePath, cache, null, 30 * 60_000);
    const reopen = first.completed
      ? await runHarness('probe', group.representativePath, cache, null, 5 * 60_000)
      : { completed: false, events: [], frames: [], error: 'first open failed', exitCode: null, stderr: '' };
    const stability = compareIdentityMaps(first.events, reopen.events);
    const slowFrames = reopen.frames.filter((frame) => frame.latencyMs > warmAccessTargetMs);
    const performanceDiagnostics = slowFrames.length
      ? await collectPerformanceDiagnostics(group.representativePath, cache, slowFrames)
      : null;
    const result = {
      id: group.id,
      signature: group.signature,
      path: group.representativePath,
      indexExistedBefore,
      first: summarizeExecution(first),
      reopen: summarizeExecution(reopen),
      performanceDiagnostics,
      stability,
      passed: first.completed && reopen.completed && first.frames.length === 3 &&
        reopen.frames.length === 3 && first.frames.every((frame) => frame.originalFrame === frame.requestedFrame) &&
        stability.pass,
      error: first.error ?? reopen.error,
    };
    cached.set(result.id, result);
    checkpoint.mediaResults = [...cached.values()];
    const checkpointJson = `${JSON.stringify(checkpoint, null, 2)}\n`;
    checkpointWrite = checkpointWrite.then(() => writeFile(checkpointPath, checkpointJson));
    await checkpointWrite;
    completed += 1;
    console.log(`${group.id}: ${result.passed ? 'PASS' : 'FAIL'}; index ${result.first.constructorMs?.toFixed(0) ?? '?'} ms, reopen ${result.reopen.constructorMs?.toFixed(0) ?? '?'} ms (${completed}/${groups.length})`);
    return result;
  });
}

const requiredMediaCount = fixturesOnly ? 0 : inventory.groups.length;
run.decision = assessBestSourceGate(run, requiredMediaCount);
run.completedAtUtc = new Date().toISOString();
prior.runs.push(run);
await writeFile(artifactPath, `${JSON.stringify(prior, null, 2)}\n`);
await writeFile(reportPath, renderReport(prior));
await rm(checkpointPath, { force: true });
console.log(`BestSource gate complete: C2 ${gateStatus(run.decision).toUpperCase()}.`);
if (fixturesOnly) {
  const passed = run.decision.fixturePass && run.decision.failurePass;
  console.log(`Fixture-only regression: ${passed ? 'PASS' : 'FAIL'} (does not re-evaluate full-media coverage).`);
  if (!passed) process.exitCode = 1;
}

async function runHarness(mode, movie, cache, frames, timeoutMs, environmentOverrides = {}) {
  await mkdir(path.dirname(cache), { recursive: true });
  const commandArgs = [mode, movie, cache];
  if (frames !== null) commandArgs.push(frames);
  try {
    const result = await execute(harness, commandArgs, {
      cwd: spikeRoot,
      env: { ...environment, ...environmentOverrides },
      timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    const events = parseJsonLines(result.stdout);
    return normalizeExecution(events, 0, result.stderr);
  } catch (error) {
    const events = parseEventsLenient(error.stdout);
    return normalizeExecution(events, error.code ?? error.signal ?? 1, error.stderr, conciseError(error));
  }
}

async function collectPerformanceDiagnostics(movie, cache, slowFrames) {
  const requestedFrames = [...new Set(slowFrames.map((frame) => frame.requestedFrame))];
  const indexRun = await runHarness('hash-diagnostics', movie, cache, null, 5 * 60_000);
  const debugRun = await runHarness(
    'probe', movie, cache, requestedFrames.join(','), 5 * 60_000, { BESTSOURCE_GATE_DEBUG: '1' },
  );
  return {
    thresholdMs: warmAccessTargetMs,
    requestedFrames,
    index: indexRun.events.find((event) => event.type === 'hash-diagnostics') ?? null,
    indexError: indexRun.error,
    debug: summarizeBestSourceDebug(debugRun.stderr),
    probe: summarizeExecution(debugRun),
  };
}

function normalizeExecution(events, exitCode, stderr, fallbackError = null) {
  const source = events.find((event) => event.type === 'source');
  const complete = events.findLast((event) => event.type === 'complete');
  const reportedError = events.findLast((event) => event.type === 'error');
  return {
    completed: Boolean(source && complete && !reportedError),
    events,
    source,
    frames: events.filter((event) => event.type === 'frame'),
    complete,
    error: reportedError?.message ?? fallbackError,
    exitCode,
    stderr: String(stderr ?? ''),
  };
}

function summarizeExecution(execution) {
  return {
    completed: execution.completed,
    error: execution.error,
    exitCode: execution.exitCode,
    constructorMs: execution.source?.constructorMs ?? null,
    numFrames: execution.source?.numFrames ?? null,
    p50AccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 0.5),
    p95AccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 0.95),
    maxAccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 1),
    p95GetFrameMs: percentile(execution.frames.map((frame) => frame.getFrameMs), 0.95),
    p95ConversionMs: percentile(execution.frames.map((frame) => frame.conversionMs), 0.95),
    p95AnalysisMs: percentile(execution.frames.map((frame) => frame.analysisMs), 0.95),
    peakWorkingSetBytes: execution.complete?.peakWorkingSetBytes ?? null,
    identities: execution.frames.map((frame) => ({
      requestedFrame: frame.requestedFrame,
      originalFrame: frame.originalFrame,
      pts: frame.pts,
      duration: frame.duration,
      timebase: frame.timebase,
      rgbaHash: frame.rgbaHash,
      frameInfoHash: frame.frameInfoHash,
      latencyMs: frame.latencyMs,
      getFrameMs: frame.getFrameMs,
      conversionMs: frame.conversionMs,
      analysisMs: frame.analysisMs,
      previousKeyframe: frame.previousKeyframe,
      framesSincePreviousKeyframe: frame.framesSincePreviousKeyframe,
      previousSeekKeyframe: frame.previousSeekKeyframe,
      framesSincePreviousSeekKeyframe: frame.framesSincePreviousSeekKeyframe,
    })),
  };
}

async function runDirectBaseline(movie) {
  try {
    const result = await execute(baselineHarness, [movie], {
      cwd: spikeRoot, env: environment, timeoutMs: 120_000,
    });
    return { passed: true, ...JSON.parse(result.stdout.trim()) };
  } catch (error) {
    return { passed: false, error: conciseError(error) };
  }
}

async function killDuringIndex(movie, cache) {
  return new Promise((resolve, reject) => {
    const child = spawn(harness, ['probe', movie, cache, '0'], {
      cwd: spikeRoot,
      env: { ...environment, BESTSOURCE_GATE_PROGRESS_DELAY_MS: '25' },
      windowsHide: true,
    });
    let output = '';
    let killed = false;
    const timer = setTimeout(() => {
      if (!killed) child.kill();
    }, 5_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (!killed && output.includes('"type":"index-progress"')) {
        killed = child.kill();
      }
    });
    child.on('error', reject);
    child.on('close', async (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        killed,
        exitCode,
        signal,
        indexExistsAfterKill: await exists(`${cache}.0.bsindex`),
      });
    });
  });
}

function renderReport(raw) {
  const latest = fixturesOnly ? raw.runs.at(-1) :
    raw.runs.findLast((candidate) => candidate.mediaResults.length > 0) ?? raw.runs.at(-1);
  const decision = assessBestSourceGate(latest, latest.mediaResults.length);
  const allFixtures = latest.fixtureResults;
  const media = latest.mediaResults;
  const currentScope = summarizeCurrentScope(media, inventory.groups);
  const warmReport = latest.mode === 'warm-only';
  const openLabel = warmReport ? 'Warm open ms' : 'Open/index ms';
  const cleanRun = [...raw.runs].reverse().find((candidate) =>
    candidate.mode === 'full' && candidate.resetIndexes === true &&
    candidate.mediaResults.length === inventory.groups.length);
  const cleanIndexFailures = cleanRun?.mediaResults.filter((result) =>
    !result.passed || result.first.constructorMs === null ||
    result.first.constructorMs === undefined || result.first.constructorMs > 10 * 60_000) ?? [];
  const cleanIndexPass = Boolean(cleanRun && cleanIndexFailures.length === 0);
  const cleanIndexRows = cleanIndexFailures.map((result) => {
    const indexMinutes = result.first.constructorMs === null || result.first.constructorMs === undefined
      ? null : result.first.constructorMs / 60_000;
    return `| ${result.id} | ${number(indexMinutes)} | ${mb(result.first.peakWorkingSetBytes)} | ${path.basename(result.path)} |`;
  }).join('\n');
  const fixtureRows = allFixtures.map((result) =>
    `| ${result.id} | ${result.passed ? 'pass' : 'fail'} | ${yesNo(result.indexExistedBefore)} | ${number(result.first.constructorMs)} | ${number(result.reopen.constructorMs)} | ${number(result.first.p95AccessMs)} | ${yesNo(result.persistence.pass)} |`).join('\n');
  const mediaRows = media.map((result) =>
    `| ${result.id} | ${result.passed ? 'pass' : 'fail'} | ${number(result.first.constructorMs)} | ${number(result.reopen.constructorMs)} | ${number(result.reopen.p95AccessMs)} | ${mb(result.first.peakWorkingSetBytes)} | ${reportError(result)} |`).join('\n');
  const diagnosticRows = media.flatMap((result) => {
    const diagnostics = result.performanceDiagnostics;
    if (!diagnostics) return [];
    const slowest = diagnostics.probe.identities.reduce(
      (current, frame) => !current || frame.latencyMs > current.latencyMs ? frame : current,
      null,
    );
    return [`| ${result.id} | ${diagnostics.requestedFrames.join(', ')} | ${number(slowest?.latencyMs)} | ${number(slowest?.getFrameMs)} | ${number(slowest?.conversionMs)} | ${number(slowest?.analysisMs)} | ${slowest?.framesSincePreviousKeyframe ?? ''} | ${diagnostics.index?.duplicateWindowValues ?? ''} | ${diagnostics.index?.maxKeyframeGapFrames ?? ''} | ${diagnostics.debug.retryCount} | ${diagnostics.debug.linearFallbackCount} |`];
  }).join('\n');
  const baselines = latest.directLibavBaselines.map((result) =>
    `| ${result.id} | ${result.passed ? 'pass' : 'fail'} | ${number(result.sequentialMs)} | ${result.sequentialFrames ?? ''} | ${number(result.seekAndDecodeForwardMs)} | ${result.decodedFramesAfterSeek ?? ''} |`).join('\n');
  return `# BestSource Exact-Frame Gate Results

Generated ${latest.completedAtUtc} on Windows x64. This report is generated by \`scripts/run-bestsource-gate.mjs\`.

## Decision

**${decision.c2Pass ? 'C2 passes the Milestone 3 gate.' : decision.completeEvidence ? 'C2 fails the Milestone 3 gate.' : 'C2 is not yet proved by this run.'}**

- Deterministic exact-frame fixtures: **${decision.fixturePass ? 'pass' : 'fail'}**
- Malformed/cancel/forced-termination handling: **${decision.failurePass ? 'pass' : 'fail'}**
- Required media-signature coverage: **${decision.mediaPass ? 'pass' : 'fail'}** (${media.filter((result) => result.passed).length}/${media.length})
- Warm three-probe exact access at or below 750 ms p95: **${decision.warmRandomAccessPass ? 'pass' : 'fail'}**
- Clean full-movie initial indexing at or below ten minutes: **${cleanRun ? cleanIndexPass ? 'pass' : 'fail' : 'not measured'}**${cleanRun ? ` (${cleanRun.mediaResults.length - cleanIndexFailures.length}/${cleanRun.mediaResults.length}; clean run ${cleanRun.startedAtUtc})` : ''}
- Complete matrix evidence: **${yesNo(decision.completeEvidence)}**

The coded fixtures provide an independent picture and timestamp oracle. Real movies do not contain the burned frame code, so their coverage result means BestSource fully indexed the source, rendered start/middle/end by exact frame number, and returned the same identities and pixels after reopening the persistent index. It is not described as independent picture-oracle verification.

This table is from a **${latest.mode}** run.${warmReport ? ' It reuses persistent indexes and therefore measures warm open and exact access, not initial indexing.' : ''} Media access uses the immediate persistent-index reopen so indexing work is excluded from the warm seek measurement. See [the failure analysis](bestsource-failure-analysis.md) for interpretation.

## Current Scope

The current matrix has **${inventory.groups.length}** signatures. **${currentScope.matched}** exact representatives were measured here: **${currentScope.passed}** passed and **${currentScope.failed}** failed. **${currentScope.untested.length}** current representative is untested${currentScope.untested.length ? `: ${currentScope.untested.map((item) => `\`${item}\``).join(', ')}` : ''}.

## Clean Initial Indexing

${cleanRun ? `The latest clean full run started ${cleanRun.startedAtUtc} and indexed all ${cleanRun.mediaResults.length} representatives. The table lists only sources that exceeded the signed ten-minute target or failed to index.` : 'No clean full run exists for the current matrix.'}

| ID | Initial index min | Peak RSS | Representative |
| --- | ---: | ---: | --- |
${cleanIndexRows || '| none | | | |'}

## Native Stack

- BestSource: \`${latest.dependencies.bestsource.version}\`
- FFmpeg: \`${latest.dependencies.ffmpeg.version}\` (libavcodec/libavformat 63.1.100, libavutil 61.1.100)
- dav1d: \`${latest.dependencies.dav1d.version}\`
- libp2p: \`${latest.dependencies.libp2p.commit}\`
- xxHash: \`${latest.dependencies.xxhash.version}\`
- Compiler: \`${latest.settings.compiler}\`; release-only dynamic MinGW build
- FFmpeg x86 assembly: ${latest.settings.ffmpegX86Assembly ? 'enabled through a pinned NASM path-translation wrapper' : 'disabled'}
- BestSource settings: ${latest.settings.decoderInstances} decoders, ${mb(latest.settings.cacheBytes)} frame cache, ${latest.settings.seekPreRollFrames}-frame preroll, software decoding
- Gate process concurrency: ${latest.settings.mediaConcurrency ?? 2} media source(s); one source is the product-equivalent performance setting

The reproducible final-stack bootstrap took about nine minutes on this machine, including FFmpeg, dav1d, xxHash, BestSource, and both harnesses.

## Exact Fixtures

| Fixture | Result | Index existed | ${openLabel} | Reopen ms | Access p95 ms | Identity stable |
| --- | --- | --- | ---: | ---: | ---: | --- |
${fixtureRows || '| n/a | n/a | n/a | n/a | n/a | n/a | n/a |'}

Each suite requests every frame forward and reverse, alternates direction around the midpoint, shuffles random frames with neighbors, repeats one frame, and revisits both boundaries. Frame index, source code, integer PTS, timebase, duration, normalized RGBA hash, and BestSource's source-frame hash are checked.

## Failure Paths

- Malformed source: **${latest.malformed?.passed ? 'pass' : 'not run/fail'}**; ${latest.malformed?.error ?? 'not run'}
- Cooperative cancellation: **${latest.cancellation?.passed ? 'pass' : 'not run/fail'}**; partial index accepted: ${yesNo(latest.cancellation?.partialIndexAccepted)}
- Forced process termination: **${latest.forcedTermination?.passed ? 'pass' : 'not run/fail'}**; index existed after kill: ${yesNo(latest.forcedTermination?.indexExistsAfterKill)}

Both interrupted cases are followed by a clean reopen. A partial index must not be accepted.

## Direct libav Baseline

This is deliberately not an exact-frame implementation. It measures sequential decode and keyframe seek plus decode-forward only.

| Fixture | Result | Sequential ms | Frames | Seek/decode-forward ms | Frames after seek |
| --- | --- | ---: | ---: | ---: | ---: |
${baselines || '| n/a | n/a | n/a | n/a | n/a | n/a |'}

## Media Coverage

| ID | Result | ${openLabel} | Reopen ms | Access p95 ms | Peak RSS | Error |
| --- | --- | ---: | ---: | ---: | ---: | --- |
${mediaRows || '| n/a | n/a | n/a | n/a | n/a | n/a | n/a |'}

## Slow-Access Diagnostics

For each reopened source whose three-probe p95 exceeded 750 ms, the gate reran the slow frame(s)
with BestSource debug output and scanned the complete index for keyframe gaps and duplicate
ten-frame hash sequences. \`GetFrame\` includes seek and decode; conversion and analysis happen after
BestSource returns the frame.

| ID | Frames | Total ms | GetFrame ms | Convert ms | Analyze ms | Frames after flagged keyframe | Duplicate 10-frame sequences | Max flagged-keyframe gap | Seek retries | Linear fallbacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${diagnosticRows || '| none | | | | | | | | | | |'}

## Run History

${raw.runs.map((candidate, index) => `- Run ${index + 1}: ${candidate.startedAtUtc}; mode: ${candidate.mode}; reset indexes: ${yesNo(candidate.resetIndexes)}; C2: ${gateStatus(assessBestSourceGate(candidate, candidate.mediaResults.length))}`).join('\n')}
`;
}

function summarizeCurrentScope(historicalResults, currentGroups) {
  const normalizedPath = (value) => path.resolve(value).toLowerCase();
  const byPath = new Map(historicalResults.map((result) => [normalizedPath(result.path), result]));
  const matchedResults = currentGroups.flatMap((group) => {
    const result = byPath.get(normalizedPath(group.representativePath));
    return result ? [result] : [];
  });
  return {
    matched: matchedResults.length,
    passed: matchedResults.filter((result) => result.passed).length,
    failed: matchedResults.filter((result) => !result.passed).length,
    untested: currentGroups.filter((group) => !byPath.has(normalizedPath(group.representativePath)))
      .map((group) => path.basename(group.representativePath)),
  };
}

function gateStatus(decision) {
  if (decision.c2Pass) return 'pass';
  return decision.completeEvidence ? 'fail' : 'not proved';
}

function reportError(result) {
  if (result.first.exitCode === 0xC0000374) return 'Windows heap corruption (0xC0000374)';
  return result.error ?? '';
}

function parseEventsLenient(output) {
  return String(output ?? '').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

async function readJsonIfExists(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function exists(file) {
  try { await stat(file); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function bestSourceIndexExists(cacheBase) {
  const directory = path.dirname(cacheBase);
  const prefix = `${path.basename(cacheBase)}.`;
  try {
    const entries = await readdir(directory);
    return entries.some((entry) => entry.startsWith(prefix) && entry.endsWith('.bsindex'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} requires a positive integer.`);
  return value;
}

function conciseError(error) {
  return String(error?.message ?? error).split(/\r?\n/)[0];
}

function number(value) { return value === null || value === undefined ? '' : Number(value).toFixed(2); }
function mb(value) { return value === null || value === undefined ? '' : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function yesNo(value) { return value ? 'yes' : 'no'; }
