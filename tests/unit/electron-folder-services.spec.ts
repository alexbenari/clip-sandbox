// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { ElectronFolderFileService } from '../../src/adapters/electron/electron-folder-file-service.js';
import { ElectronFolderService } from '../../src/adapters/electron/electron-folder-service.js';
import { ElectronPipelineCatalogService } from '../../src/adapters/electron/electron-pipeline-catalog-service.js';

describe('electron folder services', () => {
  it('builds folder access and renderer files from the desktop api', async () => {
    const api = {
      pickFolder: vi.fn(async () => ({
        canceled: false,
        folderPath: 'C:/clips',
        folderName: 'clips',
        files: [
          {
            name: 'alpha.txt',
            relativePath: 'alpha.txt',
            path: 'C:/clips/alpha.txt',
            text: 'hello',
            type: 'text/plain',
            mediaSource: 'file:///C:/clips/alpha.txt',
            lastModifiedMs: 123,
            frameReviewSourceHandle: 'source_12345678',
          },
        ],
      })),
    };
    const service = new ElectronFolderService(api);

    const result = await service.pickFolder();

    expect(result.folderAccess).toEqual({ folderPath: 'C:/clips' });
    expect(result.folderName).toBe('clips');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      name: 'alpha.txt',
      type: 'text/plain',
      mediaSource: 'file:///C:/clips/alpha.txt',
      desktopPath: 'C:/clips/alpha.txt',
      text: 'hello',
    });
    expect(Object.hasOwn(result.files[0], 'frameReviewSourceHandle')).toBe(false);
  });

  it('lists a video without text and turns a created edit output into a clip source', async () => {
    const api = {
      pickFolder: vi.fn(async () => ({
        folderPath: 'C:/clips',
        files: [{ name: 'alpha.mp4', path: 'C:/clips/alpha.mp4', mediaSource: 'file:///C:/clips/alpha.mp4', type: 'video/mp4' }],
      })),
    };
    const service = new ElectronFolderService(api);

    const { files } = await service.pickFolder();
    const created = service.clipSourceOf({ name: 'alpha-looped.mp4', path: 'C:/clips/alpha-looped.mp4', mediaSource: 'file:///C:/clips/alpha-looped.mp4' });

    expect(files[0]).toEqual({ name: 'alpha.mp4', type: 'video/mp4', mediaSource: 'file:///C:/clips/alpha.mp4', desktopPath: 'C:/clips/alpha.mp4' });
    expect(Object.hasOwn(files[0], 'text')).toBe(false);
    expect(created).toMatchObject({ name: 'alpha-looped.mp4', mediaSource: 'file:///C:/clips/alpha-looped.mp4', desktopPath: 'C:/clips/alpha-looped.mp4' });
    expect(() => service.clipSourceOf({ name: 'broken.mp4' })).toThrow('Clip source media address is required.');
  });

  it('refuses a picked folder that has no path, so no folder access exists without one', async () => {
    const api = { pickFolder: vi.fn(async () => ({ canceled: false, folderPath: '', folderName: 'clips', files: [] })) };
    const service = new ElectronFolderService(api);

    await expect(service.pickFolder()).rejects.toThrow('folder without a path');
  });

  it('reloads a previously selected desktop folder through the desktop api', async () => {
    const api = {
      refreshFolder: vi.fn(async ({ folderPath }) => ({
        folderPath,
        folderName: 'clips',
        files: [{
          name: 'bravo.mp4',
          relativePath: 'bravo.mp4',
          path: 'C:/clips/bravo.mp4',
          mediaSource: 'file:///C:/clips/bravo.mp4',
          type: 'video/mp4',
          lastModifiedMs: 456,
        }],
      })),
    };
    const service = new ElectronFolderService(api);

    const result = await service.refreshFolder({ folderPath: 'C:/clips' });

    expect(api.refreshFolder).toHaveBeenCalledWith({ folderPath: 'C:/clips' });
    expect(result.folderAccess).toEqual({ folderPath: 'C:/clips' });
    expect(result.folderName).toBe('clips');
    expect(result.files.map(file => file.name)).toEqual(['bravo.mp4']);
  });

  it('uses opaque catalog entry ids to list, describe, and open a configured pipeline', async () => {
    const api = {
      listPipelineCatalog: vi.fn(async () => ({ kind: 'available', entries: [{ id: 'pipeline_1', name: 'Sample' }] })),
      describePipelineCatalogEntry: vi.fn(async ({ pipelineId }) => ({
        clipNames: ['sample-01.mp4'],
        collections: [{ name: 'Review', clipNames: ['sample-01.mp4'] }],
        pipelineId,
      })),
      openPipelineCatalogEntry: vi.fn(async ({ pipelineId }) => ({
        folderPath: 'C:/pipelines/Sample',
        folderName: 'Sample',
        files: [{ name: 'sample-01.mp4', type: 'video/mp4', mediaSource: 'file:///C:/pipelines/Sample/sample-01.mp4' }],
        pipelineId,
      })),
    };
    const service = new ElectronPipelineCatalogService(api, new ElectronFolderService(api));
    const catalog = await service.listPipelineCatalog();
    if (catalog.kind !== 'available') throw new Error('Expected an available pipeline catalog.');
    const entry = catalog.entries[0]!;

    await expect(service.describePipelineCatalogEntry(entry)).resolves.toEqual({
      clipNames: ['sample-01.mp4'],
      collections: [{ name: 'Review', clipNames: ['sample-01.mp4'] }],
    });
    await expect(service.openPipelineCatalogEntry(entry)).resolves.toMatchObject({
      folderName: 'Sample',
      folderAccess: { folderPath: 'C:/pipelines/Sample' },
    });
    expect(api.describePipelineCatalogEntry).toHaveBeenCalledWith({ pipelineId: 'pipeline_1' });
    expect(api.openPipelineCatalogEntry).toHaveBeenCalledWith({ pipelineId: 'pipeline_1' });
  });

  it('maps Recycle Bin responses into renderer-facing errors', async () => {
    const api = {
      trashFiles: vi.fn(async () => ({
        ok: false,
        code: 'partial',
        results: [
          { filename: 'alpha.mp4', ok: true },
          { filename: 'bravo.mp4', ok: false, code: 'trash-failed', error: { message: 'locked' } },
        ],
      })),
    };
    const service = new ElectronFolderFileService(api);

    const result = await service.trashFiles({
      folderAccess: { folderPath: 'C:/clips' },
      filenames: ['alpha.mp4', 'bravo.mp4'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.results[0]).toMatchObject({ filename: 'alpha.mp4', ok: true });
    expect(result.results[0].error).toBeNull();
    expect(result.results[1]).toMatchObject({ filename: 'bravo.mp4', ok: false, code: 'trash-failed' });
    expect(result.results[1].error).toBeInstanceOf(Error);
    expect(result.results[1].error.message).toBe('locked');
  });

  it('rejects traversal and invalid top-level filenames before save-like calls reach the desktop api', async () => {
    const api = {
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
      appendTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const service = new ElectronFolderFileService(api);
    const folderAccess = { folderPath: 'C:/clips' };

    await expect(service.saveTextFile({
      folderAccess,
      filename: '../outside.txt',
      text: 'alpha.mp4\n',
    })).rejects.toThrow('Invalid top-level filename');

    await expect(service.appendTextFile({
      folderAccess,
      filename: 'CON',
      text: 'problem',
    })).rejects.toThrow('Invalid top-level filename');

    expect(api.saveTextFile).not.toHaveBeenCalled();
    expect(api.appendTextFile).not.toHaveBeenCalled();
  });

  it('returns structured Recycle Bin failures for invalid filenames without calling the desktop api', async () => {
    const api = {
      trashFiles: vi.fn(async () => ({
        ok: true,
        code: 'trashed',
        results: [],
      })),
    };
    const service = new ElectronFolderFileService(api);

    const result = await service.trashFiles({
      folderAccess: { folderPath: 'C:/clips' },
      filenames: ['alpha.mp4', '..\\secret.mp4'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      filename: 'alpha.mp4',
      ok: false,
      code: 'trash-failed',
    });
    expect(result.results[1]).toMatchObject({
      filename: '..\\secret.mp4',
      ok: false,
      code: 'trash-failed',
    });
    expect(result.results[0].error).toBeInstanceOf(Error);
    expect(result.results[1].error).toBeInstanceOf(Error);
    expect(api.trashFiles).not.toHaveBeenCalled();
  });
});
