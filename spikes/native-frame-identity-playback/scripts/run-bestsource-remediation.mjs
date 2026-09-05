import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseJsonLines, percentile } from '../src/tooling/bestsource-evaluation.mjs';
import {
  assessRepairCandidate,
  buildRepairArgs,
  classifyPacketScan,
  compareSampledContent,
  repairLevelsFor,
} from '../src/tooling/media-remediation.mjs';
import { execute } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const argumentsSet = new Set(process.argv.slice(2));
const resume = argumentsSet.has('--resume');
const reset = argumentsSet.has('--reset');
const renderOnly = argumentsSet.has('--render-only');
const streamCopyOnly = argumentsSet.has('--stream-copy-only');
const proxyOnly = argumentsSet.has('--proxy-only');
const retryFailed = argumentsSet.has('--retry-failed');
const requestedIds = new Set((valueAfter('--media') ?? '').split(',').filter(Boolean));
const targetIds = ['media-018', 'media-019', 'media-020', 'media-023', 'media-040'];
const warmAccessTargetMs = 750;

if (resume && reset) throw new Error('--resume and --reset are mutually exclusive.');
if (streamCopyOnly && proxyOnly) {
  throw new Error('--stream-copy-only and --proxy-only are mutually exclusive.');
}

const artifactPath = path.join(spikeRoot, 'artifacts', 'bestsource-remediation-raw.json');
const checkpointPath = path.join(spikeRoot, 'artifacts', 'bestsource-remediation-checkpoint.json');
const reportPath = path.join(spikeRoot, 'docs', 'bestsource-remediation-results.md');
const derivativeRoot = path.join(spikeRoot, '.deps', 'remediation-media');
const indexRoot = path.join(spikeRoot, '.deps', 'indexes', 'bestsource-remediation');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const ffmpeg = path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe');
const ffprobe = path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe');
const packetScanner = path.join(spikeRoot, 'build', 'bestsource-gate', 'media_packet_scan.exe');
const bestSourceHarness = path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe');
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

await mkdir(path.dirname(artifactPath), { recursive: true });
if (reset) {
  await rm(derivativeRoot, { recursive: true, force: true });
  await rm(indexRoot, { recursive: true, force: true });
  await rm(checkpointPath, { force: true });
}
await mkdir(derivativeRoot, { recursive: true });
await mkdir(indexRoot, { recursive: true });

const inventory = JSON.parse(await readFile(path.join(spikeRoot, 'artifacts', 'media-inventory.json'), 'utf8'));
const dependencyManifest = JSON.parse(await readFile(path.join(spikeRoot, 'dependency-manifest.json'), 'utf8'));
const selectedMedia = targetIds
  .filter((id) => requestedIds.size === 0 || requestedIds.has(id))
  .map((id) => inventory.groups.find((group) => group.id === id));
if (selectedMedia.some((media) => !media)) throw new Error('The remediation source set is incomplete.');

if (renderOnly) {
  const stored = await readJsonIfExists(checkpointPath) ?? await readJsonIfExists(artifactPath);
  if (!stored) throw new Error('--render-only found no remediation evidence.');
  await writeFile(reportPath, renderReport(stored));
  console.log(`Rendered ${reportPath}`);
  process.exit(0);
}

let run = resume
  ? await readJsonIfExists(checkpointPath) ?? await readJsonIfExists(artifactPath)
  : null;
if (resume && !run) throw new Error('--resume found no remediation checkpoint.');
if (!resume && !reset && await exists(checkpointPath)) {
  throw new Error('A remediation checkpoint exists. Use --resume or --reset.');
}
if (!run) {
  run = {
    schemaVersion: 1,
    startedAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    dependencies: {
      bestsource: dependencyManifest.dependencies.bestsource,
      ffmpeg: dependencyManifest.dependencies.ffmpeg,
    },
    settings: {
      warmAccessTargetMs,
      sampledFrames: 'middle, 10%, 90%, 25%, 75%, first, last',
      proxy: 'MPEG-4 Part 2, all-intra, q=5, max width 960, passthrough timing, audio stream-copy',
    },
    mediaResults: [],
  };
}

