// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource, folderEntry } from '../support/clip-source-fixtures.js';

describe('business logic modules', () => {
  const pipelineFactory = new PipelineFactory();

  test('getVideosAndCollectionFiles classifies and sorts folder entries', () => {
    const result = pipelineFactory.getVideosAndCollectionFiles([
      folderEntry('b.mp4'),
      folderEntry('subset.txt', { text: 'a.mp4\n' }),
      folderEntry('a.mp4'),
    ]);

    expect(result.videos.map((file) => file.name)).toEqual(['a.mp4', 'b.mp4']);
    expect(result.collectionFiles.map((file) => file.name)).toEqual(['subset.txt']);
  });

  test('Pipeline materializes a selected collection and reports missing entries', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      videoSources: [
        clipSource('alpha.mp4'),
        clipSource('bravo.mp4'),
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
    expect(result.partialSequence.clipNamesInOrder()).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(result.partialSequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_2', 'clip_1']);
  });
});

