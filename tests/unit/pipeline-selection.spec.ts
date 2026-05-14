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

  test('materializePipeline reuses canonical clip instances on repeated loads', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
      ],
    });
    const nextClipId = vi.fn().mockReturnValueOnce('clip_1');

    const first = pipeline.materializePipeline({ nextClipId }).sequence.orderedClips()[0];
    first.setVideoMetadata({ durationSec: 7, videoWidth: 640, videoHeight: 360 });
    const second = pipeline.materializePipeline({ nextClipId }).sequence.orderedClips()[0];

    expect(second).toBe(first);
    expect(second.videoWidth).toBe(640);
    expect(nextClipId).toHaveBeenCalledTimes(1);
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

  test('materializeCollection references canonical pipeline clips', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
      ],
    });
    const nextClipId = vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2');
    const pipelineClip = pipeline.materializePipeline({ nextClipId }).sequence.getClip('clip_2');
    pipelineClip.setVideoMetadata({ durationSec: 3, videoWidth: 720, videoHeight: 390 });
    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['bravo.webm'],
    });

    const result = pipeline.materializeCollection(collection, { nextClipId });

    expect(result.sequence.orderedClips()[0]).toBe(pipelineClip);
    expect(result.sequence.orderedClips()[0].videoHeight).toBe(390);
    expect(nextClipId).toHaveBeenCalledTimes(2);
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
