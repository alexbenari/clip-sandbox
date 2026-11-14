import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WindowsFileNameValidity } from '../../src/domain/windows-file-name-validity.js';

const require = createRequire(import.meta.url);
const { FolderAccessRegistry } = require('../../electron/folder-access-registry.cjs');
const { PipelineCatalogRuntime } = require('../../electron/pipeline-catalog-runtime.cjs');

describe('PipelineCatalogRuntime', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
  });

  it('lists video-bearing and empty child folders with extraction-tmp first and omits paths from descriptors', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Beta', ['beta-01.mp4']);
    await writePipeline(root, 'Alpha', ['alpha-01.mp4']);
    await writePipeline(root, 'extraction-tmp', ['extracted-01.mp4']);
    await fs.mkdir(path.join(root, 'Charlie'));

    const runtime = catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry());
    const result = await runtime.listPipelines(renderer(11));

    expect(result.kind).toBe('available');
    expect(result.entries.map((entry: { name: string }) => entry.name)).toEqual(['extraction-tmp', 'Alpha', 'Beta', 'Charlie']);
    expect(result.entries.every((entry: Record<string, unknown>) => !('folderPath' in entry))).toBe(true);
  });

  it('leaves out child folders that hold only other files or only folders', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Sample', ['sample-01.mp4']);
    await writePipeline(root, 'Notes', [], { 'Review.txt': 'sample-01.mp4\n' });
    await fs.mkdir(path.join(root, 'Nested', 'Inner'), { recursive: true });

    const result = await catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry()).listPipelines(renderer(11));

    expect(result.entries.map((entry: { name: string }) => entry.name)).toEqual(['Sample']);
  });

  describe('creating a pipeline', () => {
    it('creates the trimmed name as an empty folder directly in the top folder and answers that name', async () => {
      const root = await temporaryRoot();

      const answer = await catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry()).createPipeline('  Heist films ');

      expect(answer).toEqual({ kind: 'created', name: 'Heist films' });
      expect(await fs.readdir(path.join(root, 'Heist films'))).toEqual([]);
    });

    it.each([
      ['a reserved device name', 'CON'],
      ['a question mark', 'a?b'],
      ['a trailing dot', 'Noir.'],
      ['a drive-relative name', 'a:b'],
      ['the parent folder', '..'],
      ['a name with a folder in it', 'sub\\inner'],
      ['an absolute path', 'C:\\elsewhere'],
      ['an empty name', '   '],
      ['a value that is not text', 7],
    ])('refuses %s as an invalid name and creates nothing', async (_scenario, name) => {
      const root = await temporaryRoot();

      const answer = await catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry()).createPipeline(name);

      expect(answer).toEqual({ kind: 'refused', reason: 'invalid-name' });
      expect(await fs.readdir(root)).toEqual([]);
    });

    it.each([
      ['a folder named the same in another case', async (root: string) => fs.mkdir(path.join(root, 'noir'))],
      ['a file of that name', async (root: string) => fs.writeFile(path.join(root, 'Noir'), 'notes')],
      ['a folder the list does not show', async (root: string) => writePipeline(root, 'Noir', [], { 'Review.txt': '' })],
    ])('refuses a name taken by %s', async (_scenario, occupy) => {
      const root = await temporaryRoot();
      await occupy(root);

      const answer = await catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry()).createPipeline('Noir');

      expect(answer).toEqual({ kind: 'refused', reason: 'name-taken' });
    });

    it.each([
      ['the parent folder', '..'],
      ['a name with a folder in it', 'sub\\inner'],
      ['the top folder itself', '.'],
    ])('refuses %s even when the name rule lets it through, and creates nothing', async (_scenario, name) => {
      const root = await temporaryRoot();
      const allowEveryName = { isLegalWindowsFileName: () => true };
      const runtime = new PipelineCatalogRuntime({
        settingsStore: settingsStoreFor(root), folderAccess: new FolderAccessRegistry(), fileNameValidity: allowEveryName,
      });

      const answer = await runtime.createPipeline(name);

      expect(answer).toEqual({ kind: 'refused', reason: 'invalid-name' });
      expect(await fs.readdir(root)).toEqual([]);
    });

    it('lets a file-system failure other than a taken name or a missing top folder reach the caller', async () => {
      const root = await temporaryRoot();
      const accessDenied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      const runtime = new PipelineCatalogRuntime({
        settingsStore: settingsStoreFor(root),
        folderAccess: new FolderAccessRegistry(),
        fileNameValidity: new WindowsFileNameValidity(),
        fs: { mkdir: vi.fn(async () => { throw accessDenied; }) },
      });

      await expect(runtime.createPipeline('Noir')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('refuses when no top folder is set', async () => {
      const settingsStore = { load: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: null } })) };

      const answer = await catalogRuntime(settingsStore, new FolderAccessRegistry()).createPipeline('Noir');

      expect(answer).toEqual({ kind: 'refused', reason: 'no-top-folder' });
    });

    it('refuses when the top folder no longer exists, and creates nothing', async () => {
      const root = await temporaryRoot();
      await fs.rm(root, { recursive: true });

      const answer = await catalogRuntime(settingsStoreFor(root), new FolderAccessRegistry()).createPipeline('Noir');

      expect(answer).toEqual({ kind: 'refused', reason: 'top-folder-missing' });
      await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('describes collections and clips only for a catalog entry granted to the same renderer', async () => {
    const root = await temporaryRoot();
    await writePipeline(root, 'Sample', ['sample-02.mp4', 'sample-01.mp4'], {
      'Review.txt': 'sample-02.mp4\nsample-01.mp4\n',
    });
    const access = new FolderAccessRegistry();
    const runtime = catalogRuntime(settingsStoreFor(root), access);
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
    const runtime = catalogRuntime(settingsStoreFor(root), access);
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
    const runtime = catalogRuntime(settingsStore, access);
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

function catalogRuntime(settingsStore: { load: () => Promise<unknown> }, folderAccess: unknown) {
  return new PipelineCatalogRuntime({ settingsStore, folderAccess, fileNameValidity: new WindowsFileNameValidity() });
}

function settingsStoreFor(root: string) {
  return { load: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: root } })) };
}

function renderer(id: number) {
  return { id, once: vi.fn() };
}
