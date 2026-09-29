import { createRequire } from 'node:module';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ClipCapturesStore } = require('../../electron/clip-captures-store.cjs');
const folders: string[] = [];

const fingerprint = (digest: string) => ({
  fingerprintVersion: 1,
  sourceSampleDigest: digest.repeat(64),
  sourceBytes: '1000',
  sourceDurationUs: '5000000',
  signatureProfileVersion: '3m-3m-3x1m',
  selectedStream: 0,
  streamMetadataDigest: 'b'.repeat(64),
});

afterEach(async () => {
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })));
});

describe('ClipCapturesStore', () => {
  it('persists per-movie queues and keeps the newest attached movie active after older saves', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'clip-captures-'));
    folders.push(userData);
    const store = new ClipCapturesStore(userData);
    const first = fingerprint('a');
    const second = fingerprint('c');
    const firstData = { nextRangeSequence: 2, ranges: [{
      id: 'range-1',
      start: { kind: 'exact-frame', frameIndex: 2, frameInfoHash: '0000000000000002', reviewTimeUs: '20000' },
      end: { kind: 'exact-frame', frameIndex: 4, frameInfoHash: '0000000000000004', reviewTimeUs: '40000' },
    }] };
    const emptyData = { nextRangeSequence: 1, ranges: [] };
    await store.save({ fingerprint: first, displayName: 'First.mp4', sourcePath: path.join(userData, 'First.mp4'), data: firstData, markActive: true });
    await store.save({ fingerprint: second, displayName: 'Second.mp4', sourcePath: path.join(userData, 'Second.mp4'), data: emptyData, markActive: true });
    await store.save({ fingerprint: first, displayName: 'First.mp4', sourcePath: path.join(userData, 'First.mp4'), data: firstData });
    await store.flush();

    const reopened = new ClipCapturesStore(userData);
    expect((await reopened.lastActive()).displayName).toBe('Second.mp4');
    expect((await reopened.load(first)).ranges).toEqual(firstData.ranges);
    expect((await reopened.load(second)).ranges).toEqual([]);
    const bytes = await readFile(path.join(userData, 'clip-captures', `${store.key(first)}.json`));
    expect(bytes.subarray(0, 3).toString('hex')).not.toBe('efbbbf');
  });

  it('preserves an invalid record for recovery', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'clip-captures-'));
    folders.push(userData);
    const store = new ClipCapturesStore(userData);
    const movie = fingerprint('a');
    const file = path.join(userData, 'clip-captures', `${store.key(movie)}.json`);
    await store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath: path.join(userData, 'Movie.mp4'), data: { nextRangeSequence: 1, ranges: [] }, markActive: true });
    await writeFile(file, '{bad json', 'utf8');

    await expect(store.load(movie)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('{bad json');
  });

  it('coalesces concurrent updates to the newest queue for one movie', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'clip-captures-'));
    folders.push(userData);
    const store = new ClipCapturesStore(userData);
    const movie = fingerprint('a');
    const sourcePath = path.join(userData, 'Movie.mp4');
    await Promise.all([1, 2, 3].map(nextRangeSequence => store.save({
      fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence, ranges: [] },
    })));

    expect((await store.load(movie)).nextRangeSequence).toBe(3);
  });

  it('loads the latest queue while its asynchronous replacement is pending', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'clip-captures-'));
    folders.push(userData);
    const movie = fingerprint('a');
    const sourcePath = path.join(userData, 'Movie.mp4');
    const file = path.join(userData, 'clip-captures', `${new ClipCapturesStore(userData).key(movie)}.json`);
    let holdRename = false;
    let releaseRename: () => void = () => undefined;
    let enteredRename: () => void = () => undefined;
    const renameGate = new Promise<void>(resolve => { releaseRename = resolve; });
    const renameEntered = new Promise<void>(resolve => { enteredRename = resolve; });
    let oldText = '';
    const store = new ClipCapturesStore(userData, {
      ...fsPromises,
      readFile: async (...args: Parameters<typeof fsPromises.readFile>) =>
        holdRename && args[0] === file ? oldText : fsPromises.readFile(...args),
      rename: async (...args: Parameters<typeof fsPromises.rename>) => {
        if (holdRename && args[1] === file) {
          enteredRename();
          await renameGate;
          holdRename = false;
        }
        return fsPromises.rename(...args);
      },
    });
    await store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence: 1, ranges: [] },
    });
    oldText = await readFile(file, 'utf8');
    holdRename = true;

    const pendingSave = store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence: 2, ranges: [] },
    });
    await renameEntered;
    const pendingLoad = store.load(movie);
    releaseRename();

    expect((await pendingLoad).nextRangeSequence).toBe(2);
    await pendingSave;
  });

  it('persists a partial approximate draft and reads older records without one', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'clip-captures-'));
    folders.push(userData);
    const store = new ClipCapturesStore(userData);
    const movie = fingerprint('a');
    const sourcePath = path.join(userData, 'Movie.mp4');
    await store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence: 1, ranges: [], draft: { start: { kind: 'playback-timestamp', timestampUs: '500000' }, end: null } },
    });

    expect((await store.load(movie)).draft).toEqual({
      start: { kind: 'playback-timestamp', timestampUs: '500000' }, end: null,
    });
    await store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence: 1, ranges: [] },
    });
    expect((await store.load(movie)).draft).toBeUndefined();
    expect(() => store.save({ fingerprint: movie, displayName: 'Movie.mp4', sourcePath,
      data: { nextRangeSequence: 1, ranges: [], draft: { start: null, end: null } },
    })).toThrow('draft is invalid');
    expect((await store.load(movie)).draft).toBeUndefined();
  });
});
