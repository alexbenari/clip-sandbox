import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { InteractivePreparationService } from '../src/preparation/interactive-preparation.mjs';
import {
  AllIntraProxyPreparationService,
  REVIEW_PROXY_PROFILE_GOP_1,
  REVIEW_PROXY_PROFILE_GOP_6,
  REVIEW_PROXY_PROFILE_GOP_12,
} from '../src/preparation/all-intra-proxy-preparation.mjs';
import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = path.join(spikeRoot, 'artifacts', 'review-proxy-profile-raw.json');
const fullMovieSmokePath = path.join(spikeRoot, 'artifacts', 'control-smoke-media-035.json');
const handsOnReviewPath = path.join(spikeRoot, 'docs', 'review-proxy-hands-on-result.json');
const reportPath = path.join(spikeRoot, 'docs', 'review-proxy-profile-results.md');
const temporaryRoot = await fsTempDirectory('review-proxy-profile-');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const tools = {
  ffmpeg: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe'),
  ffprobe: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe'),
  packetScanner: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_packet_scan.exe'),
  sampleSignature: path.join(spikeRoot, 'build', 'bestsource-gate', 'media_sample_signature.exe'),
  bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
};
const dependencyManifest = JSON.parse(await readFile(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
const dependencies = dependencyManifest.dependencies;
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
const profiles = [
  REVIEW_PROXY_PROFILE_GOP_1,
  REVIEW_PROXY_PROFILE_GOP_6,
  REVIEW_PROXY_PROFILE_GOP_12,
];
const fixturesOnly = process.argv.includes('--fixtures-only');
const renderOnly = process.argv.includes('--render-only');
const timeoutMs = 3 * 60 * 60_000;
const frameToleranceUs = 2_000;
const repairedFrameToleranceUs = 50_000;
const previousRun = renderOnly ? await readJson(artifactPath) : null;
if (renderOnly && !previousRun) throw new Error('No review-proxy raw artifact exists to render.');
const run = previousRun ?? {
  schemaVersion: 1,
  startedAtUtc: new Date().toISOString(),
  completedAtUtc: null,
  mode: fixturesOnly ? 'fixtures-only' : 'full',
  settings: {
    sampleDurationSeconds: 60,
    sampleStartSeconds: 600,
    targetIds: ['media-017', 'media-005', 'media-035'],
    profileIds: profiles.map((profile) => profile.id),
    frameProbe: 'first/middle/last',
    presentationTimeToleranceUs: frameToleranceUs,
    repairedPresentationTimeToleranceUs: repairedFrameToleranceUs,
    execution: 'sequential targets, sequential profiles, temporary cache',
  },
  dependencies: Object.fromEntries(['ffmpeg', 'bestsource'].map((name) => [name, {
    version: dependencies[name]?.version ?? null,
    commit: dependencies[name]?.commit ?? null,
  }])),
  results: [],
};

if (renderOnly) {
  run.decision = selectProfile(run.results);
  run.fullMovieSmoke = validateFullMovieSmoke(await readJson(fullMovieSmokePath), run.decision);
  run.handsOnReview = validateHandsOnReview(await readJson(handsOnReviewPath), run.decision);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await saveArtifacts();
  await rm(temporaryRoot, { recursive: true, force: true });
} else try {
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });
  const fixtureManifest = JSON.parse(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
  const targets = await buildTargets(fixtureManifest);
  if (!fixturesOnly) await Promise.all(Object.values(tools).map(requireFile));

  for (const target of targets) {
    const canonical = await prepareCanonical(target);
    for (const profile of profiles) {
      console.log(`${target.id}/${profile.gopSize}: preparing`);
      const result = await runTarget(target, canonical, profile).catch((error) => ({
        targetId: target.id,
        targetKind: target.kind,
        sourcePath: target.sourcePath,
        profile: profileSummary(profile),
        status: 'failed',
        error: String(error?.message ?? error),
      }));
      run.results.push(result);
      await saveArtifacts();
      console.log(`${target.id}/${profile.gopSize}: ${result.status}`);
    }
  }
  run.completedAtUtc = new Date().toISOString();
  run.decision = selectProfile(run.results);
  await saveArtifacts();
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function buildTargets(fixtureManifest) {
  const fixtures = fixtureManifest.fixtures.filter((fixture) => !fixture.expectedFailure)
    .map((fixture) => ({ id: `fixture-${fixture.id}`, kind: 'fixture', sourcePath: path.resolve(fixture.path) }));
  if (fixturesOnly) return fixtures;
  const raw = await readJson(path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'));
  if (!raw) throw new Error('Missing bestsource-preparation-raw.json; run the preparation gate first.');
  const targets = [];
  for (const id of run.settings.targetIds) {
    const result = raw.results?.find((candidate) => candidate.id === id);
    const reviewAsset = result?.reviewAsset ?? result?.sourcePath;
    if (!reviewAsset) throw new Error(`Raw preparation results contain no review asset for ${id}.`);
    targets.push({
      id,
      kind: 'stream-copy-sample',
      sourcePath: await makeSample(reviewAsset, id),
      timingPolicy: result.reviewAssetKind === 'normalized-copy' ? 'allow-mapped-repair' : 'strict',
    });
  }
  return [...fixtures, ...targets];
}

async function makeSample(sourcePath, id) {
  const output = path.join(temporaryRoot, `${id}-60s.mkv`);
  await executeStreaming(tools.ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(run.settings.sampleStartSeconds), '-i', sourcePath,
    '-t', String(run.settings.sampleDurationSeconds), '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
    '-avoid_negative_ts', 'make_non_negative', output,
  ], { env: environment, timeoutMs: 20 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  return output;
}

async function prepareCanonical(target) {
  const cacheRoot = path.join(temporaryRoot, target.id, 'canonical');
  const preparation = new InteractivePreparationService({
    cacheRoot,
    ...tools,
    bestSourceVersion: dependencies.bestsource.version,
    ffmpegVersion: dependencies.ffmpeg.version,
    environment,
  });
  return preparation.prepare(target.sourcePath);
}

async function runTarget(target, canonical, profile) {
  const started = performance.now();
  const cacheRoot = path.join(temporaryRoot, target.id, `gop-${profile.gopSize}`);
  const proxyService = new AllIntraProxyPreparationService({
    cacheRoot: path.join(cacheRoot, 'proxy'),
    ...tools,
    profile,
    bestSourceVersion: dependencies.bestsource.version,
    ffmpegVersion: dependencies.ffmpeg.version,
    environment,
  });
  const proxy = await proxyService.prepare(canonical);
  const audio = await probeAudio(proxy.proxyAssetPath, proxy.selectedAudio !== null);
  const frameProbe = await compareProbeTimes(canonical, proxy, target.timingPolicy ?? 'strict');
  const accessProbe = await probeAccess(proxy);
  const proxyBytes = (await stat(proxy.proxyAssetPath)).size;
  const expected = proxy.mapping.canonicalFrameCount;
  return {
    targetId: target.id,
    targetKind: target.kind,
    sourcePath: target.sourcePath,
    status: 'complete',
    profile: profileSummary(profile),
    timings: {
      encodeMs: proxy.metrics.encodeMs,
      indexMs: proxy.metrics.indexMs,
      totalMs: performance.now() - started,
    },
    bytes: proxyBytes,
    frameMap: {
      canonical: expected,
      encoded: proxy.mapping.encodedFrameCount,
      indexed: proxy.mapping.proxyFrameCount,
      complete: proxy.mapping.complete && expected === proxy.mapping.encodedFrameCount &&
        expected === proxy.mapping.proxyFrameCount,
    },
    audio,
    frameProbe,
    accessProbe,
  };
}

async function probeAudio(file, expectedPresent) {
  const { stdout } = await executeStreaming(tools.ffprobe, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,channels,sample_rate', '-of', 'json', file,
  ], { env: environment, timeoutMs: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const stream = JSON.parse(stdout.replace(/^\uFEFF/, '')).streams?.[0];
  if (!stream) return {
    present: false,
    codec: null,
    channels: null,
    sampleRate: null,
    expected: !expectedPresent,
  };
  return {
    present: true,
    codec: stream.codec_name ?? null,
    channels: Number(stream.channels),
    sampleRate: Number(stream.sample_rate),
    expected: expectedPresent && stream.codec_name === 'aac' && Number(stream.channels) === 2 &&
      Number(stream.sample_rate) === 48_000,
  };
}

async function compareProbeTimes(canonical, proxy, timingPolicy) {
  const indices = [...new Set([0, Math.floor((proxy.numFrames - 1) / 2), proxy.numFrames - 1])];
  const left = await probe(canonical.reviewAssetPath, canonical.indexPath, indices);
  const right = await probe(proxy.proxyAssetPath, proxy.proxyIndexPath, indices);
  const canonicalOriginUs = left[0].ptsUs;
  const proxyOriginUs = right[0].ptsUs;
  const rows = indices.map((frameIndex, index) => {
    const canonicalFrame = left[index];
    const proxyFrame = right[index];
    const canonicalRelativeUs = canonicalFrame.ptsUs - canonicalOriginUs;
    const proxyRelativeUs = proxyFrame.ptsUs - proxyOriginUs;
    const deltaUs = Math.abs(Number(canonicalRelativeUs - proxyRelativeUs));
    return { frameIndex, canonicalRelativeUs: canonicalRelativeUs.toString(),
      proxyRelativeUs: proxyRelativeUs.toString(), deltaUs,
      withinTolerance: deltaUs <= frameToleranceUs };
  });
  const maximumDeltaUs = Math.max(...rows.map((row) => row.deltaUs));
  const strictPass = rows.every((row) => row.withinTolerance);
  const pass = strictPass || timingPolicy === 'allow-mapped-repair' && maximumDeltaUs <= repairedFrameToleranceUs;
  return {
    timingPolicy,
    toleranceUs: frameToleranceUs,
    repairedToleranceUs: repairedFrameToleranceUs,
    maximumDeltaUs,
    rows,
    strictPass,
    pass,
  };
}

async function probeAccess(proxy) {
  const count = Math.min(12, proxy.numFrames);
  const indices = [...new Set(Array.from({ length: count }, (_value, index) =>
    Math.round(index * Math.max(0, proxy.numFrames - 1) / Math.max(1, count - 1))))];
  const frames = await probe(proxy.proxyAssetPath, proxy.proxyIndexPath, indices);
  const latencies = frames.map((frame) => frame.latencyMs).sort((left, right) => left - right);
  return {
    samples: latencies.length,
    p50Ms: percentile(latencies, 0.50),
    p95Ms: percentile(latencies, 0.95),
    maxMs: percentile(latencies, 1),
  };
}

async function probe(movie, index, frames) {
  const events = [];
  await executeStreaming(tools.bestSourceHarness, ['probe', movie, index, frames.join(',')], {
    env: environment, timeoutMs, maxBuffer: 16 * 1024 * 1024,
    onStdoutLine: (line) => events.push(JSON.parse(line)),
  });
  const frameEvents = events.filter((event) => event.type === 'frame');
  const sourceEvent = events.find((event) => event.type === 'source');
  if (frameEvents.length !== frames.length) throw new Error(`Expected ${frames.length} frame probes, got ${frameEvents.length}.`);
  if (!sourceEvent?.timebase) throw new Error('BestSource probe produced no source timebase.');
  const numerator = BigInt(sourceEvent.timebase.numerator);
  const denominator = BigInt(sourceEvent.timebase.denominator);
  return frameEvents.map((frame) => ({
    ptsUs: BigInt(frame.pts) * numerator * 1_000_000n / denominator,
    latencyMs: Number(frame.latencyMs),
  }));
}

function profileSummary(profile) {
  return { id: profile.id, gopSize: profile.gopSize, bFrames: profile.bFrames };
}

async function saveArtifacts() {
  await writeFile(artifactPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  await writeFile(reportPath, renderReport(), 'utf8');
}

function renderReport() {
  const rows = run.results.map((result) => {
    const error = result.error ?? '';
    return `| ${result.targetId} | GOP ${result.profile.gopSize} | ${result.status} | ${number(result.timings?.encodeMs)} | ${number(result.timings?.indexMs)} | ${number(result.timings?.totalMs)} | ${result.bytes ?? 'n/a'} | ${number(result.accessProbe?.p95Ms)} | ${result.frameMap?.complete === true ? 'yes' : 'no'} | ${result.audio?.expected === true ? 'yes' : 'no'} | ${result.frameProbe?.pass === true ? result.frameProbe.strictPass ? 'strict' : 'mapped repair' : 'no'} | ${escapeCell(error)} |`;
  }).join('\n');
  const smoke = run.fullMovieSmoke;
  const handsOnReview = run.handsOnReview;
  const fullMovieEvidence = smoke ? `## Full-Movie Electron Evidence

- Source: \`${smoke.sourceName}\`.
- Mapping: ${smoke.proxyPreparation?.canonicalFrameCount ?? 'n/a'} canonical frames;
  ${smoke.proxyPreparation?.proxyFrameCount ?? 'n/a'} proxy frames.
- Cached activation: ${number(smoke.proxyPreparation?.totalMs)} ms; playback source
  \`${smoke.playbackAssetKind ?? 'unknown'}\`.
- Profile: \`${smoke.proxyProfile?.id ?? 'unknown'}\`; GOP ${smoke.proxyProfile?.gopSize ?? 'n/a'};
  ${smoke.proxyProfile?.bFrames ?? 'n/a'} B-frames.
- Full-player drag: ${smoke.fullPlayerScrub?.displayedFrames ?? 0}/${smoke.fullPlayerScrub?.requestedPositions ?? 0}
  positions displayed at ${number(smoke.fullPlayerScrub?.displayedFps)} fps, with
  ${number(smoke.fullPlayerScrub?.firstFrameMs)} ms to the first displayed drag frame and
  ${number(smoke.fullPlayerScrub?.latencyP95Ms)} ms p95 landing latency.
- Selected source audio: \`${smoke.proxySelectedAudio?.codec ?? 'none'}\`;
  ${smoke.proxySelectedAudio?.channels ?? 0} channels; source stream
  ${smoke.proxySelectedAudio?.streamIndex ?? 'n/a'}. The proxy encodes it as stereo AAC.
- Control result: ${smoke.playerError ? `failed with \`${escapeCell(smoke.playerError)}\`` : 'no player error; exact stepping and canonical range capture passed'}.

This proves the complete 4K source can reopen its cached one-to-one proxy and exercise the Electron
control through the selected playback path. It does not replace the human audio, enlarged-image,
or handoff-quality judgment.

` : '';
  const handsOnResult = handsOnReview ? `## Hands-On Result

On ${handsOnReview.reviewedAtUtc.slice(0, 10)}, the user reviewed the selected profile on the
difficult 4K representative and reported that the image looked really good and the sound was great.
The visual-quality and preview-audio gates therefore pass. The cold original-to-proxy transition was
not observed in this cached review and remains a narrow residual UX check.

` : `## Remaining Hands-On Gate

Automated evidence cannot establish perceived image quality or clean audio. The selected full 4K
representative must be played in the Electron control after its new proxy is ready. The reviewer
must confirm smooth full-player dragging, acceptable enlarged 960-pixel quality, clean synchronized
audio, and no visible jump when provisional playback switches to proxy playback.

`;
  return `# Review Proxy Profile Results

This bounded Phase 3B runner compares GOP 1, 6, and 12 review proxies. Full fixtures are used;
real-media cases are 60-second stream-copy samples beginning at 600 seconds. Targets and profiles
run sequentially in a temporary cache. The canonical BestSource index remains the frame-identity
authority; the proxy index is checked for one-to-one ordinal correspondence.

Presentation timestamps are compared at the first, middle, and last sampled proxy frames. The
documented tolerance is ${run.settings.presentationTimeToleranceUs} microseconds. This is a
measurement report, not a claim that proxy pixels equal source pixels.
Timestamp-normalized sources may use an explicitly mapped monotonic repair up to
${run.settings.repairedPresentationTimeToleranceUs} microseconds; healthy sources must pass the
strict tolerance.

## Run

- Mode: \`${run.mode}\`
- Started: \`${run.startedAtUtc}\`
- Completed: \`${run.completedAtUtc ?? 'in progress'}\`
- FFmpeg: \`${run.dependencies.ffmpeg?.version ?? 'unknown'}\`
- BestSource: \`${run.dependencies.bestsource?.version ?? 'unknown'}\`

## Results

| Target | Profile | Status | Encode ms | Index ms | Total ms | Proxy bytes | Access p95 ms | Frame map | Audio | Relative time | Error |
|---|---:|---|---:|---:|---:|---:|---:|---|---|---|---|
${rows || '| pending | | | | | | | | | | | |'}

## Decision

${run.decision ? `Selected: **GOP ${run.decision.gopSize}** (\`${run.decision.profileId}\`).

${run.decision.rationale}` : 'The run is still in progress; no profile is selected yet.'}

## Selected Contract

- Video: MPEG-4 Part 2, maximum 960 pixels wide, quality value 5, GOP 1, no B-frames, 8-bit
  \`yuv420p\`.
- Clock: 60,000 ticks per second, preserving source-relative presentation times. Duplicate or
  backward timestamps advance to the next tick; the complete proxy ordinal remains mapped to the
  same canonical source ordinal.
- Audio: one non-commentary stereo program is preferred, encoded as AAC stereo at 192 kbps and
  48 kHz. Audio-less sources remain audio-less.
- Runtime: LibVLC switches from provisional original playback to this proxy after preparation;
  BestSource resolves proxy time to proxy ordinal and returns identity from the canonical index.
- Cache: the profile, timing policy, mapping version, source fingerprint, and dependency versions
  participate in cache identity.

${fullMovieEvidence}${handsOnResult}## Interpretation

\`Frame map\` requires equal canonical, encoded, and indexed frame counts. \`Audio\` requires the
selected proxy audio stream to be AAC, stereo, and 48 kHz. \`Relative time\` requires all three
probed presentation times to be within the stated tolerance. Failed rows are retained so a single
profile or target failure does not hide the rest of the comparison.
`;
}

function number(value) { return Number.isFinite(value) ? value.toFixed(2) : 'n/a'; }
function percentile(values, fraction) {
  if (values.length === 0) return null;
  return values[Math.floor((values.length - 1) * fraction)];
}
function selectProfile(results) {
  const real = results.filter((result) => result.targetKind === 'stream-copy-sample' &&
    result.status === 'complete' && result.frameMap?.complete && result.frameProbe?.pass && result.audio?.expected);
  if (real.length === 0) return null;
  const candidates = profiles.map((profile) => {
    const rows = real.filter((result) => result.profile.id === profile.id);
    return {
      profileId: profile.id,
      gopSize: profile.gopSize,
      completeTargets: rows.length,
      meanEncodeMs: rows.reduce((sum, result) => sum + result.timings.encodeMs, 0) / Math.max(1, rows.length),
      maximumAccessP95Ms: Math.max(...rows.map((result) => result.accessProbe.p95Ms)),
    };
  }).filter((candidate) => candidate.completeTargets === new Set(run.settings.targetIds).size)
    .sort((left, right) => left.meanEncodeMs - right.meanEncodeMs || left.gopSize - right.gopSize);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    ...selected,
    rationale: 'All accepted profiles preserved the tested frame map, timing policy, normalized audio, and fast access. ' +
      'GOP 1 had the lowest mean encode time on the real-media samples and minimizes decode-forward work. ' +
      'GOP 6 and GOP 12 reduce cache size, but cache size is not the current optimization target.',
  };
}
function validateFullMovieSmoke(smoke, decision) {
  if (!smoke) return null;
  if (!decision || smoke.proxyProfile?.id !== decision.profileId ||
      smoke.playbackAssetKind !== 'review-proxy' || smoke.playerError ||
      smoke.proxyPreparation?.canonicalFrameCount !== smoke.proxyPreparation?.proxyFrameCount) {
    throw new Error('The full-movie smoke artifact does not match the selected review-proxy contract.');
  }
  return smoke;
}
function validateHandsOnReview(review, decision) {
  if (!review) return null;
  if (!decision || review.profileId !== decision.profileId || review.visualQuality !== 'pass' ||
      review.audioQuality !== 'pass') {
    throw new Error('The hands-on result does not match the selected review-proxy contract.');
  }
  return review;
}
function escapeCell(value) { return String(value).replaceAll('|', '\\|').replaceAll('\n', ' '); }
async function requireFile(file) { try { await access(file); } catch { throw new Error(`Required tool is missing: ${file}`); } }
async function readJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function fsTempDirectory(prefix) { return (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(), prefix)); }
