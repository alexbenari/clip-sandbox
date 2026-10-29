// @vitest-environment node
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { MovieWindowCache } = require('../../electron/movie-window-cache.cjs');

type CommandResult = { ok: boolean; code: string; stderr: string };
type RunCommand = (command: string, args: string[], options: { signal: AbortSignal; env: unknown }) => Promise<CommandResult>;

const fingerprint = {
  fingerprintVersion: 1,
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '900000000', sourceDurationUs: '5400000000',
  signatureProfileVersion: 'sample-v1', selectedStream: 2, streamMetadataDigest: 'b'.repeat(64),
};
const sourceMovie = { displayName: 'Sample Feature.mkv', fingerprint };
const environment = { PATH: 'test-path' };
const moviePath = path.resolve('movies', 'Sample Feature.mkv');

function placement(startUs: number, durationUs = 150_000_000) {
  return { moviePath, sourceMovie, startUs, durationUs };
}

function optionValues(args: readonly string[], option: string): string[] {
  return args.flatMap((arg, index) => (arg === option ? [args[index + 1]] : []));
}

// The fake FFmpeg names what it cut, so a test can tell which window a file holds.
function cutContent(args: readonly string[]): string {
  return `${optionValues(args, '-map').join(' ')} from ${optionValues(args, '-ss')} for ${optionValues(args, '-t')}`;
}

