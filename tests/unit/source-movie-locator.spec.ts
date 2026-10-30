// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { SourceMovieLocator } = require('../../electron/source-movie-locator.cjs');
const { LocatedMovieStore } = require('../../electron/located-movie-store.cjs');

const fingerprint = {
  fingerprintVersion: 1,
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '42', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sample-v1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};
const sourceMovie = { displayName: 'source.mkv', fingerprint };
const event = { sender: { id: 1 } };

describe('SourceMovieLocator', () => {
  const folder = path.resolve('pipeline');
  const rememberedPath = path.join(folder, 'remembered.mkv');

  // Every file holds the movie's 42 bytes unless `sizes` says otherwise.
  function fixture(matchingPaths: readonly string[], { sizes = new Map<string, number>(),
    locatedMovies = { pathOf: vi.fn(async (): Promise<string | null> => null), remember: vi.fn(async () => undefined) } } = {}) {
    const sourceMatchesFingerprint = vi.fn(async (candidate: string) => matchingPaths.includes(candidate));
    const chooseSourcePath = vi.fn(async (): Promise<string | null> => null);
    const locator = new SourceMovieLocator({
      folderAccess: { knownPipelinePaths: vi.fn(() => [folder]) },
      capturesStore: { load: vi.fn(async () => ({ lastKnownPath: rememberedPath })) },
      locatedMovies,
      hostForEvent: () => ({ sourceMatchesFingerprint }),
      chooseSourcePath,
      fileSystem: {
        readdir: vi.fn(async () => [
          { name: 'other.mkv', isFile: () => true },
          { name: 'source.mkv', isFile: () => true },
          { name: 'notes.txt', isFile: () => true },
        ]),
        stat: vi.fn(async (candidate: string) => ({ isFile: () => true, size: sizes.get(candidate) ?? 42 })),
      },
    });
    return { locator, sourceMatchesFingerprint, chooseSourcePath };
  }

  it('prefers the remembered location when it still holds the movie', async () => {
    const f = fixture([rememberedPath, path.join(folder, 'source.mkv'), path.join(folder, 'other.mkv')]);
    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'located', moviePath: rememberedPath });
  });

  it('prefers a pipeline movie with the recorded name over one with another name', async () => {
    const f = fixture([path.join(folder, 'source.mkv'), path.join(folder, 'other.mkv')]);
    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'located', moviePath: path.join(folder, 'source.mkv') });
  });

  it('finds a renamed movie in a pipeline folder without asking the user', async () => {
    const f = fixture([path.join(folder, 'other.mkv')]);
    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'located', moviePath: path.join(folder, 'other.mkv') });
    expect(f.chooseSourcePath).not.toHaveBeenCalled();
  });

  it('asks for the movie when no candidate matches and locates the chosen one', async () => {
    const selected = path.resolve('elsewhere', 'source.mkv');
    const f = fixture([selected]);
    f.chooseSourcePath.mockResolvedValueOnce(selected);
    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'located', moviePath: selected });
  });

  it('reports cancelled when the user closes the movie picker', async () => {
    const f = fixture([]);
    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'cancelled' });
  });

  it('never fingerprints a candidate whose size differs from the movie’s', async () => {
    const resized = path.join(folder, 'other.mkv');
    const f = fixture([resized], { sizes: new Map([[resized, 43]]) });

    await f.locator.locate(event, sourceMovie);

    expect(f.sourceMatchesFingerprint.mock.calls.map(([candidate]) => candidate)).not.toContain(resized);
  });

  it('refuses a chosen movie whose size differs from the movie’s', async () => {
    const selected = path.resolve('elsewhere', 'source.mkv');
    const f = fixture([selected], { sizes: new Map([[selected, 41]]) });
    f.chooseSourcePath.mockResolvedValueOnce(selected);

    await expect(f.locator.locate(event, sourceMovie)).rejects.toThrow('The selected movie does not match this clip’s original source.');
  });

  it('looks first where the movie was located last', async () => {
    const lastLocated = path.resolve('archive', 'source.mkv');
    const f = fixture([lastLocated, rememberedPath], { locatedMovies: { pathOf: vi.fn(async () => lastLocated), remember: vi.fn(async () => undefined) } });

    await expect(f.locator.locate(event, sourceMovie)).resolves.toEqual({ kind: 'located', moviePath: lastLocated });
  });

  it('finds a movie chosen earlier in the same app session without asking again', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'source-movie-locator-'));
    try {
      const selected = path.resolve('elsewhere', 'source.mkv');
      const f = fixture([selected], { locatedMovies: new LocatedMovieStore(userData) });
      f.chooseSourcePath.mockResolvedValueOnce(selected);
      await f.locator.locate(event, sourceMovie);

      const located = await f.locator.locate(event, sourceMovie);

      expect([located, f.chooseSourcePath.mock.calls.length]).toEqual([{ kind: 'located', moviePath: selected }, 1]);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it('finds a movie chosen in an earlier app session without asking again', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'source-movie-locator-'));
    try {
      const selected = path.resolve('elsewhere', 'source.mkv');
      const earlier = fixture([selected], { locatedMovies: new LocatedMovieStore(userData) });
      earlier.chooseSourcePath.mockResolvedValueOnce(selected);
      await earlier.locator.locate(event, sourceMovie);
      const later = fixture([selected], { locatedMovies: new LocatedMovieStore(userData) });

      const located = await later.locator.locate(event, sourceMovie);

      expect([located, later.chooseSourcePath.mock.calls.length]).toEqual([{ kind: 'located', moviePath: selected }, 0]);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it('refuses a chosen movie that does not match the clip’s source', async () => {
    const f = fixture([]);
    f.chooseSourcePath.mockResolvedValueOnce(path.resolve('elsewhere', 'wrong.mkv'));
    await expect(f.locator.locate(event, sourceMovie)).rejects.toThrow('The selected movie does not match this clip’s original source.');
  });
});
