import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  REVIEW_PROXY_PROFILE_GOP_1,
  selectPreviewAudioStream,
} from '../src/preparation/all-intra-proxy-preparation.mjs';
import {
  buildBoundedSoftwareProxyArgs,
  buildQsvDecodeProxyArgs,
} from '../src/preparation/ffmpeg-hardware-diagnostic.mjs';
import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const acceleratedReleaseRoot = path.join(
  spikeRoot, '.deps', 'phase3c-vcpkg-installed', 'x64-mingw-release');
const outputRoot = path.join(spikeRoot, 'artifacts', 'phase3c-preparation-acceleration');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'phase3c-preparation-'));
const durationSeconds = numericOption('--duration', 60, 1, 600);
const startSeconds = numericOption('--start', 600, 0, 86_400);
const selectedIds = listOption('--targets', ['media-005', 'media-035']);
const artifactPath = path.join(spikeRoot, 'artifacts',
  `preparation-acceleration-${durationSeconds}s-${selectedIds.join('-')}-raw.json`);
const latestArtifactPath = path.join(spikeRoot, 'artifacts', 'preparation-acceleration-raw.json');
const systemFfmpeg = process.env.PHASE3C_FFMPEG ??
  path.join(acceleratedReleaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe');
const tools = {
  softwareFfmpeg: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe'),
  ffprobe: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffprobe.exe'),
  bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
  hardwareFfmpeg: systemFfmpeg,
};
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

const run = {
  schemaVersion: 1,
  startedAtUtc: new Date().toISOString(),
  completedAtUtc: null,
  settings: { durationSeconds, startSeconds, selectedIds, execution: 'sequential' },
  machine: {
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? 'unknown',
  },
  tools: {},
  results: [],
};

try {
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(Object.values(tools).map(requireFile));
  run.tools = {
    softwareFfmpeg: await toolSummary(tools.softwareFfmpeg),
    hardwareFfmpeg: await toolSummary(tools.hardwareFfmpeg),
  };
  const raw = JSON.parse(await readFile(path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'), 'utf8'));
  for (const targetId of selectedIds) {
    const sourceResult = raw.results?.find((candidate) => candidate.id === targetId);
    const source = sourceResult?.reviewAsset ?? sourceResult?.sourcePath;
    if (!source) throw new Error(`No prepared source is recorded for ${targetId}.`);
    const selectedAudio = await selectAudio(source);
    const sample = await makeSample(source, targetId, selectedAudio?.audioOrdinal ?? null);
    const target = { targetId, source, sample, selectedAudio, candidates: [] };
    console.log(`${targetId}: software baseline`);
    target.candidates.push(await runCandidate(targetId, 'software', sample.path,
      selectedAudio ? 0 : null, sample.video));
    console.log(`${targetId}: QSV decode/scale diagnostic`);
    target.candidates.push(await runCandidate(targetId, 'qsv-decode-scale', sample.path,
      selectedAudio ? 0 : null, sample.video));
    target.visualQuality = await compareVisualQuality(
      candidateDestination(targetId, 'software'),
      candidateDestination(targetId, 'qsv-decode-scale'),
      target.candidates,
    );
    target.comparison = compareCandidates(target.candidates);
    target.comparison.visualQualityAccepted = target.visualQuality.accepted;
    target.comparison.pass = target.comparison.pass && target.visualQuality.accepted;
    run.results.push(target);
    await saveRun();
  }
  run.completedAtUtc = new Date().toISOString();
  await saveRun();
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function runCandidate(targetId, mode, source, audioOrdinal, sourceVideo) {
  const destination = candidateDestination(targetId, mode);
  const logPath = path.join(outputRoot, `${targetId}-${mode}.log`);
  const targetWidth = Math.min(REVIEW_PROXY_PROFILE_GOP_1.maxWidth, sourceVideo.width);
  const targetHeight = Math.max(2, Math.round(sourceVideo.height * targetWidth / sourceVideo.width / 2) * 2);
  const bounds = {
    startSeconds: 0,
    durationSeconds: null,
    sourceCodec: sourceVideo.codec,
    targetWidth,
    targetHeight,
  };
  const args = mode === 'software'
    ? buildBoundedSoftwareProxyArgs(source, destination, REVIEW_PROXY_PROFILE_GOP_1, audioOrdinal, bounds)
    : buildQsvDecodeProxyArgs(source, destination, REVIEW_PROXY_PROFILE_GOP_1, audioOrdinal, bounds);
  const executable = mode === 'software' ? tools.softwareFfmpeg : tools.hardwareFfmpeg;
  if (mode !== 'software') args[args.indexOf('-loglevel') + 1] = 'verbose';
  const started = performance.now();
  try {
    const processResult = await executeStreaming(executable, args, {
      env: environment,
      timeoutMs: 30 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const elapsedMs = performance.now() - started;
    await writeFile(logPath, processResult.stderr, 'utf8');
    const media = await probeMedia(destination);
    const frames = await probeBestSource(destination, path.join(temporaryRoot, `${targetId}-${mode}-index`),
      media.videoFrames);
    return {
      mode,
      status: 'complete',
      elapsedMs,
      outputBytes: (await stat(destination)).size,
      media,
      frames,
      hardwareEvidence: mode === 'software' ? null : hardwareEvidence(processResult.stderr),
      logPath,
    };
  } catch (error) {
    const stderr = String(error?.stderr ?? '');
    await writeFile(logPath, stderr || String(error?.stack ?? error), 'utf8');
    return {
      mode,
      status: 'failed',
      elapsedMs: performance.now() - started,
      error: boundedError(error),
      hardwareEvidence: mode === 'software' ? null : hardwareEvidence(stderr),
      logPath,
    };
  }
}

function candidateDestination(targetId, mode) {
  return path.join(temporaryRoot, `${targetId}-${mode}.mkv`);
}

async function compareVisualQuality(softwarePath, hardwarePath, candidates) {
  if (candidates.some((candidate) => candidate.status !== 'complete')) {
    return { accepted: false, reason: 'candidate-failed' };
  }
  const psnr = await runVisualMetric('psnr', softwarePath, hardwarePath, /average:([0-9.]+)/);
  const ssim = await runVisualMetric('ssim', softwarePath, hardwarePath, /All:([0-9.]+)/);
  return {
    accepted: psnr >= 40 && ssim >= 0.99,
    psnrAverageDb: psnr,
    ssimAll: ssim,
    thresholds: { psnrAverageDb: 40, ssimAll: 0.99 },
  };
}

async function runVisualMetric(filter, softwarePath, hardwarePath, pattern) {
  const { stderr } = await executeStreaming(tools.softwareFfmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'info',
    '-i', softwarePath, '-i', hardwarePath,
    '-filter_complex', `[0:v]setpts=N[software];[1:v]setpts=N[hardware];[software][hardware]${filter}`,
    '-an', '-f', 'null', '-',
  ], { env: environment, timeoutMs: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  const matches = [...stderr.matchAll(new RegExp(pattern.source, 'g'))];
  const value = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`Unable to parse ${filter} comparison output.`);
  return value;
}

async function makeSample(source, targetId, audioOrdinal) {
  const destination = path.join(temporaryRoot, `${targetId}-source-sample.mkv`);
  const audioMap = audioOrdinal === null ? [] : ['-map', `0:a:${audioOrdinal}?`];
  const started = performance.now();
  await executeStreaming(tools.softwareFfmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(startSeconds), '-i', source, '-t', String(durationSeconds),
    '-map', '0:v:0', ...audioMap, '-map_metadata', '-1', '-sn', '-dn',
    '-c', 'copy', '-avoid_negative_ts', 'make_non_negative', destination,
  ], { env: environment, timeoutMs: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  const video = await probeVideoStream(destination);
  return {
    path: destination,
    elapsedMs: performance.now() - started,
    bytes: (await stat(destination)).size,
    video,
    excludedFromCandidateTiming: true,
  };
}

async function probeVideoStream(file) {
  const { stdout } = await executeStreaming(tools.ffprobe, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', file,
  ], { env: environment, timeoutMs: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const stream = JSON.parse(stdout.replace(/^\uFEFF/, '')).streams?.[0];
  if (typeof stream?.codec_name !== 'string' || !Number.isSafeInteger(stream?.width) ||
      !Number.isSafeInteger(stream?.height)) {
    throw new Error('Prepared sample has no valid video metadata.');
  }
  return { codec: stream.codec_name, width: stream.width, height: stream.height };
}

async function selectAudio(source) {
  const { stdout } = await executeStreaming(tools.ffprobe, [
    '-v', 'error', '-select_streams', 'a', '-show_entries',
    'stream=index,codec_name,channels:stream_disposition=default,comment,visual_impaired,descriptions:' +
      'stream_tags=language,title', '-of', 'json', source,
  ], { env: environment, timeoutMs: 60_000, maxBuffer: 4 * 1024 * 1024 });
  return selectPreviewAudioStream(JSON.parse(stdout.replace(/^\uFEFF/, '')).streams ?? []);
}

async function probeMedia(file) {
  const { stdout } = await executeStreaming(tools.ffprobe, [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=index,codec_type,codec_name,width,height,pix_fmt,nb_read_frames,channels,sample_rate',
    '-of', 'json', file,
  ], { env: environment, timeoutMs: 5 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  const streams = JSON.parse(stdout.replace(/^\uFEFF/, '')).streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  return {
    videoFrames: Number(video?.nb_read_frames),
    videoCodec: video?.codec_name ?? null,
    width: Number(video?.width),
    height: Number(video?.height),
    pixelFormat: video?.pix_fmt ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioChannels: Number(audio?.channels ?? 0),
    audioSampleRate: Number(audio?.sample_rate ?? 0),
  };
}

async function probeBestSource(file, indexPath, frameCount) {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) throw new Error('Encoded output has no countable video frames.');
  const sampledIndices = [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])];
  const indices = frameCount <= 2_500
    ? Array.from({ length: frameCount }, (_, index) => index)
    : sampledIndices;
  const events = [];
  await executeStreaming(tools.bestSourceHarness, ['probe', file, indexPath, indices.join(',')], {
    env: environment,
    timeoutMs: 10 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
    onStdoutLine: (line) => events.push(JSON.parse(line)),
  });
  const source = events.find((event) => event.type === 'source');
  const frames = events.filter((event) => event.type === 'frame');
  const numerator = BigInt(source.timebase.numerator);
  const denominator = BigInt(source.timebase.denominator);
  const timelinePtsUs = frames.map((frame) =>
    (BigInt(frame.pts) * numerator * 1_000_000n / denominator).toString());
  return {
    indexedFrames: source.numFrames,
    timelineCoverage: indices.length === frameCount ? 'complete' : 'sampled',
    timelinePtsUs,
    samples: frames.filter((frame) => sampledIndices.includes(frame.requestedFrame)).map((frame) => ({
      frameIndex: frame.requestedFrame,
      ptsUs: (BigInt(frame.pts) * numerator * 1_000_000n / denominator).toString(),
      rgbaHash: frame.rgbaHash,
    })),
  };
}

function compareCandidates(candidates) {
  const software = candidates.find((candidate) => candidate.mode === 'software');
  const hardware = candidates.find((candidate) => candidate.mode === 'qsv-decode-scale');
  if (software?.status !== 'complete' || hardware?.status !== 'complete') {
    return { pass: false, reason: 'candidate-failed' };
  }
  const softwareOriginUs = BigInt(software.frames.samples[0].ptsUs);
  const hardwareOriginUs = BigInt(hardware.frames.samples[0].ptsUs);
  const timelineMatch = software.frames.samples.every((frame, index) => {
    const hardwareFrame = hardware.frames.samples[index];
    return frame.frameIndex === hardwareFrame?.frameIndex &&
      BigInt(frame.ptsUs) - softwareOriginUs === BigInt(hardwareFrame.ptsUs) - hardwareOriginUs;
  });
  const timeline = compareTimelines(software.frames, hardware.frames);
  const exactPixelHashMatches = software.frames.samples.filter((frame, index) =>
    frame.rgbaHash === hardware.frames.samples[index]?.rgbaHash).length;
  const contract = hardware.media.videoCodec === 'mpeg4' && hardware.media.width <= 960 &&
    hardware.media.pixelFormat === 'yuv420p' && hardware.media.audioCodec === 'aac' &&
    hardware.media.audioChannels === 2 && hardware.media.audioSampleRate === 48_000;
  return {
    pass: contract && timeline.accepted && software.media.videoFrames === hardware.media.videoFrames &&
      software.frames.indexedFrames === hardware.frames.indexedFrames,
    contract,
    timelineMatch,
    timeline,
    frameCountMatch: software.media.videoFrames === hardware.media.videoFrames,
    indexCountMatch: software.frames.indexedFrames === hardware.frames.indexedFrames,
    exactPixelHashMatches,
    sampledFrames: software.frames.samples.length,
    speedup: software.elapsedMs / hardware.elapsedMs,
  };
}

function compareTimelines(software, hardware) {
  if (software.timelinePtsUs.length !== hardware.timelinePtsUs.length) {
    return { exact: false, comparableFrames: 0, reason: 'timeline-length-mismatch' };
  }
  const softwareOrigin = BigInt(software.timelinePtsUs[0]);
  const hardwareOrigin = BigInt(hardware.timelinePtsUs[0]);
  let divergentFrames = 0;
  let maxAbsoluteDeltaUs = 0n;
  let softwareMonotonic = true;
  let hardwareMonotonic = true;
  for (let index = 0; index < software.timelinePtsUs.length; index += 1) {
    const softwareRelative = BigInt(software.timelinePtsUs[index]) - softwareOrigin;
    const hardwareRelative = BigInt(hardware.timelinePtsUs[index]) - hardwareOrigin;
    const delta = softwareRelative - hardwareRelative;
    const absoluteDelta = delta < 0n ? -delta : delta;
    if (absoluteDelta !== 0n) divergentFrames += 1;
    if (absoluteDelta > maxAbsoluteDeltaUs) maxAbsoluteDeltaUs = absoluteDelta;
    if (index > 0) {
      softwareMonotonic = softwareMonotonic && BigInt(software.timelinePtsUs[index]) >=
        BigInt(software.timelinePtsUs[index - 1]);
      hardwareMonotonic = hardwareMonotonic && BigInt(hardware.timelinePtsUs[index]) >=
        BigInt(hardware.timelinePtsUs[index - 1]);
    }
  }
  const completeCoverage = software.timelineCoverage === 'complete' && hardware.timelineCoverage === 'complete';
  const accepted = completeCoverage && softwareMonotonic && hardwareMonotonic && maxAbsoluteDeltaUs <= 1_000n;
  return {
    exact: divergentFrames === 0,
    accepted,
    toleranceUs: 1_000,
    coverage: completeCoverage ? 'complete' : 'sampled',
    comparableFrames: software.timelinePtsUs.length,
    divergentFrames,
    maxAbsoluteDeltaUs: Number(maxAbsoluteDeltaUs),
    softwareMonotonic,
    hardwareMonotonic,
  };
}

function hardwareEvidence(stderr) {
  const lines = stderr.split(/\r?\n/).filter((line) => /qsv|mfx|hardware frame|intel/i.test(line));
  return {
    qsvMentioned: lines.some((line) => /qsv|mfx/i.test(line)),
    lines: lines.slice(0, 12),
  };
}

async function toolSummary(executable) {
  const version = await executeStreaming(executable, ['-version'], {
    env: environment, timeoutMs: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  const acceleration = await executeStreaming(executable, ['-hide_banner', '-hwaccels'], {
    env: environment, timeoutMs: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  return {
    executable,
    version: version.stdout.split(/\r?\n/)[0],
    hardwareAccelerationMethods: acceleration.stdout.split(/\r?\n/).slice(1).filter(Boolean),
  };
}

async function saveRun() {
  const contents = `${JSON.stringify(run, null, 2)}\n`;
  await Promise.all([
    writeFile(artifactPath, contents, 'utf8'),
    writeFile(latestArtifactPath, contents, 'utf8'),
  ]);
}

function numericOption(name, fallback, minimum, maximum) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid.`);
  return value;
}

function listOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1].split(',').filter(Boolean);
}

function boundedError(error) {
  const stderr = String(error?.stderr ?? '').trim().split(/\r?\n/).slice(-8).join(' | ');
  return (stderr || String(error?.message ?? error)).replaceAll('\n', ' ').slice(0, 800);
}

async function requireFile(file) {
  try { await access(file); } catch { throw new Error(`Required Phase 3C tool is missing: ${file}`); }
}