const cutWindow: RunCommand = async (_command, args) => {
  await fs.writeFile(args.at(-1)!, cutContent(args));
  return { ok: true, code: 'completed', stderr: '' };
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

describe('MovieWindowCache', () => {
  let folder: string;
  let clock: number;

  beforeEach(async () => {
    folder = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'movie-window-cache-')), 'movie-window-cache');
    clock = 1_000;
  });

  afterEach(async () => {
    await fs.rm(path.dirname(folder), { recursive: true, force: true });
  });

  function cache({
    runCommand = vi.fn(cutWindow),
    forgetPreparedReview = vi.fn(async (_windowPath: string) => undefined),
  }: { runCommand?: ReturnType<typeof vi.fn>; forgetPreparedReview?: (windowPath: string) => Promise<void> } = {}) {
    const instance = new MovieWindowCache({
      folder, resolveFfmpeg: () => 'ffmpeg.exe', environment, forgetPreparedReview, runCommand,
      now: () => clock,
    });
    return { cache: instance, runCommand };
  }

  it('cuts a new window from the movie by stream copy of its selected video stream and first audio track', async () => {
    const { cache: windows, runCommand } = cache();

    await windows.window(placement(12_500_000, 150_000_000));

    const args: string[] = runCommand.mock.calls[0][1];
    expect({ input: optionValues(args, '-i'), maps: optionValues(args, '-map'), codec: optionValues(args, '-c') })
      .toEqual({ input: [moviePath], maps: ['0:2', '0:a:0?'], codec: ['copy'] });
  });

  it('cuts a new window starting at its placement and lasting its duration', async () => {
    const { cache: windows, runCommand } = cache();

    await windows.window(placement(12_500_000, 150_000_000));

    const args: string[] = runCommand.mock.calls[0][1];
    expect({ start: optionValues(args, '-ss'), duration: optionValues(args, '-t') })
      .toEqual({ start: ['12.500000'], duration: ['150.000000'] });
  });

  it('answers a newly cut window as not reused, inside the cache folder, holding the cut', async () => {
    const { cache: windows } = cache();

    const answer = await windows.window(placement(12_500_000));

    const location = path.relative(folder, answer.windowPath);
    expect({
      cacheHit: answer.cacheHit,
      insideCacheFolder: !location.startsWith('..') && !path.isAbsolute(location),
      content: await fs.readFile(answer.windowPath, 'utf8'),
    }).toEqual({ cacheHit: false, insideCacheFolder: true, content: '0:2 0:a:0? from 12.500000 for 150.000000' });
  });

  it.each([
    ['another start', placement(1_000_000)],
    ['another duration', placement(0, 120_000_000)],
    ['another movie', { ...placement(0), sourceMovie: { ...sourceMovie, fingerprint: { ...fingerprint, sourceSampleDigest: 'c'.repeat(64) } } }],
  ])('gives a window with %s its own file', async (_scenario, other) => {
    const { cache: windows } = cache();
    const first = await windows.window(placement(0));

    const second = await windows.window(other);

    expect(second.windowPath).not.toBe(first.windowPath);
  });

  it('reuses a window asked for again without running FFmpeg', async () => {
    const { cache: windows, runCommand } = cache();
    const first = await windows.window(placement(0));

    const second = await windows.window(placement(0));

    expect(second).toEqual({ windowPath: first.windowPath, cacheHit: true });
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('reuses a window cut before the application restarted', async () => {
    const { cache: before } = cache();
    const first = await before.window(placement(0));
    const { cache: after } = cache();

    const answer = await after.window(placement(0));

    expect(answer).toEqual({ windowPath: first.windowPath, cacheHit: true });
  });

  it('cuts a window again when its file no longer has the recorded size', async () => {
    const { cache: windows } = cache();
    const first = await windows.window(placement(0));
    await fs.appendFile(first.windowPath, ' and more');

    const answer = await windows.window(placement(0));

    expect(answer.cacheHit).toBe(false);
  });

  it('leaves nothing behind when FFmpeg fails to cut the window', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      await fs.writeFile(args.at(-1)!, 'partial');
      return { ok: false, code: 'process-failed', stderr: 'cut failed' };
    });
    const { cache: windows } = cache({ runCommand });

    await expect(windows.window(placement(0))).rejects.toThrow('Cutting the movie window failed (process-failed).');
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('rejects as aborted and leaves nothing behind when the cut is cancelled', async () => {
    const started = deferred();
    const runCommand = vi.fn(async (_command: string, args: string[], { signal }: { signal: AbortSignal }) => {
      await fs.writeFile(args.at(-1)!, 'partial');
      started.resolve();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      return { ok: false, code: 'cancelled', stderr: '' };
    });
    const { cache: windows } = cache({ runCommand });
    const controller = new AbortController();
    const request = windows.window(placement(0), controller.signal);
    await started.promise;

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(await fs.readdir(folder)).toEqual([]);
  });

  describe('a cut shared by two callers', () => {
    function heldCut() {
      const started = deferred();
      const release = deferred();
      const runCommand = vi.fn(async (...call: Parameters<RunCommand>) => {
        const [, args, { signal }] = call;
        await fs.writeFile(args.at(-1)!, 'partial');
        started.resolve();
        await Promise.race([release.promise, new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))]);
        return signal.aborted ? { ok: false, code: 'cancelled', stderr: '' } : cutWindow(...call);
      });
      return { runCommand, started, release };
    }

    function twoCallers(windows: { window(request: unknown, signal: AbortSignal): Promise<{ windowPath: string }> }) {
      const controllers = [new AbortController(), new AbortController()];
      const requests = controllers.map(controller => windows.window(placement(0), controller.signal));
      return { controllers, requests };
    }

    async function rejectionName(request: Promise<unknown>): Promise<string> {
      return request.then(() => 'resolved', (error: Error) => error.name);
    }

    it('keeps cutting for the other caller when one of them gives up', async () => {
      const { runCommand, started, release } = heldCut();
      const { cache: windows } = cache({ runCommand });
      const { controllers, requests } = twoCallers(windows);
      await started.promise;
      controllers[0].abort();
      await expect(requests[0]).rejects.toMatchObject({ name: 'AbortError' });

      release.resolve();

      const { windowPath } = await requests[1];
      expect(await fs.readFile(windowPath, 'utf8')).toBe('0:2 0:a:0? from 0.000000 for 150.000000');
    });

    it('cancels the cut and leaves nothing behind once both callers give up', async () => {
      const { runCommand, started } = heldCut();
      const { cache: windows } = cache({ runCommand });
      const { controllers, requests } = twoCallers(windows);
      await started.promise;

      controllers.forEach(controller => controller.abort());

      expect({
        rejections: await Promise.all(requests.map(rejectionName)),
        leftBehind: await fs.readdir(folder),
      }).toEqual({ rejections: ['AbortError', 'AbortError'], leftBehind: [] });
    });
  });

  it('runs one cut for two requests for the same window at the same time', async () => {
    const release = deferred();
    const runCommand = vi.fn(async (...call: Parameters<RunCommand>) => {
      await release.promise;
      return cutWindow(...call);
    });
    const { cache: windows } = cache({ runCommand });
    const requests = [windows.window(placement(0)), windows.window(placement(0))];
    await vi.waitFor(() => expect(runCommand).toHaveBeenCalled());

    release.resolve();
    await Promise.all(requests);

    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a negative start', placement(-1)],
    ['a zero duration', placement(0, 0)],
    ['a fractional start', placement(0.5)],
    ['a relative movie path', { ...placement(0), moviePath: 'movies/Sample Feature.mkv' }],
  ])('refuses a window with %s before cutting anything', async (_scenario, request) => {
    const { cache: windows, runCommand } = cache();

    await expect(windows.window(request)).rejects.toThrow('The movie window request is invalid.');
    expect(runCommand).not.toHaveBeenCalled();
  });

  describe('beyond ten windows', () => {
    async function cutWindows(windows: { window(request: unknown): Promise<{ windowPath: string }> }, starts: number[]) {
      const paths: string[] = [];
      for (const start of starts) {
        clock += 1;
        paths.push((await windows.window(placement(start))).windowPath);
      }
      return paths;
    }

    const elevenStarts = Array.from({ length: 11 }, (_unused, index) => index * 1_000_000);

    it('keeps the ten most recently used windows', async () => {
      const { cache: windows } = cache();

      const paths = await cutWindows(windows, elevenStarts);

      const kept = [];
      for (const windowPath of paths) if (await exists(path.dirname(windowPath))) kept.push(windowPath);
      expect(kept).toEqual(paths.slice(1));
    });

    it('forgets the prepared review of the removed window while its file still exists', async () => {
      const forgotten: { windowPath: string; fileExisted: boolean }[] = [];
      const forgetPreparedReview = async (windowPath: string) => {
        forgotten.push({ windowPath, fileExisted: await exists(windowPath) });
      };
      const { cache: windows } = cache({ forgetPreparedReview });

      const paths = await cutWindows(windows, elevenStarts);

      expect(forgotten).toEqual([{ windowPath: paths[0], fileExisted: true }]);
    });

    it('keeps a window used again recently and removes the least recently used one instead', async () => {
      const { cache: windows } = cache();
      const paths = await cutWindows(windows, elevenStarts.slice(0, 10));
      await cutWindows(windows, [elevenStarts[0]]);

      const [newest] = await cutWindows(windows, [elevenStarts[10]]);

      const kept = [];
      for (const windowPath of [...paths, newest]) if (await exists(path.dirname(windowPath))) kept.push(windowPath);
      expect(kept).toEqual([paths[0], ...paths.slice(2), newest]);
    });
  });
});
