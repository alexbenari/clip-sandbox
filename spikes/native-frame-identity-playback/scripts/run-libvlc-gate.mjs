import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { execute, mapWithConcurrency } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const resolved = parseJson(await readFile(path.join(spikeRoot, '.deps', 'resolved-dependencies.json'), 'utf8'));
const fixturesManifest = parseJson(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
const inventory = parseJson(await readFile(path.join(spikeRoot, 'artifacts', 'media-inventory.json'), 'utf8'));
const harness = path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_gate.exe');
const textureProbe = path.join(spikeRoot, 'build', 'windows-x64', 'libvlc_texture_probe.exe');
const environment = {
  ...process.env,
  PATH: `${resolved.libvlc.root};${process.env.PATH}`,
  VLC_PLUGIN_PATH: resolved.libvlc.plugins,
};

console.log('Running LibVLC exact fixture operations...');
const fixtureResults = [];
for (const fixture of fixturesManifest.fixtures.filter((candidate) => !candidate.expectedFailure)) {
  const execution = await runHarness('fixture', fixture.path, 45_000, fixtureStartTimeUs(fixture));
  const reopenExecution = await runHarness('smoke', fixture.path, 20_000);
  const evaluation = evaluateFixture(fixture, execution, reopenExecution);
  fixtureResults.push({ id: fixture.id, path: fixture.path, execution, reopenExecution, evaluation });
  console.log(`${fixture.id}: ${evaluation.operationScriptPass ? 'operations-pass' : 'operations-fail'}, identity=${evaluation.canonicalIdentityExposed ? 'pass' : 'fail'}`);
}

const malformed = fixturesManifest.fixtures.find((candidate) => candidate.expectedFailure);
const malformedExecution = await runHarness('smoke', malformed.path, 20_000);
fixtureResults.push({
  id: malformed.id,
  path: malformed.path,
  execution: malformedExecution,
  evaluation: {
    relativeSteppingPass: false,
    canonicalIdentityExposed: false,
    expectedFailureReported: !malformedExecution.completed,
    reasons: malformedExecution.completed ? ['Malformed source unexpectedly displayed a frame.'] : [],
  },
});

console.log(`Running first-frame coverage on ${inventory.groups.length} representative signature(s)...`);
let mediaCompleted = 0;
const mediaResults = await mapWithConcurrency(inventory.groups, 2, async (group) => {
  const execution = await runHarness('smoke', group.representativePath, 25_000);
  mediaCompleted += 1;
  if (mediaCompleted % 10 === 0 || mediaCompleted === inventory.groups.length) {
    console.log(`Media coverage ${mediaCompleted}/${inventory.groups.length}`);
  }
  return {
    id: group.id,
    signature: group.signature,
    path: group.representativePath,
    passed: execution.completed && execution.observations.length >= 1,
    error: execution.error,
    firstFrameLatencyMs: execution.observations[0]?.latencyMs ?? null,
    stderr: execution.stderr,
  };
});

let textureResult;
try {
  const textureExecution = await execute(textureProbe, [resolved.libvlc.dll], {
    cwd: spikeRoot, env: environment, timeoutMs: 15_000,
  });
  textureResult = { completed: true, ...JSON.parse(textureExecution.stdout.trim()), stderr: textureExecution.stderr };
} catch (error) {
  textureResult = { completed: false, error: conciseError(error), stderr: String(error.stderr ?? '') };
}

const fixtureRelativePass = fixtureResults
  .filter((result) => result.id !== malformed.id)
  .every((result) => result.evaluation.relativeSteppingPass);
const fixtureOperationPass = fixtureResults
  .filter((result) => result.id !== malformed.id)
  .every((result) => result.evaluation.operationScriptPass);
const malformedPass = fixtureResults.find((result) => result.id === malformed.id).evaluation.expectedFailureReported;
const coveragePass = mediaResults.every((result) => result.passed);
const canonicalIdentityExposed = false;
const c1Pass = fixtureOperationPass && malformedPass && coveragePass && canonicalIdentityExposed;
const raw = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  libvlc: resolved.libvlc,
  identitySurfaceAudit: {
    canonicalIdentityExposed,
    publicWatchTimeFields: ['position', 'rate', 'ts_us', 'length_us', 'system_date_us'],
    missingRequiredFields: ['presentation-order frame index', 'source PTS ticks', 'source timebase', 'source frame duration'],
    conclusion: 'Public output and watch-time callbacks do not atomically carry canonical source-frame identity.',
  },
  fixtureResults,
  mediaResults,
  textureResult,
  decision: {
    fixtureRelativePass,
    fixtureOperationPass,
    malformedPass,
    coveragePass,
    canonicalIdentityExposed,
    c1Pass,
    nextPath: c1Pass ? 'C1' : 'C2-provisional-requires-BestSource-gate',
  },
};

