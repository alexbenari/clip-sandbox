// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { LocatedMovieStore } = require('../../electron/located-movie-store.cjs');

let userData = '';

beforeEach(async () => {
  userData = await mkdtemp(path.join(os.tmpdir(), 'located-movie-store-'));
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

const fingerprintOf = (digestCharacter: string) => ({
  fingerprintVersion: 1,
  sourceSampleDigest: digestCharacter.repeat(64), sourceBytes: '1234567890', sourceDurationUs: '5400000000',
  signatureProfileVersion: 'profile-1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
});
const feature = fingerprintOf('a');
const moviePath = path.resolve('movies', 'Feature.mkv');

describe('LocatedMovieStore', () => {
  it('answers where a movie was located in an earlier app session', async () => {
    await new LocatedMovieStore(userData).remember(feature, moviePath);

    await expect(new LocatedMovieStore(userData).pathOf(feature)).resolves.toBe(moviePath);
  });

  it('answers the latest place a movie was located', async () => {
    const store = new LocatedMovieStore(userData);
    await store.remember(feature, moviePath);
    await store.remember(feature, path.resolve('archive', 'Feature.mkv'));

    await expect(new LocatedMovieStore(userData).pathOf(feature)).resolves.toBe(path.resolve('archive', 'Feature.mkv'));
  });

  it('answers no place for a movie it never located', async () => {
    await new LocatedMovieStore(userData).remember(feature, moviePath);

    await expect(new LocatedMovieStore(userData).pathOf(fingerprintOf('c'))).resolves.toBeNull();
  });

  it('answers no place when its file cannot be read, and remembers the next located movie', async () => {
    await writeFile(path.join(userData, 'located-movies.json'), '{"schemaVersion":1,"movies":[{"movieKey":"x","path":"relative"}]}');
    const store = new LocatedMovieStore(userData);

    await expect(store.pathOf(feature)).resolves.toBeNull();
    await store.remember(feature, moviePath);
    await expect(new LocatedMovieStore(userData).pathOf(feature)).resolves.toBe(moviePath);
  });

  it('reads its file when it starts with a byte order mark', async () => {
    await new LocatedMovieStore(userData).remember(feature, moviePath);
    const file = path.join(userData, 'located-movies.json');
    await writeFile(file, `${String.fromCharCode(0xfeff)}${await readFile(file, 'utf8')}`);

    await expect(new LocatedMovieStore(userData).pathOf(feature)).resolves.toBe(moviePath);
  });

  it('forgets the movie located longest ago once it remembers as many movies as it can', async () => {
    const store = new LocatedMovieStore(userData);
    const fingerprints = Array.from({ length: LocatedMovieStore.capacity + 1 }, (_, index) => ({ ...feature, sourceBytes: String(index + 1) }));
    for (const fingerprint of fingerprints) await store.remember(fingerprint, path.resolve('movies', `Feature-${fingerprint.sourceBytes}.mkv`));
    const later = new LocatedMovieStore(userData);

    const places = await Promise.all([later.pathOf(fingerprints[0]), later.pathOf(fingerprints[1])]);

    expect(places).toEqual([null, path.resolve('movies', 'Feature-2.mkv')]);
  });

  it('refuses a place that is not an absolute path', async () => {
    await expect(new LocatedMovieStore(userData).remember(feature, 'Feature.mkv')).rejects.toThrow('Located movie path is invalid.');
  });

  it('leaves only its own file in the user data folder', async () => {
    const store = new LocatedMovieStore(userData);
    await store.remember(feature, moviePath);
    await store.remember(fingerprintOf('c'), moviePath);

    await expect(readdir(userData)).resolves.toEqual(['located-movies.json']);
  });
});
