import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('shared native product locator', () => {
  it('resolves development FFmpeg and FFprobe from the frame-review manifest', () => {
    const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
    const existsSync = vi.fn(() => true);
    const readFileSync = vi.fn(() => JSON.stringify({
      ffmpeg: { path: 'D:\\products\\ffmpeg.exe' },
      ffprobe: { path: 'D:\\products\\ffprobe.exe' },
    }));
    const locator = new NativeProductLocator({
      projectFolder: 'D:\\repo',
      packaged: false,
      existsSync,
      readFileSync,
    });

    expect(locator.ffmpeg()).toBe(path.resolve('D:\\products\\ffmpeg.exe'));
    expect(locator.ffprobe()).toBe(path.resolve('D:\\products\\ffprobe.exe'));
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it('returns the staged packaged products and reports the recovery command when missing', () => {
    const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
    const locator = new NativeProductLocator({
      projectFolder: 'D:\\repo',
      resourcesPath: 'D:\\app\\resources',
      packaged: true,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    });

    expect(() => locator.ffmpeg()).toThrow(/frame-review:bootstrap.*frame-review:build/i);
  });
});

describe('clip extraction runtime', () => {
  it('declines local seeking for normalized sources and ambiguous indexed timestamps', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const runtime = createClipExtractionRuntime({
      getSettings: vi.fn(), resolveFfmpeg: vi.fn(), resolveFfprobe: vi.fn(),
    });
    const identity = (frameIndex: number, pts: number) => ({
      frameIndex, originalFrameIndex: frameIndex, pts: BigInt(pts), duration: 40n,
      timebaseNumerator: 1n, timebaseDenominator: 1000n,
    });
    const host = { extractionFrameTimeline: vi.fn(async () => [identity(10, 1000), identity(11, 1000), identity(12, 1080)]) };
    const source = { sourcePath: 'D:\\Movie.mp4', canonicalSourcePath: 'D:\\Movie.mp4',
      normalizedSourcePath: null, frameCount: 100, identity: {} };
    const request = { reviewSessionId: 'session_12345678', sourceHandle: 'source_12345678',
      startFrameIndex: 10, endFrameIndex: 11 };
    expect(await runtime.indexedBoundary(host, { ...source, normalizedSourcePath: 'D:\\normalized.mp4' },
      request, new AbortController().signal)).toBeNull();
    expect(host.extractionFrameTimeline).not.toHaveBeenCalled();
    expect(await runtime.indexedBoundary(host, source, request, new AbortController().signal)).toBeNull();
  });
  it('uses indexed source times to extract a late exact range without a whole-source probe', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined), copyFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 100, mtimeMs: 123 })),
    };
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      ok: true, code: 'completed',
      stderr: args.includes('showinfo') || args.some(value => value.includes('showinfo'))
        ? '[Parsed_showinfo_1] config in time_base: 1/1000\n'
          + '[Parsed_showinfo_1] n: 0 pts: 55000 pts_time:55\n'
          + '[Parsed_showinfo_1] n: 1 pts: 55040 pts_time:55.04\n'
          + '[Parsed_showinfo_1] n: 2 pts: 55080 pts_time:55.08\n'
        : '',
    }));
    const probeFrameTimes = vi.fn(async () => { throw new Error('whole-source probe used'); });
    const runtime = createClipExtractionRuntime({
      fs, getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'), resolveFfprobe: vi.fn(() => 'ffprobe'),
      probeFrameTimes, verifyMedia: vi.fn(async () => undefined), runCommand,
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);
    const identity = (frameIndex: number, pts: number) => ({
      frameIndex, originalFrameIndex: frameIndex, pts: BigInt(pts), duration: 40n,
      timebaseNumerator: 1n, timebaseDenominator: 1000n,
    });
    const result = await runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({
        sourcePath: 'D:\\movies\\Movie.mp4', canonicalSourcePath: 'D:\\movies\\Movie.mp4',
        normalizedSourcePath: null, frameCount: 100000, selectedStream: 0, identity: {},
      })),
      extractionFrameTimeline: vi.fn(async () => [identity(10, 55000), identity(11, 55040), identity(12, 55080)]),
      extractionFrameIdentities: vi.fn(async () => [identity(10, 55000), identity(11, 55040)]),
    }, {
      operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 10, endFrameIndex: 11,
    });

    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-001.mp4' } });
    expect(probeFrameTimes).not.toHaveBeenCalled();
    expect(runCommand.mock.calls[0][1]).toContain('50.000000');
    expect(runCommand.mock.calls[0][1]).toContain("select='gte(pts,55000)*lt(pts,55080)',showinfo,setpts=PTS-STARTPTS");
  });

  it('discards a failed local media candidate before the exact fallback publishes', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined), copyFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 100, mtimeMs: 123 })),
    };
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      ok: true, code: 'completed',
      stderr: args.some(value => value.includes('showinfo'))
        ? '[Parsed_showinfo_1] config in time_base: 1/1000\n'
          + '[Parsed_showinfo_1] n: 0 pts: 55000 pts_time:55\n'
          + '[Parsed_showinfo_1] n: 1 pts: 55040 pts_time:55.04\n' : '',
    }));
    const probeFrameTimes = vi.fn(async () => ({ startUs: 55_000_000n, endUs: 55_080_000n }));
    const runtime = createClipExtractionRuntime({
      fs, getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'), resolveFfprobe: vi.fn(() => 'ffprobe'),
      probeFrameTimes, runCommand, randomId: vi.fn(() => 'opaque12345678'),
    });
    runtime.finalizeMedia = vi.fn().mockResolvedValueOnce({ ok: false, code: 'unverified-media' })
      .mockResolvedValueOnce({ ok: true });
    const identity = (frameIndex: number, pts: number) => ({
      frameIndex, originalFrameIndex: frameIndex, pts: BigInt(pts), duration: 40n,
      timebaseNumerator: 1n, timebaseDenominator: 1000n,
    });
    const destination = await runtime.openDestination(7);
    const result = await runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({
        sourcePath: 'D:\\Movie.mp4', canonicalSourcePath: 'D:\\Movie.mp4',
        normalizedSourcePath: null, frameCount: 100, selectedStream: 0, identity: {},
      })),
      extractionFrameTimeline: vi.fn(async () => [identity(10, 55000), identity(11, 55040), identity(12, 55080)]),
    }, {
      operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 10, endFrameIndex: 11,
    });
    expect(result).toMatchObject({ ok: true });
    expect(probeFrameTimes).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(fs.rm).toHaveBeenCalledWith(expect.stringMatching(/video\.mp4$/), { force: true });
    expect(fs.rm).toHaveBeenCalledWith(expect.stringMatching(/media\.mp4$/), { force: true });
    expect(fs.copyFile).toHaveBeenCalledOnce();
  });

  it('publishes media with a warning when provenance muxing fails', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined), copyFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 100, mtimeMs: 123 })),
    };
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      ok: !args.includes('clip-sandbox.prov.v1=record'),
      code: args.includes('clip-sandbox.prov.v1=record') ? 'process-failed' : 'completed',
    }));
    const provenance = {
      create: vi.fn(() => 'record'),
      muxArguments: vi.fn(() => ['-movflags', '+faststart+use_metadata_tags', '-metadata', 'clip-sandbox.prov.v1=record']),
      readBack: vi.fn(),
    };
    const runtime = createClipExtractionRuntime({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'), resolveFfprobe: vi.fn(() => 'ffprobe'),
      probeFrameTimes: vi.fn(async () => ({ startUs: 0n, endUs: 100_000n })),
      verifyMedia: vi.fn(async () => undefined), runCommand, provenance,
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);
    const result = await runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({ sourcePath: 'D:\\movies\\Movie.mp4', selectedStream: 0, identity: {} })),
      extractionFrameIdentities: vi.fn(async () => [
        { frameIndex: 2, originalFrameIndex: 2 }, { frameIndex: 4, originalFrameIndex: 4 },
      ]),
    }, {
      operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 2, endFrameIndex: 4,
    });

    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-001.mp4', warning: expect.stringContaining('metadata writer failed') } });
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(provenance.readBack).not.toHaveBeenCalled();
    expect(fs.copyFile).toHaveBeenCalledOnce();
  });

  it('aborts active media work and finishes disposal only after its temporary workspace is removed', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    let commandSignal: AbortSignal | undefined;
    const runCommand = vi.fn(async (_command: string, _args: string[], options: { signal?: AbortSignal }) => {
      commandSignal = options.signal;
      return new Promise(resolve => {
        options.signal?.addEventListener('abort', () => resolve({ ok: false, code: 'cancelled' }), { once: true });
      });
    });
    const removedPaths: string[] = [];
    const fs = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      // Removing a real folder takes time; app shutdown must not finish before it does.
      rm: vi.fn(async (target: string) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        removedPaths.push(target);
      }),
    };
    const runtime = createClipExtractionRuntime({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      resolveFfprobe: vi.fn(() => 'D:\\products\\ffprobe.exe'),
      probeFrameTimes: vi.fn(async () => ({ startUs: 1_000_000n, endUs: 2_000_000n })),
      runCommand,
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);
    const extraction = runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({ sourcePath: 'D:\\movies\\Movie.mkv', selectedStream: 0 })),
    }, {
      operationId: 'extract_12345678',
      destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678',
      sourceGeneration: 1,
      collectionName: 'Movie',
      startFrameIndex: 10,
      endFrameIndex: 20,
    });
    await vi.waitFor(() => expect(runCommand).toHaveBeenCalledOnce());

    await runtime.dispose();

    expect(commandSignal?.aborted).toBe(true);
    expect(removedPaths).toContain('D:\\pipelines\\extraction-tmp\\.clip-extraction-op');
    await expect(extraction).resolves.toMatchObject({ ok: false, code: 'cancelled' });
  });

  it('publishes to the first unoccupied sequence without overwriting an external collision', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const copied: string[] = [];
    let collision = true;
    const fs = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn(),
      stat: vi.fn(async () => ({ isFile: () => true, size: 10, mtimeMs: 123 })),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined),
      copyFile: vi.fn(async (_source: string, destination: string) => {
        copied.push(destination);
        if (collision) {
          collision = false;
          const error = Object.assign(new Error('exists'), { code: 'EEXIST' });
          throw error;
        }
      }),
      unlink: vi.fn(async () => undefined),
    };
    const runtime = createClipExtractionRuntime({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      resolveFfprobe: vi.fn(() => 'D:\\products\\ffprobe.exe'),
      probeFrameTimes: vi.fn(async () => ({ startUs: 1_000_000n, endUs: 2_000_000n })),
      runCommand: vi.fn(async (_command: string, args: string[]) => {
        const output = args.at(-1)!;
        if (output.endsWith('.mp4')) await fs.writeFile(output, 'media');
        return { ok: true, exitCode: 0 };
      }),
      verifyMedia: vi.fn(async () => undefined),
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);
    const host = {
      prepareExtractionSource: vi.fn(async () => ({
        sourcePath: 'D:\\movies\\Movie.mkv', selectedStream: 0,
      })),
    };

    const result = await runtime.extract(7, host, {
      operationId: 'extract_12345678',
      destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678',
      sourceGeneration: 1,
      collectionName: 'Movie',
      startFrameIndex: 10,
      endFrameIndex: 20,
    });

    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-002.mp4' } });
    expect(copied.map(value => path.basename(value))).toEqual(['Movie-001.mp4', 'Movie-002.mp4']);
  });

  it('encodes selected original frames as high-quality bounded YUV video', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const fs = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      stat: vi.fn(async () => ({ isFile: () => true, size: 10, mtimeMs: 123 })),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => undefined),
    };
    const runCommand = vi.fn(async (_command: string, _args: string[]) => ({ ok: true, exitCode: 0 }));
    const runtime = createClipExtractionRuntime({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      resolveFfprobe: vi.fn(() => 'D:\\products\\ffprobe.exe'),
      probeFrameTimes: vi.fn(async () => ({ startUs: 1_000_000n, endUs: 2_000_000n })),
      runCommand,
      verifyMedia: vi.fn(async () => undefined),
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);

    await runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({ sourcePath: 'D:\\movies\\Movie.mkv', selectedStream: 0 })),
    }, {
      operationId: 'extract_12345678',
      destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678',
      sourceGeneration: 1,
      collectionName: 'Movie',
      startFrameIndex: 10,
      endFrameIndex: 20,
    });

    const videoArguments = runCommand.mock.calls[0][1];
    expect(videoArguments).toContain("select='between(n,10,20)',setpts=PTS-STARTPTS");
    expect(videoArguments).toContain('-frames:v');
    expect(videoArguments).toContain('11');
    expect(videoArguments).toContain('libx264');
    expect(videoArguments).toContain('yuv420p');
    expect(videoArguments).toContain('-crf');
    expect(videoArguments).toContain('16');
    expect(videoArguments).toContain('-maxrate');
    expect(videoArguments).toContain('48M');
    expect(videoArguments).toContain('-bufsize');
    expect(videoArguments).toContain('96M');
    expect(videoArguments).not.toContain('libx264rgb');
    expect(videoArguments).not.toContain('-qp');
  });

  it('rejects an unknown destination before preparing or running media work', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    const runCommand = vi.fn();
    const prepareExtractionSource = vi.fn();
    const runtime = createClipExtractionRuntime({
      fs: {},
      getSettings: vi.fn(),
      resolveFfmpeg: vi.fn(),
      resolveFfprobe: vi.fn(),
      runCommand,
      randomId: vi.fn(() => 'opaque12345678'),
    });

    const result = await runtime.extract(3, { prepareExtractionSource }, {
      operationId: 'extract_12345678',
      destinationHandle: 'destination_12345678',
      sourceHandle: 'source_12345678',
      sourceGeneration: 1,
      collectionName: 'Movie',
      startFrameIndex: 0,
      endFrameIndex: 1,
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid-destination' });
    expect(prepareExtractionSource).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
