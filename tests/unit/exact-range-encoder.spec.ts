import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ExactRangeEncoder } = require('../../electron/exact-range-encoder.cjs');

function identity(frameIndex: number, pts: number) {
  return {
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(pts), duration: 40n,
    timebaseNumerator: 1n, timebaseDenominator: 1000n,
  };
}

const source = { sourcePath: 'D:\\Movie.mp4', canonicalSourcePath: 'D:\\Movie.mp4',
  normalizedSourcePath: null, frameCount: 100, selectedStream: 0, identity: {} };
const range = { reviewSessionId: 'session_12345678', sourceHandle: 'source_12345678', startFrameIndex: 10, endFrameIndex: 11 };
const workspace = 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op';
const SEEKED_FRAMES = '[Parsed_showinfo_1] config in time_base: 1/1000\n'
  + '[Parsed_showinfo_1] n: 0 pts: 55000 pts_time:55\n'
  + '[Parsed_showinfo_1] n: 1 pts: 55040 pts_time:55.04\n';

// An encoder whose FFmpeg runs succeed, recording the video filter of each video encode.
function recordingEncoder({ verifyMedia = vi.fn(async () => undefined), events = [] as string[] } = {}) {
  const runCommand = vi.fn(async (_command: string, args: string[]) => {
    const commandLine = args.join(' ');
    if (commandLine.includes('showinfo')) events.push('encode by indexed timestamps');
    else if (commandLine.includes('between(n,10,11)')) events.push('encode by full decode');
    return { ok: true, code: 'completed', stderr: commandLine.includes('showinfo') ? SEEKED_FRAMES : '' };
  });
  const fs = { rm: vi.fn(async (target: string) => { events.push(`remove ${path.basename(target)}`); }) };
  const encoder = new ExactRangeEncoder({
    fs, resolveFfmpeg: () => 'ffmpeg', resolveFfprobe: () => 'ffprobe', runCommand, verifyMedia,
    probeFrameTimes: vi.fn(async () => ({ startUs: 55_000_000n, endUs: 55_080_000n })),
  });
  const encode = (host: object, encodedSource = source) => encoder.encode({
    host, source: encodedSource, range, tagValue: null, workspace, signal: new AbortController().signal,
  });
  return { encode, events };
}

const timeline = (...frames: ReturnType<typeof identity>[]) => ({ extractionFrameTimeline: vi.fn(async () => frames) });

describe('ExactRangeEncoder', () => {
  it('encodes a normalized source by full decode', async () => {
    const { encode, events } = recordingEncoder();

    const result = await encode(timeline(identity(10, 55000), identity(11, 55040), identity(12, 55080)),
      { ...source, normalizedSourcePath: 'D:\\normalized.mp4' });

    expect(result).toMatchObject({ ok: true });
    expect(events).toEqual(['encode by full decode']);
  });

  it('encodes by full decode when indexed timestamps repeat', async () => {
    const { encode, events } = recordingEncoder();

    const result = await encode(timeline(identity(10, 55000), identity(11, 55000), identity(12, 55080)));

    expect(result).toMatchObject({ ok: true });
    expect(events).toEqual(['encode by full decode']);
  });

  it('discards the locally seeked media that failed verification before encoding again by full decode', async () => {
    const verifyMedia = vi.fn().mockRejectedValueOnce(new Error('The encoded media has the wrong number of frames.'))
      .mockResolvedValue(undefined);
    const { encode, events } = recordingEncoder({ verifyMedia });

    const result = await encode(timeline(identity(10, 55000), identity(11, 55040), identity(12, 55080)));

    const fullDecode = events.indexOf('encode by full decode');
    expect(fullDecode).toBeGreaterThan(-1);
    expect(events.slice(0, fullDecode)).toEqual(expect.arrayContaining(['remove video.mp4', 'remove media.mp4']));
    expect(result).toEqual({ ok: true, mediaPath: path.join(workspace, 'media.mp4'), warning: undefined });
  });
});
