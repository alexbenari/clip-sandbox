import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const created: string[] = [];

describe('ThumbnailCacheRuntime', () => {
  afterEach(async () => { await Promise.all(created.splice(0).map(folder => fs.rm(folder, { recursive: true, force: true }))); });

  it('stores bounded PNG bytes behind an opaque id and never returns a path', async () => {
    const { ThumbnailCacheRuntime } = await import('../../electron/thumbnail-cache-runtime.cjs');
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-thumb-cache-'));
    created.push(userData);
    const runtime = new ThumbnailCacheRuntime(userData);
    await runtime.initialize();
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

    const saved = await runtime.save(png);
    const loaded = await runtime.load(saved.id);

    expect(saved.id).toMatch(/^thumbnail_[a-zA-Z0-9_-]{8,120}$/);
    expect(saved).not.toHaveProperty('path');
    expect(Array.from(loaded.bytes)).toEqual(Array.from(png));
    expect(loaded).not.toHaveProperty('path');
  });

  it('cleans only its thumbnail subtree at startup and shutdown', async () => {
    const { ThumbnailCacheRuntime } = await import('../../electron/thumbnail-cache-runtime.cjs');
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-thumb-cache-'));
    created.push(userData);
    const stale = path.join(userData, 'cache', 'thumbnails', 'stale.png');
    const siblingCache = path.join(userData, 'cache', 'other-owner', 'keep.txt');
    await fs.mkdir(path.dirname(stale), { recursive: true });
    await fs.mkdir(path.dirname(siblingCache), { recursive: true });
    await fs.writeFile(stale, 'stale');
    await fs.writeFile(siblingCache, 'keep');
    const runtime = new ThumbnailCacheRuntime(userData);

    await runtime.initialize();
    await expect(fs.stat(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(siblingCache, 'utf8')).resolves.toBe('keep');
    await runtime.save(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    await runtime.cleanup();

    await expect(fs.stat(path.join(userData, 'cache', 'thumbnails'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(siblingCache, 'utf8')).resolves.toBe('keep');
  });

  it('rejects malformed, oversized, and invalid opaque-id requests', async () => {
    const { ThumbnailCacheRuntime } = await import('../../electron/thumbnail-cache-runtime.cjs');
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-thumb-cache-'));
    created.push(userData);
    const runtime = new ThumbnailCacheRuntime(userData, { maxPngBytes: 16 });
    await runtime.initialize();

    await expect(runtime.save(Uint8Array.from([1, 2, 3]))).rejects.toThrow('PNG');
    await expect(runtime.save(new Uint8Array(17))).rejects.toThrow('limit');
    await expect(runtime.load('../outside')).rejects.toThrow('id');
  });
});
