import { describe, expect, it, vi } from 'vitest';
import { BestSourceFrameReader } from '../../../src/frame-review/host/bestsource-frame-reader.js';

describe('BestSourceFrameReader', () => {
  it('opens the canonical source and index for exact pixels', async () => {
    const client = {
      request: vi.fn(async () => ({ metadata: { sourceGeneration: 1, numFrames: 3 }, payload: new Uint8Array() })),
      shutdown: vi.fn(),
    };
    const reader = new BestSourceFrameReader(client as never);

    await expect(reader.open({
      canonicalSourcePath: 'C:/movies/original.mkv',
      canonicalIndexPath: 'C:/cache/original.bsindex',
      maxWidth: 960,
      maxHeight: 540,
    })).resolves.toBe(3);

    expect(client.request).toHaveBeenCalledWith('open', {
      sourcePath: 'C:/movies/original.mkv',
      indexPath: 'C:/cache/original.bsindex',
      identitySourcePath: 'C:/movies/original.mkv',
      identityIndexPath: 'C:/cache/original.bsindex',
      sourceGeneration: 1,
      maxPreviewWidth: 960,
      maxPreviewHeight: 540,
    }, 60_000);
  });
});
