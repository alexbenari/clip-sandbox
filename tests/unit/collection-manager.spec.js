import { describe, expect, test, vi } from 'vitest';
import { CollectionManager } from '../../src/business-logic/collection-manager.js';
import { Clip } from '../../src/domain/clip.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

function makePipeline() {
  return new Pipeline({
    folderName: 'clips',
    videoFiles: [
      new File(['a'], 'alpha.mp4'),
      new File(['b'], 'bravo.webm'),
      new File(['c'], 'charlie.mp4'),
    ],
    collections: [
      Collection.fromFilename({
        filename: 'subset.txt',
        orderedClipNames: ['alpha.mp4'],
      }),
      Collection.fromFilename({
        filename: 'picks.txt',
        orderedClipNames: ['bravo.webm'],
      }),
    ],
  });
}

function makeCurrentClipSequence() {
  return new ClipSequence({
    name: 'clips',
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
    const pipeline = makePipeline();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_3', 'clip_1'],
      sourceId: Pipeline.sourceIdValue(),
      destination: { kind: 'existing', sourceId: Collection.sourceIdForFilename('subset.txt') },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('subset');
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(fileSystem.saveTextFile).toHaveBeenCalledOnce();
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'charlie.mp4']);
  });

  test('creates and saves a new collection from the selected set', async () => {
    const fileSystem = { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const manager = new CollectionManager({ fileSystem });
    const pipeline = makePipeline();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_2', 'clip_3'],
      sourceId: Pipeline.sourceIdValue(),
      destination: { kind: 'new', name: 'highlights' },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(true);
    expect(result.destinationName).toBe('highlights');
    expect(result.addedCount).toBe(2);
    expect(pipeline.getCollectionByFilename('highlights.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
  });

  test('rejects using the active collection as the destination', async () => {
    const manager = new CollectionManager({ fileSystem: { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) } });
    const pipeline = makePipeline();

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_2'],
      sourceId: Collection.sourceIdForFilename('subset.txt'),
      destination: { kind: 'existing', sourceId: Collection.sourceIdForFilename('subset.txt') },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid-destination' });
  });

  test('returns a no-op result when all selected clips already exist in the destination', async () => {
    const fileSystem = { saveTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const manager = new CollectionManager({ fileSystem });

    const result = await manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceId: Pipeline.sourceIdValue(),
      destination: { kind: 'existing', sourceId: Collection.sourceIdForFilename('subset.txt') },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline: makePipeline(),
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
    const pipeline = makePipeline();

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceId: Pipeline.sourceIdValue(),
      destination: { kind: 'new', name: 'bad:name' },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: null,
    })).resolves.toMatchObject({ ok: false, code: 'illegal-chars' });

    await expect(manager.addSelectedClipsToCollection({
      selectedClipIds: ['clip_1'],
      sourceId: Pipeline.sourceIdValue(),
      destination: { kind: 'new', name: 'subset' },
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: null,
    })).resolves.toMatchObject({ ok: false, code: 'already-exists' });
  });
});
