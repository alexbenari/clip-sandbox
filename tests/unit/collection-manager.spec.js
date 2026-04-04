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
    const saveTextToDirectory = vi.fn(async () => {});
    const downloadText = vi.fn();
    const manager = new CollectionManager({ saveTextToDirectory, downloadText });
    const inventory = makeInventory();
    const currentCollection = makeCurrentCollection();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_3', 'clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'existing', collectionRef: createSavedCollectionRef('subset.txt') },
      currentCollection,
      inventory,
      currentDirHandle: {
        kind: 'directory',
        getFileHandle: vi.fn(async () => ({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        })),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('subset');
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(saveTextToDirectory).toHaveBeenCalledOnce();
    expect(downloadText).not.toHaveBeenCalled();
    expect(inventory.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('creates and saves a new collection from the selected set', async () => {
    const saveTextToDirectory = vi.fn(async () => {});
    const manager = new CollectionManager({ saveTextToDirectory, downloadText: vi.fn() });
    const inventory = makeInventory();
    const currentCollection = makeCurrentCollection();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_2', 'clip_3'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'highlights' },
      currentCollection,
      inventory,
      currentDirHandle: {
        kind: 'directory',
        getFileHandle: vi.fn(async () => ({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        })),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('highlights');
    expect(result.addedCount).toBe(2);
    expect(inventory.getCollectionByFilename('highlights.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
  });

  test('updates the default collection entry when adding to the default destination', async () => {
    const manager = new CollectionManager({ saveTextToDirectory: vi.fn(async () => {}), downloadText: vi.fn() });
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
      currentDirHandle: {
        kind: 'directory',
        getFileHandle: vi.fn(async () => ({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        })),
      },
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
    const saveTextToDirectory = vi.fn(async () => {});
    const manager = new CollectionManager({ saveTextToDirectory, downloadText: vi.fn() });

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'existing', collectionRef: createSavedCollectionRef('subset.txt') },
      currentCollection: makeCurrentCollection(),
      inventory: makeInventory(),
      currentDirHandle: {
        kind: 'directory',
        getFileHandle: vi.fn(async () => ({
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
          }),
        })),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'no-op',
      addedCount: 0,
      skippedCount: 1,
    });
    expect(saveTextToDirectory).not.toHaveBeenCalled();
  });

  test('rejects invalid or duplicate new collection names', async () => {
    const manager = new CollectionManager({ saveTextToDirectory: vi.fn(async () => {}), downloadText: vi.fn() });
    const inventory = makeInventory();

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'bad:name' },
      currentCollection: makeCurrentCollection(),
      inventory,
      currentDirHandle: null,
    })).resolves.toMatchObject({ ok: false, code: 'illegal-chars' });

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceCollectionRef: createDefaultCollectionRef(),
      destination: { kind: 'new', name: 'subset' },
      currentCollection: makeCurrentCollection(),
      inventory,
      currentDirHandle: null,
    })).resolves.toMatchObject({ ok: false, code: 'already-exists' });
  });
});
