import { describe, expect, test, vi } from 'vitest';
import { ClipPipeline } from '../../src/business-logic/clip-pipeline.js';
import { Clip } from '../../src/domain/clip.js';
import { ClipCollection } from '../../src/domain/clip-collection.js';
import { ClipCollectionContent } from '../../src/domain/clip-collection-content.js';
import { ClipCollectionInventory } from '../../src/domain/clip-collection-inventory.js';

function makeInventory() {
  return new ClipCollectionInventory({
    folderName: 'clips',
    videoFiles: [
      new File(['a'], 'alpha.mp4'),
      new File(['b'], 'bravo.webm'),
      new File(['c'], 'charlie.mp4'),
    ],
    collectionContents: [
      ClipCollectionContent.fromFilename({
        filename: 'subset.txt',
        orderedClipNames: ['alpha.mp4'],
      }),
      ClipCollectionContent.fromFilename({
        filename: 'picks.txt',
        orderedClipNames: ['bravo.webm'],
      }),
    ],
  });
}

function makeCurrentCollection() {
  return new ClipCollection({
    name: 'clips-default',
    clips: [
      new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ],
  });
}

describe('ClipPipeline', () => {
  test('deletes selected clips from disk, rewrites affected collections, and prunes folder files', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: true,
        code: 'deleted',
        results: [
          { filename: 'alpha.mp4', ok: true },
          { filename: 'charlie.mp4', ok: true },
        ],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const inventory = makeInventory();
    inventory.upsertCollectionContent(
      ClipCollectionContent.fromFilename({
        filename: 'clips-default.txt',
        orderedClipNames: ['alpha.mp4', 'bravo.webm', 'charlie.mp4'],
      })
    );

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1', 'clip_3'],
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'deleted',
      deletedClipIds: ['clip_1', 'clip_3'],
      deletedClipNames: ['alpha.mp4', 'charlie.mp4'],
      targetedSavedCollectionCount: 2,
      cleanedSavedCollectionCount: 2,
    });
    expect(fileSystem.deleteFiles).toHaveBeenCalledWith({
      folderSession: { accessMode: 'readwrite' },
      filenames: ['alpha.mp4', 'charlie.mp4'],
    });
    expect(fileSystem.saveTextFile).toHaveBeenCalledTimes(2);
    expect(inventory.videoNames()).toEqual(['bravo.webm']);
    expect(inventory.defaultCollection().orderedClipNames).toEqual(['bravo.webm']);
    expect(inventory.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
  });

  test('keeps successful deletes and reports partial results when one file delete fails', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: false,
        code: 'partial',
        results: [
          { filename: 'alpha.mp4', ok: true },
          { filename: 'charlie.mp4', ok: false, code: 'delete-failed', error: new Error('locked') },
        ],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const inventory = makeInventory();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1', 'clip_3'],
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.deletedClipIds).toEqual(['clip_1']);
    expect(result.deletedClipNames).toEqual(['alpha.mp4']);
    expect(result.failedDeletes).toHaveLength(1);
    expect(result.targetedSavedCollectionCount).toBe(1);
    expect(result.cleanedSavedCollectionCount).toBe(1);
    expect(inventory.videoNames()).toEqual(['bravo.webm', 'charlie.mp4']);
    expect(inventory.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
  });

  test('does not rewrite collections when no file delete succeeds', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: false,
        code: 'partial',
        results: [
          { filename: 'alpha.mp4', ok: false, code: 'delete-failed', error: new Error('locked') },
        ],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const inventory = makeInventory();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'delete-failed',
      deletedClipIds: [],
      deletedClipNames: [],
      targetedSavedCollectionCount: 0,
      cleanedSavedCollectionCount: 0,
    });
    expect(fileSystem.saveTextFile).not.toHaveBeenCalled();
    expect(inventory.videoNames()).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
  });

  test('does not create a default backing file solely because delete touched a synthetic default', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: true,
        code: 'deleted',
        results: [{ filename: 'alpha.mp4', ok: true }],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const inventory = makeInventory();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.targetedSavedCollectionCount).toBe(1);
    expect(inventory.defaultCollectionHasBackingFile()).toBe(false);
    expect(inventory.defaultCollection().filename).toBeNull();
    expect(fileSystem.saveTextFile).toHaveBeenCalledTimes(1);
    expect(fileSystem.saveTextFile.mock.calls[0][0].filename).toBe('subset.txt');
  });

  test('reports collection rewrite failures separately from delete failures', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: true,
        code: 'deleted',
        results: [{ filename: 'alpha.mp4', ok: true }],
      })),
      saveTextFile: vi
        .fn()
        .mockResolvedValueOnce({ mode: 'downloaded' }),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const inventory = makeInventory();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.deletedClipNames).toEqual(['alpha.mp4']);
    expect(result.cleanedSavedCollectionCount).toBe(0);
    expect(result.failedCollectionRewrites).toHaveLength(1);
    expect(inventory.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4']);
  });
});
