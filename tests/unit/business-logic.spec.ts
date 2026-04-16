// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

describe('business logic modules', () => {
  const pipelineFactory = new PipelineFactory();

  test('getVideosAndCollectionFiles classifies and sorts top-level folder entries', () => {
    const topVideoB = new File(['b'], 'b.mp4', { type: 'video/mp4' });
    Object.defineProperty(topVideoB, 'webkitRelativePath', { value: 'clips/b.mp4' });
    const topVideoA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(topVideoA, 'webkitRelativePath', { value: 'clips/a.mp4' });
    const collection = new File(['a.mp4\n'], 'subset.txt', { type: 'text/plain' });
    Object.defineProperty(collection, 'webkitRelativePath', { value: 'clips/subset.txt' });
    const nested = new File(['n'], 'nested.mp4', { type: 'video/mp4' });
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'clips/nested/nested.mp4' });

    const result = pipelineFactory.getVideosAndCollectionFiles([topVideoB, collection, topVideoA, nested]);

    expect(result.videos.map((file) => file.name)).toEqual(['a.mp4', 'b.mp4']);
    expect(result.collectionFiles.map((file) => file.name)).toEqual(['subset.txt']);
  });

  test('Pipeline materializes a selected collection and reports missing entries', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4', { type: 'video/mp4' }),
        new File(['b'], 'bravo.mp4', { type: 'video/mp4' }),
      ],
    });
    const source = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['bravo.mp4', 'missing.mp4', 'alpha.mp4'],
    });

    const result = pipeline.materializeCollection(source, {
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.existingNamesInOrder).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(result.partialSequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });
});