for (const media of selectedMedia) {
  let mediaResult = run.mediaResults.find((candidate) => candidate.id === media.id);
  if (!mediaResult) {
    mediaResult = {
      id: media.id,
      sourcePath: media.representativePath,
      sourceName: path.basename(media.representativePath),
      signature: media.signature,
      baseline: null,
      candidates: [],
    };
    run.mediaResults.push(mediaResult);
  }

  if (!mediaResult.baseline) {
    console.log(`${media.id}: measuring baseline`);
    mediaResult.baseline = await measureMedia({
      mediaId: media.id,
      level: { id: 'baseline', kind: 'source', changesPixels: false },
      movie: media.representativePath,
      cache: path.join(spikeRoot, '.deps', 'indexes', 'bestsource-gate', 'media', media.id),
      sourceInfo: null,
      transformation: null,
      resetIndex: false,
    });
    await saveCheckpoint(run);
  }

  const levels = repairLevelsFor({ codec: 'mpeg4' }).filter((level) => {
    if (streamCopyOnly) return level.kind === 'stream-copy';
    if (proxyOnly) return level.kind === 'transcode';
    return true;
  });
  for (const level of levels) {
    const existingCandidateIndex = mediaResult.candidates.findIndex(
      (candidate) => candidate.levelId === level.id,
    );
    const existingCandidate = mediaResult.candidates[existingCandidateIndex];
    if (existingCandidate && !(retryFailed && !existingCandidate.assessment?.viable)) {
      console.log(`${media.id}/${level.id}: resumed checkpoint`);
      continue;
    }
    console.log(`${media.id}/${level.id}: transforming`);
    const outputDirectory = path.join(derivativeRoot, media.id);
    const output = path.join(outputDirectory, `${level.id}${level.outputExtension}`);
    await mkdir(outputDirectory, { recursive: true });
    const transformation = await transform(level, media.representativePath, output);
    let result;
    if (!transformation.completed) {
      result = { levelId: level.id, level, transformation, error: transformation.error };
    } else {
      console.log(`${media.id}/${level.id}: indexing and probing`);
      result = await measureMedia({
        mediaId: media.id,
        level,
        movie: output,
        cache: path.join(indexRoot, media.id, level.id),
        sourceInfo: mediaResult.baseline,
        transformation,
        resetIndex: true,
      });
    }
    if (existingCandidateIndex >= 0) mediaResult.candidates.splice(existingCandidateIndex, 1, result);
    else mediaResult.candidates.push(result);
    await saveCheckpoint(run);
    console.log(`${media.id}/${level.id}: ${result.assessment?.viable ? 'VIABLE' : 'not viable'}`);
  }
}

const complete = targetIds.every((mediaId) => {
  const media = inventory.groups.find((group) => group.id === mediaId);
  const result = run.mediaResults.find((candidate) => candidate.id === media.id);
  if (!result?.baseline) return false;
  const expected = repairLevelsFor({ codec: 'mpeg4' });
  return expected.every((level) => result.candidates.some((candidate) =>
    candidate.levelId === level.id && candidate.transformation?.completed && candidate.index?.completed));
});
run.completedAtUtc = complete ? new Date().toISOString() : null;
await saveCheckpoint(run);
await writeFile(artifactPath, `${JSON.stringify(run, null, 2)}\n`);
await writeFile(reportPath, renderReport(run));
if (complete) await rm(checkpointPath, { force: true });
console.log(`Remediation evidence ${complete ? 'complete' : 'checkpointed'}; report: ${reportPath}`);

