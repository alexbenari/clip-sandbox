import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { FolderAccessRegistry } = require('../../electron/folder-access-registry.cjs');
const { PipelineCatalogRuntime } = require('../../electron/pipeline-catalog-runtime.cjs');

describe('PipelineCatalogRuntime', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('lists immediate video-bearing child folders with extraction-tmp first and omits paths from descriptors', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Beta', ['beta-01.mp4']);
    await writePipeline(root, 'Alpha', ['alpha-01.mp4']);
    await writePipeline(root, 'extraction-tmp', ['extracted-01.mp4']);
    await fs.mkdir(path.join(root, 'Empty'));

    const runtime = new PipelineCatalogRuntime({
      settingsStore: settingsStoreFor(root),
      folderAccess: new FolderAccessRegistry(),
    });
    const result = await runtime.listPipelines(renderer(11));

    expect(result.kind).toBe('available');
    expect(result.entries.map((entry: { name: string }) => entry.name)).toEqual(['extraction-tmp', 'Alpha', 'Beta']);
    expect(result.entries.every((entry: Record<string, unknown>) => !('folderPath' in entry))).toBe(true);
  });

  it('describes collections and clips only for a catalog entry granted to the same renderer', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Sample', ['sample-02.mp4', 'sample-01.mp4'], {
      'Review.txt': 'sample-02.mp4\nsample-01.mp4\n',
    });
    const access = new FolderAccessRegistry();
    const runtime = new PipelineCatalogRuntime({ settingsStore: settingsStoreFor(root), folderAccess: access });
    const owner = renderer(11);
    const catalog = await runtime.listPipelines(owner);
    const entry = catalog.entries[0];

    await expect(runtime.describePipeline(owner, entry.id)).resolves.toEqual({
      clipNames: ['sample-01.mp4', 'sample-02.mp4'],
      collections: [{ name: 'Review', clipNames: ['sample-02.mp4', 'sample-01.mp4'] }],
    });
    await expect(runtime.describePipeline(renderer(12), entry.id))
      .rejects.toThrow('Pipeline access is unavailable');
  });

  it('grants a writable folder session only when a catalog pipeline is opened', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Sample', ['sample-01.mp4']);
    const access = new FolderAccessRegistry();
    const runtime = new PipelineCatalogRuntime({ settingsStore: settingsStoreFor(root), folderAccess: access });
    const owner = renderer(11);
    const pipelinePath = path.join(root, 'Sample');
    const catalog = await runtime.listPipelines(owner);

    expect(() => access.requireKnownPath(owner, pipelinePath)).toThrow('Folder access is unavailable');
    await runtime.describePipeline(owner, catalog.entries[0].id);
    expect(() => access.requireKnownPath(owner, pipelinePath)).toThrow('Folder access is unavailable');

    await runtime.openPipeline(owner, catalog.entries[0].id);
    expect(access.requireKnownPath(owner, pipelinePath)).toBe(pipelinePath);
  });

  it('invalidates catalog entries when the configured root is removed', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Sample', ['sample-01.mp4']);
    const settingsStore = {
      load: vi.fn()
        .mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: root } })
        .mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: null } }),
    };
    const access = new FolderAccessRegistry();
    const runtime = new PipelineCatalogRuntime({ settingsStore, folderAccess: access });
    const owner = renderer(11);
    const catalog = await runtime.listPipelines(owner);

    await expect(runtime.listPipelines(owner)).resolves.toEqual({ kind: 'unconfigured' });
    expect(() => access.requireKnownCatalogPipeline(owner, catalog.entries[0].id))
      .toThrow('Pipeline access is unavailable');
  });

  async function temporaryRoot(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-pipeline-catalog-'));
    temporaryRoots.push(root);
    return root;
  }
});

async function writePipeline(root: string, name: string, videos: readonly string[], collections: Record<string, string> = {}): Promise<void> {
  const pipelinePath = path.join(root, name);
  await fs.mkdir(pipelinePath);
  await Promise.all([
    ...videos.map(filename => fs.writeFile(path.join(pipelinePath, filename), 'video')),
    ...Object.entries(collections).map(([filename, content]) => fs.writeFile(path.join(pipelinePath, filename), content)),
  ]);
}

function settingsStoreFor(root: string) {
  return { load: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: root } })) };
}

function renderer(id: number) {
  return { id, once: vi.fn() };
}
