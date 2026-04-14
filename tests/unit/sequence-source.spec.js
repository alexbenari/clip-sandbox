import { describe, expect, test, vi } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import {
  materializeClipSequenceFromSource,
  sourceBaselineClipNames,
  sourceIdOf,
  sourceLabelOf,
  supportsNonPhysicalDelete,
  supportsSaveAsCollection,
  supportsSaveToExisting,
} from '../../src/domain/clip-sequence-source.js';

describe('sequence sources', () => {
  test('pipeline and collection expose shared source behavior and different capabilities', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
      ],
      collections: [
        Collection.fromFilename({
          filename: 'subset.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });
    const collection = pipeline.getCollectionByFilename('subset.txt');

    expect(sourceIdOf(pipeline)).toEqual({ kind: 'pipeline' });
    expect(sourceLabelOf(pipeline)).toBe('clips');
    expect(sourceBaselineClipNames(pipeline)).toEqual(['alpha.mp4', 'bravo.webm']);
    expect(supportsSaveToExisting(pipeline)).toBe(false);
    expect(supportsSaveAsCollection(pipeline)).toBe(false);
    expect(supportsNonPhysicalDelete(pipeline)).toBe(false);

    expect(sourceIdOf(collection)).toEqual({ kind: 'collection', filename: 'subset.txt' });
    expect(sourceLabelOf(collection)).toBe('subset');
    expect(sourceBaselineClipNames(collection)).toEqual(['alpha.mp4']);
    expect(supportsSaveToExisting(collection)).toBe(true);
    expect(supportsSaveAsCollection(collection)).toBe(true);
    expect(supportsNonPhysicalDelete(collection)).toBe(true);
  });

  test('pipeline materializes a runtime clip sequence in pipeline order', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['a'], 'alpha.mp4'),
      ],
    });

    const result = materializeClipSequenceFromSource(pipeline, {
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    expect(result.kind).toBe('loaded');
    expect(result.sequence).toBeInstanceOf(ClipSequence);
    expect(result.sequence.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.webm']);
  });

  test('collection materialization preserves missing-entry conflicts', () => {
    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['bravo.webm', 'missing.mp4'],
    });
    const files = [
      new File(['b'], 'bravo.webm'),
    ];

    const result = materializeClipSequenceFromSource(collection, {
      availableVideoFiles: files,
      nextClipId: vi.fn().mockReturnValueOnce('clip_1'),
    });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.partialSequence.clipNamesInOrder()).toEqual(['bravo.webm']);
  });

  test('clip sequence converts runtime order back into a collection payload', () => {
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
