import { describe, expect, test, vi } from 'vitest';
import { CollectionManager } from '../../src/business-logic/collection-manager.js';
import { Clip } from '../../src/domain/clip.js';
import { ClipCollection } from '../../src/domain/clip-collection.js';
import { ClipCollectionContent } from '../../src/domain/clip-collection-content.js';
import { ClipCollectionInventory } from '../../src/domain/clip-collection-inventory.js';
import { createDefaultCollectionRef, createSavedCollectionRef } from '../../src/domain/collection-ref.js';

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

describe('CollectionManager', () => {
  test('adds selected clips to an existing collection and saves immediately', async () => {
    const fileSystem = { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();
    const currentCollection = makeCurrentCollection();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_3', 'clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'existing', collectionRef: createSavedCollectionRef('subset.txt') },
      currentCollection,
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('subset');
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(fileSystem.saveTextFile).toHaveBeenCalledOnce();
    expect(inventory.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('creates and saves a new collection from the selected set', async () => {
    const fileSystem = { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();
    const currentCollection = makeCurrentCollection();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_2', 'clip_3'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'highlights' },
      currentCollection,
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('highlights');
    expect(result.addedCount).toBe(2);
    expect(inventory.getCollectionByFilename('highlights.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
  });

  test('updates the default collection entry when adding to the default destination', async () => {
    const manager = new CollectionManager({ fileSystem: { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) } });
    const inventory = makeInventory();
    inventory.upsertCollectionContent(
      ClipCollectionContent.fromFilename({
        filename: 'clips-default.txt',
        orderedClipNames: ['alpha.mp4'],
      })
    );

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_2', 'clip_3'],
      sourceCollectionRef: createSavedCollectionRef('subset.txt'),
      destination: { kind: 'existing', collectionRef: createDefaultCollectionRef() },
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(true);
    expect(inventory.defaultCollection().orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    expect(inventory.selectableCollections().map((collectionContent) => collectionContent.collectionName)).toEqual([
      'clips-default',
      'picks',
      'subset',
    ]);
  });

  test('returns a no-op result when all selected clips already exist in the destination', async () => {
    const fileSystem = { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const manager = new CollectionManager({ fileSystem });

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'existing', collectionRef: createSavedCollectionRef('subset.txt') },
      currentCollection: makeCurrentCollection(),
      inventory: makeInventory(),
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'no-op',
      addedCount: 0,
      skippedCount: 1,
    });
    expect(fileSystem.saveTextFile).not.toHaveBeenCalled();
  });

  test('rejects invalid or duplicate new collection names', async () => {
    const manager = new CollectionManager({ fileSystem: { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) } });
    const inventory = makeInventory();

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'bad:name' },
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: null,
    })).resolves.toMatchObject({ ok: false, code: 'illegal-chars' });

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'subset' },
      currentCollection: makeCurrentCollection(),
      inventory,
      currentFolderSession: null,
    })).resolves.toMatchObject({ ok: false, code: 'already-exists' });
  });

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
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();
    inventory.upsertCollectionContent(
      ClipCollectionContent.fromFilename({
        filename: 'clips-default.txt',
        orderedClipNames: ['alpha.mp4', 'bravo.webm', 'charlie.mp4'],
      })
    );

    const result = await manager.deleteSelectedClipsFromDisk({
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
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();

    const result = await manager.deleteSelectedClipsFromDisk({
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
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();

    const result = await manager.deleteSelectedClipsFromDisk({
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
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();

    const result = await manager.deleteSelectedClipsFromDisk({
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
    const manager = new CollectionManager({ fileSystem });
    const inventory = makeInventory();

    const result = await manager.deleteSelectedClipsFromDisk({
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
