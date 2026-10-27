// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceMovieFixture } from '../support/source-movie-fixtures.js';

const require = createRequire(import.meta.url);
const { CollectionClipRefinement } = require('../../electron/collection-clip-refinement.cjs');

const fingerprint = {
  fingerprintVersion: 1,
  sourceSampleDigest: 'a'.repeat(64), sourceBytes: '42', sourceDurationUs: '1000000',
  signatureProfileVersion: 'sample-v1', selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};
const record = {
  sourceMovie: { displayName: 'source.mkv', fingerprint },
  sourceFrameRange: {
    start: { frameIndex: 2, frameInfoHash: '0'.repeat(16) },
    end: { frameIndex: 5, frameInfoHash: '1'.repeat(16) }, endInclusive: true,
  },
};

describe('CollectionClipRefinement', () => {
  const folder = path.resolve('pipeline');
  const request = { folderPath: folder, filename: 'clip.mp4' };

  function fixture(provenanceRecord: typeof record | null = record) {
    const sourceMatchesFingerprint = vi.fn(async () => true);
    const registerSource = vi.fn(() => 'source_opaque12345678');
    const chooseSourcePath = vi.fn(async () => null);
    const provenance = { read: vi.fn(async () => provenanceRecord), canBeTagged: () => true };
    const rememberedPath = path.join(folder, 'remembered.mkv');
    const service = new CollectionClipRefinement({
      folderAccess: {
        requireKnownPath: vi.fn(() => folder),
        knownPipelinePaths: vi.fn(() => [folder]),
      },
      capturesStore: { load: vi.fn(async () => ({ lastKnownPath: rememberedPath })) },
      hostForEvent: () => ({ sourceMatchesFingerprint, registerSource }),
      chooseSourcePath,
      fileSystem: {
        stat: vi.fn(async () => ({ isFile: () => true })),
        readdir: vi.fn(async () => [{ name: 'source.mkv', isFile: () => true }]),
      },
      provenance,
    });
    return { service, sourceMatchesFingerprint, registerSource, chooseSourcePath, provenance, rememberedPath };
  }

  describe('Refine availability read from clip files', () => {
    let clipFolder = '';
    const event = { sender: { id: 1 } };

    beforeEach(async () => {
      clipFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'refine-availability-'));
      await fs.copyFile(sourceMovieFixture('tagged.mp4'), path.join(clipFolder, 'tagged.mp4'));
      await fs.copyFile(sourceMovieFixture('untagged.mp4'), path.join(clipFolder, 'untagged.mp4'));
      await fs.copyFile(sourceMovieFixture('tagged.mp4'), path.join(clipFolder, 'tagged.mov'));
    });

    afterEach(async () => {
      await fs.rm(clipFolder, { recursive: true, force: true });
    });

    function refinement() {
      return new CollectionClipRefinement({
        folderAccess: { requireKnownPath: () => clipFolder, knownPipelinePaths: () => [clipFolder] },
        capturesStore: { load: async () => null },
        hostForEvent: () => ({}),
        chooseSourcePath: async () => null,
      });
    }

    it('offers Refine for a tagged MP4 clip', async () => {
      await expect(refinement().inspect(event, { folderPath: clipFolder, filename: 'tagged.mp4' })).resolves.toEqual({ available: true });
    });

    it('does not offer Refine for an untagged MP4 clip', async () => {
      await expect(refinement().inspect(event, { folderPath: clipFolder, filename: 'untagged.mp4' })).resolves.toEqual({ available: false });
    });

    it('does not offer Refine for a clip that is not an MP4 file, whatever it contains', async () => {
      await expect(refinement().inspect(event, { folderPath: clipFolder, filename: 'tagged.mov' })).resolves.toEqual({ available: false });
    });

    it('fails the availability check when the clip file is missing', async () => {
      await expect(refinement().inspect(event, { folderPath: clipFolder, filename: 'missing.mp4' })).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('tries the remembered path before loaded pipeline files', async () => {
    const f = fixture();
    f.sourceMatchesFingerprint.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await f.service.resolve({ sender: { id: 1 } }, request);
    expect(f.sourceMatchesFingerprint.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      f.rememberedPath, path.join(folder, 'source.mkv'),
    ]);
    expect(result).toMatchObject({ kind: 'resolved', range: record.sourceFrameRange });
    expect(f.chooseSourcePath).not.toHaveBeenCalled();
  });

  it('asks for the source after remembered and loaded candidates fail', async () => {
    const f = fixture();
    const selected = path.resolve('elsewhere', 'source.mkv');
    f.sourceMatchesFingerprint.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    f.chooseSourcePath.mockResolvedValueOnce(selected);
    const result = await f.service.resolve({ sender: { id: 1 } }, request);
    expect(f.chooseSourcePath).toHaveBeenCalledOnce();
    expect(f.registerSource).toHaveBeenCalledWith(selected);
    expect(result).toMatchObject({ kind: 'resolved', source: { name: 'source.mkv' } });
  });
});
