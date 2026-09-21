import { afterEach, describe, expect, it, vi } from 'vitest';

import { ElectronThumbnailCacheService } from '../../src/adapters/electron/electron-thumbnail-cache-service.js';
import { ThumbnailOpaqueId } from '../../src/app/thumbnail-cache-service.js';
import type { FrameReviewDisplayFrame } from '../../src/frame-review/frame-review-api.js';

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = { arrayBuffer: async () => pngBytes.buffer, type: 'image/png' } as Blob;
const frame = {} as FrameReviewDisplayFrame;

afterEach(() => { vi.restoreAllMocks(); });

describe('ElectronThumbnailCacheService', () => {
  it('passes only bounded PNG bytes and opaque ids across the renderer boundary', async () => {
    const createObjectURL = vi.fn(() => 'blob:thumbnail');
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const save = vi.fn(async () => ({ ok: true, id: 'thumbnail_12345678' }));
    const load = vi.fn(async () => ({ ok: true, id: 'thumbnail_12345678', bytes: pngBytes }));
    const remove = vi.fn(async () => ({ ok: true }));
    const service = new ElectronThumbnailCacheService({
      window: { clipSandboxDesktop: { thumbnailCache: { save, load, delete: remove } } } as unknown as Window,
      encoder: { encode: vi.fn(async () => png) },
    });

    const saved = await service.save(frame);
    const loaded = await service.load(ThumbnailOpaqueId.parse('thumbnail_12345678'));
    await service.delete(saved.id);
    service.dispose();

    expect(save).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(saved).toEqual({ id: 'thumbnail_12345678', url: 'blob:thumbnail' });
    expect(loaded.id).toBe('thumbnail_12345678');
    expect(remove).toHaveBeenCalledWith('thumbnail_12345678');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(JSON.stringify(save.mock.calls)).not.toMatch(/[A-Z]:\\/i);
  });
});
