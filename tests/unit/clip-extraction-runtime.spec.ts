import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const movieIdentity = {
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '123', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};

function exactFrame(frameIndex: number, pts: number) {
  return {
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(pts), duration: 40n,
    timebaseNumerator: 1n, timebaseDenominator: 1000n, frameInfoHash: frameIndex.toString(16).padStart(16, '0'),
  };
}

const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
const { ExactRangeEncoder } = require('../../electron/exact-range-encoder.cjs');

// The runtime with a real encoder, so these tests keep covering extraction from request to published file.
function runtimeWith({ fs, getSettings, randomId, provenance, ...encoding }: Record<string, any>) {
  return createClipExtractionRuntime({
    fs, getSettings, randomId, provenance, encoder: new ExactRangeEncoder({ fs, provenance, ...encoding }),
  });
}

// A probe that answers the cut's boundary times and accepts every encoded media.
function probeTiming(startUs: bigint, endUs: bigint, verifyEncoded = vi.fn(async () => undefined)) {
  return { frameBoundaries: vi.fn(async () => ({ startUs, endUs })), verifyEncoded };
}

/** The value that follows a command-line flag, such as `-c:v` -> `libx264`. */
function argumentAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('clip extraction runtime', () => {
  it('uses indexed source times to extract a late exact range without a whole-source probe', async () => {
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
    const probe = { frameBoundaries: vi.fn(async () => { throw new Error('whole-source probe used'); }), verifyEncoded: vi.fn(async () => undefined) };
    const runtime = runtimeWith({
      fs, getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'),
      probe, runCommand,
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
    expect(probe.frameBoundaries).not.toHaveBeenCalled();
    const videoArguments = runCommand.mock.calls[0][1];
    expect(Number(argumentAfter(videoArguments, '-ss'))).toBeLessThanOrEqual(55);
    expect(videoArguments.join(' ')).toContain('gte(pts,55000)');
    expect(videoArguments.join(' ')).toContain('lt(pts,55080)');
  });

  it('publishes one clip when the locally seeked media fails verification and the exact fallback encodes it again', async () => {
    const published: string[] = [];
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined),
      copyFile: vi.fn(async (_source: string, destination: string) => { published.push(path.basename(destination)); }),
      stat: vi.fn(async () => ({ isFile: () => true, size: 100, mtimeMs: 123 })),
    };
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      ok: true, code: 'completed',
      stderr: args.some(value => value.includes('showinfo'))
        ? '[Parsed_showinfo_1] config in time_base: 1/1000\n'
          + '[Parsed_showinfo_1] n: 0 pts: 55000 pts_time:55\n'
          + '[Parsed_showinfo_1] n: 1 pts: 55040 pts_time:55.04\n' : '',
    }));
    const verifyEncoded = vi.fn().mockRejectedValueOnce(new Error('The encoded media has the wrong number of frames.'))
      .mockResolvedValue(undefined);
    const runtime = runtimeWith({
      fs, getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'),
      probe: probeTiming(55_000_000n, 55_080_000n, verifyEncoded), runCommand,
      randomId: vi.fn(() => 'opaque12345678'),
    });
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
      extractionFrameIdentities: vi.fn(async () => [identity(10, 55000), identity(11, 55040)]),
    }, {
      operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 10, endFrameIndex: 11,
    });

    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-001.mp4' } });
    expect(published).toEqual(['Movie-001.mp4']);
  });

  function provenanceTestRuntime(runCommand: ReturnType<typeof vi.fn>, provenance: unknown) {
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined), copyFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 100, mtimeMs: 123 })),
    };
    const runtime = runtimeWith({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'),
      probe: probeTiming(0n, 100_000n), runCommand, provenance,
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const extractFramesTwoToFour = async () => {
      const destination = await runtime.openDestination(7);
      return runtime.extract(7, {
        prepareExtractionSource: vi.fn(async () => ({ sourcePath: 'D:\\movies\\Movie.mp4', selectedStream: 0, identity: movieIdentity })),
        extractionFrameIdentities: vi.fn(async () => [exactFrame(2, 80), exactFrame(4, 160)]),
      }, {
        operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
        sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
        collectionName: 'Movie', startFrameIndex: 2, endFrameIndex: 4,
      });
    };
    return { fs, extractFramesTwoToFour };
  }

  it('answers a failed extraction, and removes its workspace, when the review session gives malformed frame identities', async () => {
    const removed: string[] = [];
    const fs = {
      mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async (target: string) => { removed.push(target); }),
    };
    const runtime = runtimeWith({
      fs, getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'ffmpeg'), resolveFfprobe: vi.fn(() => 'ffprobe'), runCommand: vi.fn(),
      randomId: vi.fn(() => 'opaque12345678'),
    });
    const destination = await runtime.openDestination(7);

    const result = await runtime.extract(7, {
      prepareExtractionSource: vi.fn(async () => ({ sourcePath: 'D:\\movies\\Movie.mp4', selectedStream: 0, identity: movieIdentity })),
      extractionFrameIdentities: vi.fn(async () => null),
    }, {
      operationId: 'extract_12345678', destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_12345678', reviewSessionId: 'session_12345678', sourceGeneration: 1,
      collectionName: 'Movie', startFrameIndex: 2, endFrameIndex: 4,
    });

    expect(result).toMatchObject({ ok: false, code: 'extraction-failed' });
    expect(removed).toEqual(['D:\\pipelines\\extraction-tmp\\.clip-extraction-op']);
  });

  it('publishes media with a warning when provenance muxing fails', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => ({
      ok: !args.includes('clip-sandbox.prov.v1=record'),
      code: args.includes('clip-sandbox.prov.v1=record') ? 'process-failed' : 'completed',
    }));
    const provenance = {
      tagValueOf: vi.fn(() => 'record'),
      muxArguments: vi.fn(() => ['-movflags', '+faststart+use_metadata_tags', '-metadata', 'clip-sandbox.prov.v1=record']),
      readBack: vi.fn(),
    };
    const { fs, extractFramesTwoToFour } = provenanceTestRuntime(runCommand, provenance);

    const result = await extractFramesTwoToFour();

    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-001.mp4', warning: expect.stringContaining('metadata writer failed') } });
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(provenance.readBack).not.toHaveBeenCalled();
    expect(fs.copyFile).toHaveBeenCalledOnce();
  });

  it('tags the clip with a version 2 record naming both ends as reference frames, with their movie times', async () => {
    const { Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');
    const runCommand = vi.fn(async (_command: string, _args: string[]) => ({ ok: true, code: 'completed', stderr: '' }));
    const muxedTag = () => runCommand.mock.calls.flatMap(call => call[1])
      .find(value => value.startsWith('clip-sandbox.prov.v1='))?.slice('clip-sandbox.prov.v1='.length);
    const { extractFramesTwoToFour } = provenanceTestRuntime(runCommand, new Mp4Provenance({ tagReader: { read: async () => muxedTag() } }));

    const result = await extractFramesTwoToFour();

    expect(result).toMatchObject({ ok: true, result: { warning: undefined } });
    expect(JSON.parse(muxedTag()!)).toEqual({
      provenanceVersion: 2,
      sourceMovie: { displayName: 'Movie.mp4', fingerprint: { fingerprintVersion: 1, ...movieIdentity } },
      sourceFrameRange: { start: 2, end: 4, endInclusive: true, startTimeUs: 80_000, endTimeUs: 160_000 },
      referenceFrames: [{ frameIndex: 2, frameInfoHash: '0000000000000002' }, { frameIndex: 4, frameInfoHash: '0000000000000004' }],
    });
  });
  it('aborts active media work and finishes disposal only after its temporary workspace is removed', async () => {
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
    const runtime = runtimeWith({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      probe: probeTiming(1_000_000n, 2_000_000n),
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
    await expect(extraction).resolves.toEqual({ ok: false, code: 'cancelled', error: { message: 'Extraction was cancelled.' } });
  });

  it('publishes to the first unoccupied sequence without overwriting an external collision', async () => {
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
    const runtime = runtimeWith({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      probe: probeTiming(1_000_000n, 2_000_000n),
      runCommand: vi.fn(async (_command: string, args: string[]) => {
        const output = args.at(-1)!;
        if (output.endsWith('.mp4')) await fs.writeFile(output, 'media');
        return { ok: true, exitCode: 0 };
      }),
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

  it('encodes exactly the selected original frames as bitrate-capped H.264 in YUV 4:2:0', async () => {
    const fs = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      stat: vi.fn(async () => ({ isFile: () => true, size: 10, mtimeMs: 123 })),
      mkdtemp: vi.fn(async () => 'D:\\pipelines\\extraction-tmp\\.clip-extraction-op'),
      rm: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => undefined),
    };
    const runCommand = vi.fn(async (_command: string, _args: string[]) => ({ ok: true, exitCode: 0 }));
    const runtime = runtimeWith({
      fs,
      getSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: 'D:\\pipelines' } })),
      resolveFfmpeg: vi.fn(() => 'D:\\products\\ffmpeg.exe'),
      probe: probeTiming(1_000_000n, 2_000_000n),
      runCommand,
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
    expect(videoArguments.join(' ')).toContain('between(n,10,20)');
    expect(argumentAfter(videoArguments, '-frames:v')).toBe('11');
    expect(argumentAfter(videoArguments, '-c:v')).toBe('libx264');
    expect(argumentAfter(videoArguments, '-pix_fmt')).toBe('yuv420p');
    expect(argumentAfter(videoArguments, '-maxrate')).toMatch(/^\d+[kM]?$/);
  });

  it('rejects an unknown destination before preparing or running media work', async () => {
    const runCommand = vi.fn();
    const prepareExtractionSource = vi.fn();
    const runtime = runtimeWith({
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
