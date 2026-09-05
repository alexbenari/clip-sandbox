import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { decodeFrameCodeFromRgba } from './frame-code.mjs';
import { execute } from './process.mjs';

export async function inspectFixture(ffmpeg, ffprobe, fixturePath) {
  const { stdout: probeText } = await execute(ffprobe, [
    '-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_frames',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,time_base,start_time,duration,nb_frames,field_order:frame=best_effort_timestamp,pkt_duration,pkt_pts,pkt_dts',
    '-of', 'json', fixturePath,
  ], { timeoutMs: 60_000, maxBuffer: 32 * 1024 * 1024 });
  const probe = JSON.parse(probeText);
  const stream = probe.streams?.[0];
  if (!stream) throw new Error(`No video stream in ${fixturePath}`);

  const { stdout: raw } = await execute(ffmpeg, [
    '-v', 'error', '-noautorotate', '-i', fixturePath, '-map', '0:v:0', '-vsync', '0',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { timeoutMs: 120_000, maxBuffer: 128 * 1024 * 1024, encoding: 'buffer' });
  const frameSize = Number(stream.width) * Number(stream.height) * 4;
  if (raw.length % frameSize !== 0) throw new Error(`Raw decoded size is not frame-aligned for ${fixturePath}`);
  const decodedCount = raw.length / frameSize;
  if (decodedCount !== probe.frames.length) {
    throw new Error(`Decoded ${decodedCount} frames but FFprobe described ${probe.frames.length} for ${fixturePath}`);
  }

  const frames = probe.frames.map((frame, frameIndex) => {
    const rgba = raw.subarray(frameIndex * frameSize, (frameIndex + 1) * frameSize);
    return {
      frameIndex,
      sourceCode: decodeFrameCodeFromRgba(rgba, Number(stream.width), Number(stream.height)),
      pts: integerString(frame.best_effort_timestamp ?? frame.pkt_pts),
      duration: nullableIntegerString(frame.pkt_duration),
    };
  });
  return {
    path: path.resolve(fixturePath),
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    width: Number(stream.width),
    height: Number(stream.height),
    timebase: parseRational(stream.time_base),
    fieldOrder: stream.field_order ?? 'unknown',
    frames,
  };
}

export async function loadResolvedDependencies(spikeRoot) {
  const text = await readFile(path.join(spikeRoot, '.deps', 'resolved-dependencies.json'), 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function parseRational(value) {
  const [numerator, denominator] = String(value).split('/').map(Number);
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    throw new Error(`Invalid rational ${value}`);
  }
  return { numerator, denominator };
}

function integerString(value) {
  if (!/^-?\d+$/.test(String(value))) throw new Error(`Expected integer timestamp, got ${value}`);
  return String(value);
}

function nullableIntegerString(value) {
  return value === undefined || value === null || value === 'N/A' ? null : integerString(value);
}