async function transform(level, input, output) {
  const started = process.hrtime.bigint();
  try {
    await execute(ffmpeg, buildRepairArgs(level.id, input, output), {
      cwd: spikeRoot,
      env: environment,
      timeoutMs: level.kind === 'transcode' ? 2 * 60 * 60_000 : 20 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const outputStats = await stat(output);
    return {
      completed: true,
      elapsedMs: elapsedMs(started),
      output,
      outputBytes: outputStats.size,
      args: buildRepairArgs(level.id, '<input>', '<output>'),
    };
  } catch (error) {
    return {
      completed: false,
      elapsedMs: elapsedMs(started),
      output,
      error: conciseError(error),
      stderr: String(error.stderr ?? '').slice(-20_000),
      args: buildRepairArgs(level.id, '<input>', '<output>'),
    };
  }
}

async function measureMedia({ mediaId, level, movie, cache, sourceInfo, transformation, resetIndex }) {
  const movieStats = await stat(movie);
  const container = await probeContainer(movie);
  const packetScan = await scanPackets(movie);
  if (resetIndex) await rm(`${cache}.0.bsindex`, { force: true });
  await mkdir(path.dirname(cache), { recursive: true });
  const indexed = await runHarness('hash-diagnostics', movie, cache, null, 35 * 60_000);
  const diagnostics = indexed.events.find((event) => event.type === 'hash-diagnostics') ?? null;
  const frameCount = diagnostics?.frameCount ?? indexed.source?.numFrames ?? null;
  const requestedFrames = frameCount ? sampleFrames(frameCount) : [];
  const probed = indexed.completed && requestedFrames.length
    ? await runHarness('probe', movie, cache, requestedFrames.join(','), 15 * 60_000)
    : failedExecution(indexed.error ?? 'Indexing did not complete.');
  const summary = summarizeExecution(probed);
  const content = sourceInfo
    ? compareSampledContent(sourceInfo.probe, summary)
    : { frameCountPreserved: true, sampledPixelsPreserved: true, comparedFrames: summary.frames.length };
  const ordinalMappingPreserved = probed.completed && probed.frames.length === requestedFrames.length &&
    probed.frames.every((frame) => frame.originalFrame === frame.requestedFrame);
  const assessment = assessRepairCandidate({
    content,
    ordinalMappingPreserved,
    keyframeCount: diagnostics?.keyframeCount ?? 0,
    ptsUsableKeyframeCount: diagnostics?.ptsUsableKeyframeCount ?? 0,
    probeCompleted: probed.completed,
    warmP95Ms: summary.p95AccessMs ?? Number.POSITIVE_INFINITY,
    requirePixelIdentity: !level.changesPixels,
  });
  const audioPreserved = sourceInfo
    ? sameCodecList(sourceInfo.container.audioCodecs, container.audioCodecs)
    : true;
  return {
    levelId: level.id,
    level,
    movie,
    bytes: movieStats.size,
    transformation,
    container,
    packetScan,
    packetClassification: classifyPacketScan(packetScan),
    index: {
      completed: indexed.completed,
      constructorMs: indexed.source?.constructorMs ?? null,
      error: indexed.error,
      diagnostics,
    },
    requestedFrames,
    probe: summary,
    content,
    ordinalMappingPreserved,
    audioPreserved,
    assessment: { ...assessment, viable: assessment.viable && audioPreserved },
    error: indexed.error ?? probed.error,
    mediaId,
  };
}

async function scanPackets(movie) {
  const started = process.hrtime.bigint();
  const result = await execute(packetScanner, [movie], {
    cwd: spikeRoot, env: environment, timeoutMs: 10 * 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  return { ...JSON.parse(result.stdout.trim()), wallElapsedMs: elapsedMs(started) };
}

async function probeContainer(movie) {
  const result = await execute(ffprobe, [
    '-v', 'error', '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,time_base,duration',
    '-of', 'json', movie,
  ], { cwd: spikeRoot, env: environment, timeoutMs: 2 * 60_000 });
  const value = JSON.parse(result.stdout);
  return {
    durationSeconds: numeric(value.format?.duration),
    sizeBytes: numeric(value.format?.size),
    videoCodecs: codecList(value.streams, 'video'),
    audioCodecs: codecList(value.streams, 'audio'),
  };
}

async function runHarness(mode, movie, cache, frames, timeoutMs) {
  const commandArgs = [mode, movie, cache];
  if (frames !== null) commandArgs.push(frames);
  try {
    const result = await execute(bestSourceHarness, commandArgs, {
      cwd: spikeRoot, env: environment, timeoutMs, maxBuffer: 64 * 1024 * 1024,
    });
    return normalizeExecution(parseJsonLines(result.stdout), 0, result.stderr);
  } catch (error) {
    return normalizeExecution(parseEventsLenient(error.stdout), error.code ?? 1,
      error.stderr, conciseError(error));
  }
}

function normalizeExecution(events, exitCode, stderr, fallbackError = null) {
  const source = events.find((event) => event.type === 'source');
  const completeEvent = events.findLast((event) => event.type === 'complete');
  const reportedError = events.findLast((event) => event.type === 'error');
  return {
    completed: Boolean(source && completeEvent && !reportedError),
    events,
    source,
    frames: events.filter((event) => event.type === 'frame'),
    complete: completeEvent,
    error: reportedError?.message ?? fallbackError,
    exitCode,
    stderr: String(stderr ?? ''),
  };
}

function summarizeExecution(execution) {
  return {
    completed: execution.completed,
    error: execution.error,
    constructorMs: execution.source?.constructorMs ?? null,
    numFrames: execution.source?.numFrames ?? null,
    p50AccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 0.5),
    p95AccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 0.95),
    maxAccessMs: percentile(execution.frames.map((frame) => frame.latencyMs), 1),
    frames: execution.frames.map((frame) => ({
      requestedFrame: frame.requestedFrame,
      originalFrame: frame.originalFrame,
      pts: frame.pts,
      rgbaHash: frame.rgbaHash,
      latencyMs: frame.latencyMs,
      framesSincePreviousSeekKeyframe: frame.framesSincePreviousSeekKeyframe,
    })),
  };
}

function failedExecution(error) {
  return { completed: false, events: [], frames: [], error, source: null, complete: null };
}

function sampleFrames(frameCount) {
  const last = frameCount - 1;
  return [...new Set([
    Math.floor(last * 0.5),
    Math.floor(last * 0.1),
    Math.floor(last * 0.9),
    Math.floor(last * 0.25),
    Math.floor(last * 0.75),
    0,
    last,
  ])];
}

function codecList(streams, type) {
  return (streams ?? []).filter((stream) => stream.codec_type === type)
    .map((stream) => stream.codec_name).sort();
}

function sameCodecList(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEventsLenient(output) {
  return String(output ?? '').split(/\r?\n/).flatMap((line) => {
    try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
  });
}

function elapsedMs(started) {
  return Number(process.hrtime.bigint() - started) / 1_000_000;
}

function conciseError(error) {
  return String(error?.message ?? error).split(/\r?\n/).at(-1);
}

async function saveCheckpoint(value) {
  const temporary = `${checkpointPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rm(checkpointPath, { force: true });
  await rename(temporary, checkpointPath);
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

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function renderReport(value) {
  const sourceRows = value.mediaResults
    .map((media) => `| ${media.id} | ${escapeCell(media.sourceName)} |`)
    .join('\n');
  const rows = value.mediaResults.flatMap((media) => [media.baseline, ...media.candidates]
    .filter(Boolean).map((result) => {
      const diagnostic = result.index?.diagnostics;
      const baselineFrameCount = media.baseline?.index?.diagnostics?.frameCount;
      const candidateFrameCount = diagnostic?.frameCount;
      const keyPts = diagnostic ? `${diagnostic.ptsUsableKeyframeCount}/${diagnostic.keyframeCount}` : 'n/a';
      const packetPts = result.packetScan
        ? `${result.packetScan.keyPacketsWithPts}/${result.packetScan.keyPacketCount}` : 'n/a';
      const frameCounts = baselineFrameCount && candidateFrameCount
        ? `${baselineFrameCount}->${candidateFrameCount}` : 'n/a';
      const sampledPixels = result.level?.changesPixels
        ? 'n/a' : yesNo(result.content?.sampledPixelsPreserved);
      const packedStatus = result.packetScan
        ? classifyPacketScan(result.packetScan).packedBFrameStatus : 'n/a';
      return `| ${media.id} | ${result.levelId} | ${seconds(result.packetScan?.wallElapsedMs)} | ${seconds(result.transformation?.elapsedMs)} | ${gib(result.bytes ?? result.transformation?.outputBytes)} | ${packetPts} | ${packedStatus} | ${seconds(result.index?.constructorMs)} | ${keyPts} | ${number(result.probe?.p95AccessMs)} | ${frameCounts} | ${sampledPixels} | ${yesNo(result.ordinalMappingPreserved)} | ${yesNo(result.audioPreserved)} | ${result.assessment?.viable ? 'yes' : 'no'} | ${escapeCell(result.error)} |`;
    })).join('\n');
  return `# BestSource Remediation Results

Generated ${value.completedAtUtc ?? 'from an in-progress checkpoint'} on Windows x64 by \`scripts/run-bestsource-remediation.mjs\`.

## Sources

| Media | Source file |
| --- | --- |
${sourceRows || '| pending | |'}

## Method

The five sources are the complete set in the current representative matrix for which BestSource found zero PTS-usable keyframes. Each candidate is measured as a distinct intervention:

1. \`timestamp-remux\`: synthesize missing timestamps while stream-copying into Matroska.
2. \`unpack-only-remux\`: apply FFmpeg's MPEG-4 Part 2 packed-B-frame bitstream filter while stream-copying into AVI, without requesting timestamp generation.
3. \`unpack-and-timestamp-remux\`: combine packed-picture normalization with timestamp generation and Matroska remuxing.
4. \`all-intra-proxy\`: decode and re-encode a maximum-960-pixel-wide, all-intra review proxy while preserving one output picture per input picture and stream-copying audio.

BestSource builds a clean index for every derivative. The baseline reuses the persistent source index produced by the main gate, so its constructor time is a warm-cache reopening measurement rather than a fresh indexing cost. Warm access uses seven deliberately non-monotonic frame requests, modeling a quick scrub to a distant area followed by exact work. Stream-copy candidates must preserve frame count and all seven sampled RGBA hashes. The lossy proxy must preserve frame count and sampled ordinal identity, but pixel hashes are expected to differ.

## Findings

- Compressed-packet preflight predicted all five missing-keyframe-PTS cases and took 0.86-2.11 seconds on warm filesystem cache.
- Timestamp-only stream-copy was viable for 5/5: 1.80-3.64 seconds rewrite, 9.00-89.44 seconds indexing, and 16.20-90.00 ms warm exact-access p95. It preserved frame count, sampled pixels, ordinals, and audio.
- Unpack-only was viable for 0/5 because it did not create PTS-usable keyframes.
- Combined unpack plus timestamp repair was viable for 3/5. It changed \`media-019\` from 234,720 to 234,646 indexed frames and \`media-040\` from 131,783 to 131,755, so it cannot preserve source absolute frame identity by default.
- The all-intra proxy was viable for 5/5: 48.41-146.20 seconds encode plus 9.53-26.07 seconds indexing, 74.50-134.21 ms warm p95, and 1.70-2.60 times source disk size.

## Measurements

| Media | Level | Scan s | Transform s | GiB | Packet key PTS | Packed evidence | Index s | Indexed key PTS | Warm p95 ms | Source->candidate frames | Sample pixels | Ordinal | Audio | Viable | Error |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
${rows || '| pending | | | | | | | | | | | | | | | |'}

\`Packet key PTS\` is the lightweight compressed-packet preflight. \`Indexed key PTS\` is BestSource's definitive decoded-picture index. \`Sample pixels\` compares seven normalized RGBA hashes for stream-copy candidates; proxy pixels intentionally differ.

## Interpretation

This experiment distinguishes detection cost, sequential rewrite cost, initial BestSource indexing cost, and later exact random-access cost. A stream-copy result is only accepted when decoded samples remain bit-for-bit identical. A proxy result is only accepted as an exact review surrogate when its global frame ordinal remains one-to-one with the source; final clip extraction would still use the original source and the captured global frame IDs.
`;
}

function seconds(milliseconds) {
  return milliseconds === null || milliseconds === undefined ? '' : (milliseconds / 1000).toFixed(2);
}

function gib(bytes) {
  return bytes === null || bytes === undefined ? '' : (bytes / 2 ** 30).toFixed(2);
}

function number(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '' : Number(value).toFixed(2);
}

function yesNo(value) {
  if (value === undefined || value === null) return '';
  return value ? 'yes' : 'no';
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}
