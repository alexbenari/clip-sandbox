import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FrameReviewPaths } from '../../../src/frame-review/host/frame-review-paths.js';
import type { IExactReviewProxyIdentity } from '../../../src/frame-review/host/exact-review-proxy-cache.js';
import { ExactReviewProxyCache } from '../../../src/frame-review/host/exact-review-proxy-cache.js';
import { PlaybackProxyCache, type IPlaybackProxyWorkspace } from '../../../src/frame-review/host/playback-proxy-cache.js';

const identity: IExactReviewProxyIdentity = Object.freeze({
  schemaVersion: 1, sourceSampleDigest: 'source-digest', sourceBytes: '1200', sourceDurationUs: '2000000',
  signatureProfileVersion: 'sample-signature-compact-v1', preparationContractVersion: 'prepared-review-v1',
  selectedStream: 0, streamMetadataDigest: 'stream-digest', nativeProtocolVersion: 1,
  bestSourceVersion: 'bestsource-test', ffmpegVersion: 'ffmpeg-test',
  proxyProfileId: 'mpeg4-gop1-q5-960-source-clock-aac-v1', frameMapVersion: 'ordinal-identity-v1',
  indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268435456 }),
});

describe('playback proxy cache', () => {
  it('publishes an immutable proxy before exact-frame assets and reuses it without rebuilding', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-review-proxy-'));
    const paths = new FrameReviewPaths(root);
    const cache = new PlaybackProxyCache(paths);
    const cacheKey = new ExactReviewProxyCache(paths).cacheKey(identity);
    let builds = 0;
    const build = async (workspace: IPlaybackProxyWorkspace) => {
      builds += 1;
      await writeFile(workspace.proxyFile, 'proxy');
      return { workspace, normalizedSource: false };
    };

    const cold = await cache.getOrCreate(identity, cacheKey, build);
    const before = await stat(cold.proxyPath);
    const warm = await cache.getOrCreate(identity, cacheKey, build);

    expect(builds).toBe(1);
    expect(cold.cacheHit).toBe(false);
    expect(warm.cacheHit).toBe(true);
    expect(await readFile(warm.proxyPath, 'utf8')).toBe('proxy');
    expect((await stat(warm.proxyPath)).mtimeMs).toBe(before.mtimeMs);
  });
});
