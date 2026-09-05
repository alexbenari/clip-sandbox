import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { executeStreaming } from '../src/tooling/process.mjs';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const releaseRoot = path.join(spikeRoot, '.deps', 'vcpkg-installed', 'x64-mingw-release');
const artifactPath = path.join(spikeRoot, 'artifacts', 'bestsource-hardware-raw.json');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'bestsource-hardware-'));
const durationSeconds = numberOption('--duration', 10);
const hardwareDevice = stringOption('--device', 'd3d11va');
const selectedIds = stringOption('--targets', 'media-005,media-035').split(',').filter(Boolean);
const tools = {
  ffmpeg: path.join(releaseRoot, 'tools', 'ffmpeg', 'ffmpeg.exe'),
  bestSourceHarness: path.join(spikeRoot, 'build', 'bestsource-gate', 'bestsource_gate.exe'),
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
  settings: { durationSeconds, hardwareDevice, selectedIds, execution: 'sequential, separate indexes' },
  results: [],
};

try {
  const prepared = JSON.parse(await readFile(
    path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'), 'utf8'));
  for (const targetId of selectedIds) {
    const target = prepared.results?.find((candidate) => candidate.id === targetId);
    const source = target?.reviewAsset ?? target?.sourcePath;
    if (!source) throw new Error(`No prepared source is recorded for ${targetId}.`);
    const sample = await makeSample(source, targetId);
    console.log(`${targetId}: software index`);
    const software = await runProbe(sample, path.join(temporaryRoot, `${targetId}-software-index`), null);
    console.log(`${targetId}: ${hardwareDevice} index`);
    const hardware = await runProbe(sample, path.join(temporaryRoot, `${targetId}-${hardwareDevice}-index`),
      hardwareDevice);
    run.results.push({ targetId, source, software, hardware, comparison: compare(software, hardware) });
    await save();
  }
  run.completedAtUtc = new Date().toISOString();
  await save();
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function makeSample(source, targetId) {
  const destination = path.join(temporaryRoot, `${targetId}-sample.mkv`);
  await executeStreaming(tools.ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '600', '-i', source,
    '-t', String(durationSeconds), '-map', '0:v:0', '-c', 'copy',
    '-avoid_negative_ts', 'make_non_negative', destination,
  ], { env: environment, timeoutMs: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  return destination;
}

async function runProbe(source, cache, device) {
  const events = [];
  const started = performance.now();
  const env = { ...environment };
  if (device) env.BESTSOURCE_GATE_HW_DEVICE = device;
  try {
    await executeStreaming(tools.bestSourceHarness, ['probe', source, cache], {
      env,
      timeoutMs: 20 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
      onStdoutLine: (line) => events.push(JSON.parse(line)),
    });
    return summarize('complete', events, performance.now() - started);
  } catch (error) {
    return {
      ...summarize('failed', events, performance.now() - started),
      error: events.find((event) => event.type === 'error')?.message ?? boundedError(error),
    };
  }
}

function summarize(status, events, elapsedMs) {
  const source = events.find((event) => event.type === 'source') ?? null;
  return {
    status,
    elapsedMs,
    source,
    frames: events.filter((event) => event.type === 'frame').map((frame) => ({
      requestedFrame: frame.requestedFrame,
      originalFrame: frame.originalFrame,
      pts: frame.pts,
      frameInfoPts: frame.frameInfoPts,
      frameInfoHash: frame.frameInfoHash,
      rgbaHash: frame.rgbaHash,
    })),
  };
}

function compare(software, hardware) {
  if (software.status !== 'complete' || hardware.status !== 'complete') {
    return { pass: false, reason: 'candidate-failed' };
  }
  const sourceIdentity = ['numFrames', 'duration'].every((field) =>
    software.source[field] === hardware.source[field]) &&
    JSON.stringify(software.source.timebase) === JSON.stringify(hardware.source.timebase);
  const frameIdentity = software.frames.length === hardware.frames.length && software.frames.every((frame, index) => {
    const candidate = hardware.frames[index];
    return frame.requestedFrame === candidate?.requestedFrame && frame.originalFrame === candidate?.originalFrame &&
      frame.pts === candidate?.pts && frame.frameInfoPts === candidate?.frameInfoPts;
  });
  return {
    pass: sourceIdentity && frameIdentity,
    sourceIdentity,
    frameIdentity,
    exactFrameInfoHashMatches: software.frames.filter((frame, index) =>
      frame.frameInfoHash === hardware.frames[index]?.frameInfoHash).length,
    exactRgbaHashMatches: software.frames.filter((frame, index) =>
      frame.rgbaHash === hardware.frames[index]?.rgbaHash).length,
    sampledFrames: software.frames.length,
    speedup: software.elapsedMs / hardware.elapsedMs,
  };
}

async function save() {
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
}

function numberOption(name, fallback) {
  const value = Number(stringOption(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0 || value > 600) throw new Error(`${name} is invalid.`);
  return value;
}

function stringOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function boundedError(error) {
  const stderr = String(error?.stderr ?? '').trim().split(/\r?\n/).slice(-8).join(' | ');
  return (stderr || String(error?.message ?? error)).replaceAll('\n', ' ').slice(0, 800);
}
