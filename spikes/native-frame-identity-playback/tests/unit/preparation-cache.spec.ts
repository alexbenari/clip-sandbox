import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildPreparationCacheKey,
  createPreparationWorkspace,
  loadPreparationEntry,
  preparationEntryPath,
  publishPreparationWorkspace,
  validatePreparationManifest,
} from '../../src/preparation/preparation-cache.mjs';

const identity = {
  sourceBytes: 1234,
  durationUs: 10_000_000,
  sourceSampleDigest: 'sample-digest',
  streamMetadataDigest: 'metadata-digest',
  selectedTrack: 0,
  signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
  preparationContractVersion: 'prepared-review-v2',
  bestSourceVersion: 'bestsource-test',
  ffmpegVersion: 'ffmpeg-test',
  indexingOptions: { decoderInstances: 2, seekPreroll: 20 },
};

describe('prepared review cache', () => {
  it('uses every compatibility input in a deterministic cache key', () => {
    const key = buildPreparationCacheKey(identity);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(buildPreparationCacheKey({ ...identity })).toBe(key);
    expect(buildPreparationCacheKey({ ...identity, ffmpegVersion: 'ffmpeg-next' })).not.toBe(key);
  });

  it('validates a manifest only for the exact preparation identity', () => {
    const manifest = { cacheKey: buildPreparationCacheKey(identity), identity };

    expect(validatePreparationManifest(manifest, identity)).toBe(true);
    expect(validatePreparationManifest(manifest, { ...identity, selectedTrack: 1 })).toBe(false);
  });

  it('rejects path-like cache keys', () => {
    const root = path.resolve('cache-root');

    expect(() => preparationEntryPath(root, '..\\outside')).toThrow('cache key');
  });

  it('publishes a complete workspace atomically and ignores partial work', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'prepared-cache-'));
    try {
      const cacheKey = buildPreparationCacheKey(identity);
      const workspace = await createPreparationWorkspace(root, cacheKey, 'test');
      await writeFile(`${workspace.index}.0.bsindex`, 'index');
      await writeFile(workspace.reviewAsset, 'movie');
      const manifest = {
        cacheKey,
        identity,
        sourcePath: workspace.reviewAsset,
        reviewAssetKind: 'normalized-copy',
        reviewAsset: 'review.mkv',
        index: 'index',
        indexTrack: 0,
      };

      await publishPreparationWorkspace(workspace, manifest);
      const loaded = await loadPreparationEntry(root, identity);

      expect(loaded).toMatchObject({ cacheKey, manifest });
      expect(await readFile(`${loaded.index}.0.bsindex`, 'utf8')).toBe('index');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not accept a manifest without its index', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'prepared-cache-'));
    try {
      const cacheKey = buildPreparationCacheKey(identity);
      const entry = preparationEntryPath(root, cacheKey);
      await mkdir(entry, { recursive: true });
      await writeFile(path.join(entry, 'review.mkv'), 'movie');
      await writeFile(path.join(entry, 'manifest.json'), JSON.stringify({
        cacheKey,
        identity,
        sourcePath: path.join(entry, 'review.mkv'),
        reviewAssetKind: 'normalized-copy',
        reviewAsset: 'review.mkv',
        index: 'index',
        indexTrack: 0,
      }));

      await expect(loadPreparationEntry(root, identity)).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
