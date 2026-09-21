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
  it('aborts active media work and removes its temporary workspace during disposal', async () => {
    const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
    let commandSignal: AbortSignal | undefined;
    const runCommand = vi.fn(async (_command: string, _args: string[], options: { signal?: AbortSignal }) => {
      commandSignal = options.signal;
      return new Promise(resolve => {
        options.signal?.addEventListener('abort', () => resolve({ ok: false, code: 'cancelled' }), { once: true });
      });
    });
    const fs = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined),
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

    await expect(extraction).resolves.toMatchObject({ ok: false, code: 'cancelled' });
    expect(commandSignal?.aborted).toBe(true);
    expect(fs.rm).toHaveBeenCalledWith('D:\\pipelines\\extraction-tmp\\.clip-extraction-op', {
      recursive: true,
      force: true,
    });
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
