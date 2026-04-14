import { describe, expect, test, vi } from 'vitest';
import { ClipPipeline } from '../../src/business-logic/clip-pipeline.js';
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
        orderedClipNames: ['alpha.mp4', 'bravo.webm', 'charlie.mp4'],
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

describe('ClipPipeline', () => {
  test('deletes selected clips from disk, rewrites affected collections, and prunes pipeline files', async () => {
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
    const pipeline = makePipeline();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1', 'clip_3'],
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
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
    expect(pipeline.videoNames()).toEqual(['bravo.webm']);
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.webm']);
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
    const pipeline = makePipeline();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1', 'clip_3'],
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.deletedClipIds).toEqual(['clip_1']);
    expect(result.deletedClipNames).toEqual(['alpha.mp4']);
    expect(result.failedDeletes).toHaveLength(1);
    expect(result.targetedSavedCollectionCount).toBe(2);
    expect(result.cleanedSavedCollectionCount).toBe(2);
    expect(pipeline.videoNames()).toEqual(['bravo.webm', 'charlie.mp4']);
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
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
    const pipeline = makePipeline();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
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
    expect(pipeline.videoNames()).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual(['alpha.mp4']);
  });

  test('rewrites only saved collections that contain deleted clips', async () => {
    const fileSystem = {
      deleteFiles: vi.fn(async () => ({
        ok: true,
        code: 'deleted',
        results: [{ filename: 'alpha.mp4', ok: true }],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const pipeline = makePipeline();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.targetedSavedCollectionCount).toBe(2);
    expect(fileSystem.saveTextFile).toHaveBeenCalledTimes(2);
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.webm', 'charlie.mp4']);
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
        .mockResolvedValueOnce({ mode: 'downloaded' })
        .mockResolvedValueOnce({ mode: 'saved' }),
    };
    const clipPipeline = new ClipPipeline({ fileSystem });
    const pipeline = makePipeline();

    const result = await clipPipeline.deleteSelectedClipsFromDisk({
      selectedClipIds: ['clip_1'],
      currentClipSequence: makeCurrentClipSequence(),
      pipeline,
      currentFolderSession: { accessMode: 'readwrite' },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.deletedClipNames).toEqual(['alpha.mp4']);
    expect(result.cleanedSavedCollectionCount).toBe(1);
    expect(result.failedCollectionRewrites).toHaveLength(1);
    expect(result.failedCollectionRewrites[0].filename).toBe('picks.txt');
    expect(pipeline.getCollectionByFilename('subset.txt')?.orderedClipNames).toEqual([]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
  });
});
