// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { SourceMovieLocator } = require('../../electron/source-movie-locator.cjs');

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

  function fixture(matchingPaths: readonly string[]) {
    const sourceMatchesFingerprint = vi.fn(async (candidate: string) => matchingPaths.includes(candidate));
    const chooseSourcePath = vi.fn(async (): Promise<string | null> => null);
    const locator = new SourceMovieLocator({
      folderAccess: { knownPipelinePaths: vi.fn(() => [folder]) },
      capturesStore: { load: vi.fn(async () => ({ lastKnownPath: rememberedPath })) },
      hostForEvent: () => ({ sourceMatchesFingerprint }),
      chooseSourcePath,
      fileSystem: {
        readdir: vi.fn(async () => [
          { name: 'other.mkv', isFile: () => true },
          { name: 'source.mkv', isFile: () => true },
          { name: 'notes.txt', isFile: () => true },
        ]),
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

  it('refuses a chosen movie that does not match the clip’s source', async () => {
    const f = fixture([]);
    f.chooseSourcePath.mockResolvedValueOnce(path.resolve('elsewhere', 'wrong.mkv'));
    await expect(f.locator.locate(event, sourceMovie)).rejects.toThrow('The selected movie does not match this clip’s original source.');
  });
});