await writeFile(path.join(spikeRoot, 'artifacts', 'libvlc-gate-raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
await writeFile(path.join(spikeRoot, 'docs', 'libvlc-gate-results.md'), renderReport(raw));
await updateMediaMatrix(mediaResults);
console.log(`LibVLC gate complete: C1 ${c1Pass ? 'PASS' : 'FAIL'}; ${mediaResults.filter((result) => result.passed).length}/${mediaResults.length} representatives displayed a frame.`);

async function runHarness(mode, moviePath, timeoutMs, fixtureStartUs = null) {
  const args = [mode, resolved.libvlc.dll, moviePath];
  if (fixtureStartUs !== null) args.push(fixtureStartUs);
  try {
    const result = await execute(harness, args, {
      cwd: spikeRoot, env: environment, timeoutMs, maxBuffer: 32 * 1024 * 1024,
    });
    const events = parseEvents(result.stdout);
    const summary = events.findLast((event) => event.type === 'summary');
    return {
      completed: summary?.result === 'completed',
      error: summary?.error ?? null,
      observations: events.filter((event) => event.type === 'observation'),
      statuses: events.filter((event) => event.type === 'status'),
      seekRequests: events.filter((event) => event.type === 'seek-request'),
      stderr: String(result.stderr ?? ''),
    };
  } catch (error) {
    const events = parseEvents(String(error.stdout ?? ''));
    const summary = events.findLast((event) => event.type === 'summary');
    return {
      completed: false,
      error: summary?.error ?? conciseError(error),
      observations: events.filter((event) => event.type === 'observation'),
      statuses: events.filter((event) => event.type === 'status'),
      seekRequests: events.filter((event) => event.type === 'seek-request'),
      stderr: String(error.stderr ?? ''),
    };
  }
}

function fixtureStartTimeUs(fixture) {
  const pts = BigInt(fixture.frames[0].pts);
  const numerator = BigInt(fixture.timebase.numerator);
  const denominator = BigInt(fixture.timebase.denominator);
  return ((pts * numerator * 1_000_000n) / denominator).toString();
}

function evaluateFixture(fixture, execution, reopenExecution) {
  const expectedNextCount = 12;
  const expectedPreviousCount = 6;
  const reasons = [];
  const play = execution.observations.find((event) => event.operation === 'play-first');
  const pausePrime = execution.observations.find((event) => event.operation === 'pause-prime');
  const next = execution.observations.filter((event) => event.operation === 'next');
  const previous = execution.observations.filter((event) => event.operation === 'previous');
  const alternateNext = execution.observations.filter((event) => event.operation === 'alternate-next');
  const alternatePrevious = execution.observations.filter((event) => event.operation === 'alternate-previous');
  const seeks = execution.observations.filter((event) => event.operation === 'seek-middle');
  const randomSeek = execution.observations.find((event) => event.operation === 'seek-random');
  const seekNext = execution.observations.find((event) => event.operation === 'seek-next');
  const seekPrevious = execution.observations.find((event) => event.operation === 'seek-previous');
  const seekStart = execution.observations.find((event) => event.operation === 'seek-start');
  const seekEnd = execution.observations.find((event) => event.operation === 'seek-end');
  const endNext = execution.observations.find((event) => event.operation === 'end-next');
  const reopened = reopenExecution.observations.find((event) => event.operation === 'play-first');
  if (!execution.completed) reasons.push(execution.error ?? 'Harness did not complete.');
  if (!play?.codeValid) reasons.push('First displayed picture did not preserve the fixture code.');
  if (!pausePrime?.codeValid || ![-11, 0].includes(pausePrime.status)) {
    reasons.push(`pause prime failed with code ${pausePrime?.sourceCode ?? 'none'} and status ${pausePrime?.status ?? 'none'}`);
  }
  if (next.length !== expectedNextCount) {
    reasons.push(`next expected ${expectedNextCount} observations, received ${next.length}`);
  }
  for (let index = 0; index < next.length; index += 1) {
    const expected = (pausePrime?.sourceCode ?? Number.NaN) + index + 1;
    if (next[index].status !== 0 || next[index].sourceCode !== expected) {
      reasons.push(`next ${index} expected code ${expected}, observed ${next[index].sourceCode} status ${next[index].status}`);
    }
  }
  const nextLast = next.at(-1)?.sourceCode;
  if (previous.length !== expectedPreviousCount) {
    reasons.push(`previous expected ${expectedPreviousCount} observations, received ${previous.length}`);
  }
  for (let index = 0; index < previous.length; index += 1) {
    const expected = nextLast - index - 1;
    if (previous[index].status !== 0 || previous[index].sourceCode !== expected) {
      reasons.push(`previous ${index} expected code ${expected}, observed ${previous[index].sourceCode} status ${previous[index].status}`);
    }
  }
  if (alternateNext.length !== 3 || alternatePrevious.length !== 3) {
    reasons.push(`alternate expected 3 forward/back pairs, received ${alternateNext.length}/${alternatePrevious.length}`);
  }
  const alternateAnchor = previous.at(-1)?.sourceCode;
  for (let index = 0; index < Math.min(alternateNext.length, alternatePrevious.length); index += 1) {
    if (alternateNext[index].status !== 0 || alternateNext[index].sourceCode !== alternateAnchor + 1
      || alternatePrevious[index].status !== 0 || alternatePrevious[index].sourceCode !== alternateAnchor) {
      reasons.push(`alternate ${index} did not return ${alternateAnchor} -> ${alternateAnchor + 1} -> ${alternateAnchor}`);
    }
  }
  for (const seek of seeks) {
    const request = execution.seekRequests.find((candidate) => candidate.operation === seek.operation
      && candidate.operationIndex === seek.operationIndex);
    if (!request || !isExpectedSeekPicture(fixture, request.targetTimeUs, seek.sourceCode)) {
      const expected = request ? expectedSeekCodes(fixture, request.targetTimeUs).join('/') : 'unknown';
      reasons.push(`seek ${seek.operationIndex} expected ${expected}, observed ${seek.sourceCode}`);
    }
  }
  const randomRequest = execution.seekRequests.find((candidate) => candidate.operation === 'seek-random');
  if (randomSeek) {
    if (!randomRequest || !isExpectedSeekPicture(fixture, randomRequest.targetTimeUs, randomSeek.sourceCode)) {
      const expected = randomRequest ? expectedSeekCodes(fixture, randomRequest.targetTimeUs).join('/') : 'unknown';
      reasons.push(`random seek expected ${expected}, observed ${randomSeek.sourceCode}`);
    }
    if (!seekNext || seekNext.status !== 0 || seekNext.sourceCode !== randomSeek.sourceCode + 1) {
      reasons.push(`seek-next expected ${randomSeek.sourceCode + 1}, observed ${seekNext?.sourceCode ?? 'none'}`);
    }
    if (!seekPrevious || seekPrevious.status !== 0 || seekPrevious.sourceCode !== randomSeek.sourceCode) {
      reasons.push(`seek-previous expected ${randomSeek.sourceCode}, observed ${seekPrevious?.sourceCode ?? 'none'}`);
    }
  }
  if (execution.completed) {
    if (!randomSeek) reasons.push('random seek operation was not observed');
    const acceptedStartCodes = fixture.frames.slice(0, 2).map((frame) => frame.sourceCode);
    if (!acceptedStartCodes.includes(seekStart?.sourceCode)) {
      reasons.push(`start seek expected one of ${acceptedStartCodes.join('/')}, observed ${seekStart?.sourceCode ?? 'none'}`);
    }
    const acceptedNearEndCodes = fixture.frames.slice(-4).map((frame) => frame.sourceCode);
    if (!acceptedNearEndCodes.includes(seekEnd?.sourceCode)) {
      reasons.push(`near-end seek expected one of ${acceptedNearEndCodes.join('/')}, observed ${seekEnd?.sourceCode ?? 'none'}`);
    }
    if (endNext?.sourceCode !== fixture.frames.at(-1).sourceCode) {
      reasons.push(`final next expected ${fixture.frames.at(-1).sourceCode}, observed ${endNext?.sourceCode ?? 'none'}`);
    }
    const boundaryStatuses = execution.statuses.filter((event) => ['previous-at-start', 'next-at-end'].includes(event.operation));
    if (boundaryStatuses.length !== 2) reasons.push(`boundary expected 2 terminal statuses, received ${boundaryStatuses.length}`);
  } else {
    reasons.push('Operations after the reported harness failure were not evaluated.');
  }
  if (!reopenExecution.completed || !reopened?.codeValid || reopened.sourceCode !== play?.sourceCode) {
    reasons.push(`reopen expected first code ${play?.sourceCode ?? 'unknown'}, observed ${reopened?.sourceCode ?? 'none'}`);
  }
  const operationLatencies = [...next, ...previous, ...alternateNext, ...alternatePrevious, seekNext, seekPrevious]
    .filter(Boolean).map((event) => event.latencyMs).sort((a, b) => a - b);
  const relativeSteppingPass = play?.codeValid === true
    && pausePrime?.codeValid === true
    && next.length === expectedNextCount
    && previous.length === expectedPreviousCount
    && reasons.filter((reason) => reason.startsWith('next') || reason.startsWith('previous')).length === 0;
  return {
    relativeSteppingPass,
    seekRepeatPass: seeks.length === 2 && seeks[0].sourceCode === seeks[1].sourceCode && reasons.filter((reason) => reason.startsWith('seek')).length === 0,
    operationScriptPass: relativeSteppingPass && reasons.length === 0,
    canonicalIdentityExposed: false,
    warmAdjacentP95Ms: percentile(operationLatencies.slice(1), 0.95),
    observationsWithIntermediateDisplays: execution.observations.filter((event) => event.operationDisplayCount > 1).length,
    reasons,
  };
}

function isExpectedSeekPicture(fixture, targetUs, sourceCode) {
  return expectedSeekCodes(fixture, targetUs).includes(sourceCode);
}

function expectedSeekCodes(fixture, targetUs) {
  const target = BigInt(targetUs);
  const denominator = BigInt(fixture.timebase.denominator);
  const numerator = BigInt(fixture.timebase.numerator);
  const candidate = fixture.frames.find((frame) => BigInt(frame.pts) * numerator * 1_000_000n >= target * denominator);
  const prior = candidate ? fixture.frames[Math.max(0, candidate.frameIndex - 1)] : fixture.frames.at(-1);
  return [...new Set([candidate?.sourceCode, prior?.sourceCode].filter(Number.isFinite))];
}

function renderReport(raw) {
  const validFixtures = raw.fixtureResults.filter((result) => result.evaluation.expectedFailureReported === undefined);
  const relativePassCount = validFixtures.filter((result) => result.evaluation.relativeSteppingPass).length;
  const repeatSeekPassCount = validFixtures.filter((result) => result.evaluation.seekRepeatPass).length;
  const operationPassCount = validFixtures.filter((result) => result.evaluation.operationScriptPass).length;
  const fixtureRows = raw.fixtureResults.map((result) => {
    const evaluation = result.evaluation;
    if (evaluation.expectedFailureReported !== undefined) {
      return `| ${result.id} | n/a | n/a | ${evaluation.expectedFailureReported ? 'pass' : 'fail'} | n/a | n/a | ${evaluation.expectedFailureReported ? 'Malformed input failed explicitly as expected.' : escapeCell(evaluation.reasons.join('; '))} |`;
    }
    return `| ${result.id} | ${evaluation.relativeSteppingPass ? 'pass' : 'fail'} | ${evaluation.seekRepeatPass ?? 'n/a'} | ${evaluation.operationScriptPass ? 'pass' : 'fail'} | no | ${formatNumber(evaluation.warmAdjacentP95Ms)} | ${escapeCell(evaluation.reasons.join('; ') || 'none')} |`;
  });
  const failedMedia = raw.mediaResults.filter((result) => !result.passed);
  const latency = raw.mediaResults.map((result) => result.firstFrameLatencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  return `# LibVLC 4 Determinism Gate Results

Generated ${raw.generatedAtUtc} with LibVLC \`${raw.libvlc.version}\` / \`${raw.libvlc.sourceCommit}\`.

## Decision

**Path C1: ${raw.decision.c1Pass ? 'PASS' : 'FAIL'}**

- Relative fixture stepping: **${relativePassCount}/${validFixtures.length} pass**
- Repeat exact seek: **${repeatSeekPassCount}/${validFixtures.length} pass**
- Complete fixture operation scripts: **${operationPassCount}/${validFixtures.length} pass**
- Canonical absolute frame identity: **fail**
- Representative first-frame coverage: **${raw.mediaResults.length - failedMedia.length}/${raw.mediaResults.length}**
- Malformed source reported explicitly: **${raw.decision.malformedPass ? 'pass' : 'fail'}**
- D3D11 callback registration: **${raw.textureResult.d3d11CallbacksRegistered ? 'pass' : 'fail'}**
- D3D11 render target exercised: **no**; C1 already fails the identity gate, so a full GPU renderer is deferred.

LibVLC's public watch-time point carries \`position\`, \`rate\`, microsecond \`ts_us\`, length, and
system date. It does not carry a presentation-order frame index, source PTS ticks, source timebase,
or frame duration, and the time callback is not atomic with the decoded-memory display callback.
Operation tracking can count adjacent steps from a known anchor, but a random seek does not provide
that anchor. Converting the microsecond clock back through nominal FPS would violate the signed
absolute-identity requirement.

The gate therefore selects **Path C2 provisionally**. BestSource must pass its own exact-frame gate
before any Electron bridge work begins.

Paused seeks are materialized by a documented \`next_frame()\` request after LibVLC reports seek
completion. The report therefore tests the product-relevant seek-plus-step sequence rather than
assuming that the seek-completion callback itself means a new picture was displayed.

## Deterministic Fixtures

| Fixture | Relative stepping | Repeat exact seek | Full operation script | Canonical identity | warm adjacent p95 ms | Notes |
| --- | --- | --- | --- | --- | ---: | --- |
${fixtureRows.join('\n')}

The fixture code and FFmpeg-derived presentation sequence are test oracles only; they are not a
runtime identity mechanism. The VFR fixture deliberately contains duplicate visual content, which
also prevents content hashing from serving as identity.

## Media Coverage

- Signatures tested: **${raw.mediaResults.length}**
- First-frame successes: **${raw.mediaResults.length - failedMedia.length}**
- Failures: **${failedMedia.length}**
- First-frame p50/p95: **${formatNumber(percentile(latency, 0.5))} / ${formatNumber(percentile(latency, 0.95))} ms**

${failedMedia.length ? failedMedia.map((result) => `- \`${result.path}\` (${result.signature}): ${result.error}`).join('\n') : 'No representative failed first-frame decode.'}

The inventory's ${inventory.counts.failed} FFprobe failures remain diagnostics in \`media-inventory.json\`; they are not
counted as valid required representatives.
${inventory.counts.excluded ? 'One audio-only source with attached cover art was excluded from the video matrix.' : ''}

## Callback Evidence

CPU-memory output decoded all fixture observations used above. D3D11 callback registration and
detachment both returned true. A real D3D11 device/render-target callback loop was intentionally not
built after the mandatory identity criterion had already failed; this is rendering feasibility debt,
not a route by which C1 could regain canonical frame identity.

Raw per-operation observations, callback timing, stderr, and per-signature results are in the
ignored local artifact \`artifacts/libvlc-gate-raw.json\`.
`;
}

async function updateMediaMatrix(results) {
  const matrixPath = path.join(spikeRoot, 'docs', 'media-matrix.md');
  const statuses = new Map(results.map((result) => [result.id, result.passed ? 'pass' : 'fail']));
  const lines = (await readFile(matrixPath, 'utf8')).split(/\r?\n/).map((line) => {
    const id = line.match(/^\| (media-\d+) \|/)?.[1];
    if (!id || !statuses.has(id)) return line;
    return line.replace(/\| (?:pending|pass|fail) \|$/, `| ${statuses.get(id)} |`);
  });
  await writeFile(matrixPath, lines.join('\n'));
}

function parseEvents(stdout) {
  return String(stdout).split(/\r?\n/).filter((line) => line.startsWith('{')).map((line) => {
    try { return JSON.parse(line); } catch { return { type: 'invalid-json', line }; }
  });
}

function parseJson(text) { return JSON.parse(text.replace(/^\uFEFF/, '')); }
function conciseError(error) { return String(error?.message ?? error).replaceAll('\r', ' ').replaceAll('\n', ' ').slice(0, 800); }
function escapeCell(value) { return String(value).replaceAll('|', '\\|').replaceAll('\n', ' '); }
function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(2) : 'n/a'; }
function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
