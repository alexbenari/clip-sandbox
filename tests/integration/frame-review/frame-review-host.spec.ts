import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FrameReviewHost } from '../../../src/frame-review/host/frame-review-host.js';
import { nativeBinaryFolder, nativeFrameReviewUnavailableReason, readFrameReviewDependencies } from '../../support/frame-review-dependencies.js';
import { createFiveFrameMovie, openPrepared, runtimeConfiguration } from '../../support/frame-review-host-fixtures.js';

const unavailable = nativeFrameReviewUnavailableReason(path.join(nativeBinaryFolder, 'bestsource_media_service.exe'));

// The five-frame movie runs at 5 frames per second and paints each frame a different grey.
describe.skipIf(unavailable !== null)('FrameReviewHost with a prepared movie', () => {
  let root = '';
  let movie = '';
  const hosts: FrameReviewHost[] = [];
  const startHost = () => {
    const host = new FrameReviewHost(runtimeConfiguration(root, readFrameReviewDependencies()));
    hosts.push(host);
    return host;
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-host-'));
    movie = await createFiveFrameMovie(root, readFrameReviewDependencies());
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled(hosts.map(host => host.dispose()));
    await rm(root, { recursive: true, force: true });
  });

  async function preparedMovie() {
    const host = startHost();
    const { session } = await openPrepared(host, movie);
    // A second handle to the same file reads the same session.
    return { host, sessionId: session.id, sourceHandle: host.registerSource(movie) };
  }

  it('finds the frame whose check value matches among the frames it is given', async () => {
    const { host, sessionId, sourceHandle } = await preparedMovie();
    const third = await host.exactFrameReader(sessionId, sourceHandle).frameIdentity(3);

    await expect(host.findFrameByCheckValue(sessionId, sourceHandle, third.frameInfoHash, [4, 0, 3, 1])).resolves.toBe(3);
  }, 120_000);

  it('answers no frame when the searched frames do not hold the check value', async () => {
    const { host, sessionId, sourceHandle } = await preparedMovie();
    const third = await host.exactFrameReader(sessionId, sourceHandle).frameIdentity(3);

    await expect(host.findFrameByCheckValue(sessionId, sourceHandle, third.frameInfoHash, [0, 1, 2, 4, 7])).resolves.toBeNull();
  }, 120_000);

  it('refuses to read a session through the handle of another source', async () => {
    const { host, sessionId } = await preparedMovie();
    const otherHandle = host.registerSource(path.join(root, 'other.mp4'));

    expect(() => host.exactFrameReader(sessionId, otherHandle)).toThrow('Review session does not show this source.');
  }, 120_000);

  it('reads frame times of a prepared movie from its cached index, in the order asked', async () => {
    await preparedMovie();

    await expect(startHost().cachedFrameTimesUs(movie, [3, 1])).resolves.toEqual([600_000n, 200_000n]);
  }, 120_000);

  it('reads no frame time for a movie that was never prepared', async () => {
    const unprepared = path.join(root, 'unprepared.mp4');
    await writeFile(unprepared, Buffer.concat([await readFile(movie), Buffer.alloc(16)]));

    await expect(startHost().cachedFrameTimesUs(unprepared, [3])).resolves.toBeNull();
  }, 120_000);

  it('reads no frame time and leaves the index alone when the cached index no longer matches', async () => {
    const { host, sessionId } = await preparedMovie();
    const cacheKey = host.session(sessionId).state().preparedReview!.cacheKey;
    const indexFile = path.join(root, 'frame-index-cache', cacheKey, 'canonical-index.0.bsindex');
    const original = await readFile(indexFile);
    await writeFile(indexFile, Buffer.from('not an index'));
    try {
      await expect(startHost().cachedFrameTimesUs(movie, [3])).resolves.toBeNull();
      expect((await readFile(indexFile)).toString()).toBe('not an index');
    } finally {
      await writeFile(indexFile, original);
    }
  }, 120_000);

  it('reads no frame time for a movie whose cached index numbers a timestamp-repaired copy', async () => {
    const { host, sessionId } = await preparedMovie();
    const entry = path.join(root, 'exact-review-proxy-cache', host.session(sessionId).state().preparedReview!.cacheKey);
    const manifestPath = path.join(entry, 'manifest.json');
    const original = await readFile(manifestPath, 'utf8');
    await writeFile(path.join(entry, 'normalized.mkv'), await readFile(movie));
    await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(original), normalizedSource: 'normalized.mkv' }));
    try {
      await expect(startHost().cachedFrameTimesUs(movie, [3])).resolves.toBeNull();
    } finally {
      await writeFile(manifestPath, original);
      await rm(path.join(entry, 'normalized.mkv'), { force: true });
    }
  }, 120_000);

  it('inspects a source again once its file has changed', async () => {
    const host = startHost();
    const changing = path.join(root, 'changing.mp4');
    await writeFile(changing, await readFile(movie));
    const { session } = await openPrepared(host, movie);
    const fingerprint = session.captureContext()!.fingerprint;
    expect(await host.sourceMatchesFingerprint(changing, fingerprint)).toBe(true);

    await writeFile(changing, Buffer.concat([await readFile(movie), Buffer.alloc(16)]));

    await expect(host.sourceMatchesFingerprint(changing, fingerprint)).resolves.toBe(false);
  }, 120_000);

  it('matches an unchanged movie to its fingerprint in a later app session without the native inspection tools', async () => {
    const host = startHost();
    const { session } = await openPrepared(host, movie);
    const fingerprint = session.captureContext()!.fingerprint;
    expect(await host.sourceMatchesFingerprint(movie, fingerprint)).toBe(true);
    await host.dispose();
    const laterApplicationFolder = path.join(root, 'later-app');
    await cp(path.join(root, 'source-measurement-cache'), path.join(laterApplicationFolder, 'source-measurement-cache'), { recursive: true });
    const emptyToolFolder = path.join(root, 'no-tools');
    await mkdir(emptyToolFolder, { recursive: true });
    const laterHost = new FrameReviewHost({
      ...runtimeConfiguration(laterApplicationFolder, readFrameReviewDependencies()), nativeBinaryFolder: emptyToolFolder,
    });
    hosts.push(laterHost);

    await expect(laterHost.sourceMatchesFingerprint(movie, fingerprint)).resolves.toBe(true);
  }, 120_000);

  it('forgets every prepared-review cache entry of a source', async () => {
    const { host, sessionId } = await preparedMovie();
    const cacheKey = host.session(sessionId).state().preparedReview!.cacheKey;
    await host.closeSession(sessionId);

    await startHost().forgetPreparedReview(movie);

    const remaining = await Promise.all(['frame-index-cache', 'exact-review-proxy-cache', 'playback-proxy-cache']
      .map(async folder => (await readdir(path.join(root, folder))).filter(name => name === cacheKey)));
    expect(remaining).toEqual([[], [], []]);
  }, 120_000);
});
