// @vitest-environment node
// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { ClipSequence } from '../../src/domain/clip-sequence.js';
import { Clip } from '../../src/domain/clip.js';
import { clipSource } from '../support/clip-source-fixtures.js';

describe('pipeline selections', () => {
  test('hasCollectionWithFilename matches saved collections regardless of letter case', () => {
    const pipeline = new Pipeline({
      collections: [Collection.fromFilename({ filename: 'Highlights.txt', orderedClipNames: ['alpha.mp4'] })],
    });

    expect(pipeline.hasCollectionWithFilename('highlights.txt')).toBe(true);
    expect(pipeline.hasCollectionWithFilename('Highlights.txt')).toBe(true);
    expect(pipeline.hasCollectionWithFilename('picks.txt')).toBe(false);
  });

  test('materializePipeline loads clips in pipeline order', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('bravo.webm'),
        clipSource('alpha.mp4'),
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
      videoSources: [
        clipSource('alpha.mp4'),
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

  test('materializeCollection reports missing entries and keeps the existing clips in collection order', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
      ],
    });
    const collection = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['bravo.webm', 'missing.mp4', 'alpha.mp4'],
    });
    let nextId = 0;

    const result = pipeline.materializeCollection(collection, { nextClipId: () => `clip_${++nextId}` });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.existingNamesInOrder).toEqual(['bravo.webm', 'alpha.mp4']);
    expect(result.partialSequence.clipNamesInOrder()).toEqual(['bravo.webm', 'alpha.mp4']);
  });

  test('materializeCollection references canonical pipeline clips', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.webm'),
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
