// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceMeasurementCache } from '../../../src/frame-review/host/source-measurement-cache.js';
import type { ISourceMeasurement } from '../../../src/frame-review/host/source-inspector.js';

let root = '';
let cacheFile = '';
const sessions: SourceMeasurementCache[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'source-measurement-cache-'));
  cacheFile = path.join(root, 'app', 'source-measurement-cache', 'measurements.json');
});

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(cache => cache.flush()));
  await rm(root, { recursive: true, force: true });
});

function measurementOf(sampleDigest: string): ISourceMeasurement {
  return {
    sourceSampleDigest: sampleDigest, sourceBytes: '7', sourceDurationUs: '2000000', signatureProfileVersion: 'profile-1',
    selectedStream: 0, streamMetadataDigest: 'stream-digest', sourceWidth: 64, sourceHeight: 48, requiresTimestampNormalization: false,
  };
}

// One app session's cache; each file measures as a digest naming its contents.
function appSession() {
  const measure = vi.fn(async (sourcePath: string) => measurementOf(`digest of ${await readFile(sourcePath, 'utf8')}`));
  const cache = new SourceMeasurementCache({ measure }, cacheFile);
  sessions.push(cache);
  return { cache, measure };
}

// Measures the movies in an app session that then ends.
async function earlierSession(...moviePaths: string[]) {
  const { cache } = appSession();
  for (const moviePath of moviePaths) await cache.measurementOf(moviePath);
  await cache.flush();
}

async function movie(name: string, contents = name) {
  const moviePath = path.join(root, 'movies', name);
  await mkdir(path.dirname(moviePath), { recursive: true });
  await writeFile(moviePath, contents);
  return moviePath;
}

describe('SourceMeasurementCache', () => {
  it('reuses the measurement of an unchanged movie from an earlier app session without measuring it again', async () => {
    const feature = await movie('Feature.mkv', 'feature');
    await earlierSession(feature);
    const later = appSession();

    const measured = await later.cache.measurementOf(feature);

    expect([measured.sourceSampleDigest, later.measure.mock.calls.length]).toEqual(['digest of feature', 0]);
  });

  it('measures a movie again in a later app session once its file changed', async () => {
    const feature = await movie('Feature.mkv', 'feature');
    await earlierSession(feature);
    await writeFile(feature, 'feature, re-encoded');
    const later = appSession();

    const measured = await later.cache.measurementOf(feature);

    expect(measured.sourceSampleDigest).toBe('digest of feature, re-encoded');
  });

  it('measures an unchanged movie once within an app session', async () => {
    const feature = await movie('Feature.mkv');
    const session = appSession();

    await Promise.all([session.cache.measurementOf(feature), session.cache.measurementOf(feature)]);
    await session.cache.measurementOf(feature);

    expect(session.measure).toHaveBeenCalledOnce();
  });

  it('measures a movie again after a failed measurement', async () => {
    const feature = await movie('Feature.mkv', 'feature');
    const session = appSession();
    session.measure.mockRejectedValueOnce(new Error('The movie could not be read.'));
    await expect(session.cache.measurementOf(feature)).rejects.toThrow('The movie could not be read.');

    const measured = await session.cache.measurementOf(feature);

    expect(measured.sourceSampleDigest).toBe('digest of feature');
  });

  it('measures the movie when the remembered measurements cannot be read, and remembers it again', async () => {
    const feature = await movie('Feature.mkv', 'feature');
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, '{"schemaVersion":1,"measurements":[{"pathKey":"not a key"}]}');
    await appSession().cache.measurementOf(feature);
    await sessions[0].flush();
    const later = appSession();

    const measured = await later.cache.measurementOf(feature);

    expect([measured.sourceSampleDigest, later.measure.mock.calls.length]).toEqual(['digest of feature', 0]);
  });

  it('reads remembered measurements that start with a byte order mark', async () => {
    const feature = await movie('Feature.mkv', 'feature');
    await earlierSession(feature);
    await writeFile(cacheFile, `${String.fromCharCode(0xfeff)}${await readFile(cacheFile, 'utf8')}`);
    const later = appSession();

    await later.cache.measurementOf(feature);

    expect(later.measure).not.toHaveBeenCalled();
  });

  it('stores no movie path', async () => {
    await earlierSession(await movie('Private Feature.mkv', 'feature'));

    const stored = await readFile(cacheFile, 'utf8');

    expect([stored.includes('Private Feature'), stored.includes(JSON.stringify(root).slice(1, -1))]).toEqual([false, false]);
  });

  it('forgets the movie measured longest ago once it remembers as many movies as it can', async () => {
    const movies = await Promise.all(Array.from({ length: SourceMeasurementCache.capacity + 1 }, (_, index) => movie(`Feature-${index}.mkv`)));
    await earlierSession(...movies);
    const later = appSession();

    await later.cache.measurementOf(movies[0]);
    await later.cache.measurementOf(movies[movies.length - 1]);

    expect(later.measure.mock.calls.map(([measured]) => path.basename(measured))).toEqual(['Feature-0.mkv']);
  });

  it('keeps a movie asked for again over one measured longer ago', async () => {
    const movies = await Promise.all(Array.from({ length: SourceMeasurementCache.capacity + 1 }, (_, index) => movie(`Feature-${index}.mkv`)));
    await earlierSession(...movies.slice(0, -1), movies[0], movies[movies.length - 1]);
    const later = appSession();

    await later.cache.measurementOf(movies[0]);
    await later.cache.measurementOf(movies[1]);

    expect(later.measure.mock.calls.map(([measured]) => path.basename(measured))).toEqual(['Feature-1.mkv']);
  });
});
