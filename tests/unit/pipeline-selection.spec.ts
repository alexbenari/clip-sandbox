// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Clip } from '../../src/domain/clip.js';

describe('pipeline selections', () => {
  test('materializePipeline loads clips in pipeline order', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['a'], 'alpha.mp4'),
      ],
    });

    const result = pipeline.materializePipeline({
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    expect(result.kind).toBe('loaded');
    expect(result.sequence).toBeInstanceOf(ClipSequence);
    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.webm']);
  });

  test('materializeCollection preserves missing-entry conflicts', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
      ],
    });
    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['bravo.webm', 'missing.mp4'],
    });

    const result = pipeline.materializeCollection(collection, {
      nextClipId: vi.fn().mockReturnValueOnce('clip_1'),
    });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.partialSequence.clipNamesInOrder()).toEqual(['bravo.webm']);
  });
});

describe('clip sequence to collection conversion', () => {
  test('converts runtime order back into a durable collection payload', () => {
    const sequence = new ClipSequence({
      name: 'highlights',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });

    const collection = sequence.toCollection({ filename: 'highlights.txt' });
    expect(collection).toBeInstanceOf(Collection);
    expect(collection.collectionName).toBe('highlights');
    expect(collection.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
  });
});
