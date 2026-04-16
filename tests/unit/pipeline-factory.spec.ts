// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

describe('pipeline factory', () => {
  function createFile(content, name, type) {
    const file = new File([content], name, { type });
    file.text = () => Promise.resolve(String(content));
    return file;
  }

  test('buildPipeline builds a pipeline from top-level videos and collections', async () => {
    const pipelineFactory = new PipelineFactory();
    const validator = new CollectionDescriptionValidator();
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('alpha.mp4\n', 'subset.txt', 'text/plain'),
    ];

    const result = await pipelineFactory.buildPipeline({
      folderName: 'clips',
      files,
      validator,
    });

    expect(result.pipeline.folderName).toBe('clips');
    expect(result.pipeline.collections().map((collection) => collection.collectionName)).toEqual(['subset']);
    expect(result.videos.map((file) => file.name)).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(result.collectionFiles.map((file) => file.name)).toEqual(['subset.txt']);
  });
});

describe('pipeline selection loading', () => {
  function createFile(content, name, type) {
    const file = new File([content], name, { type });
    file.text = () => Promise.resolve(String(content));
    return file;
  }

  test('materializePipeline loads the full folder view first', async () => {
    const pipelineFactory = new PipelineFactory();
    const validator = new CollectionDescriptionValidator();
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('alpha.mp4\n', 'subset.txt', 'text/plain'),
    ];
    const nextClipId = vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2');

    const { pipeline } = await pipelineFactory.buildPipeline({
      folderName: 'clips',
      files,
      validator,
    });

    const result = pipeline.materializePipeline({ nextClipId });

    expect(result.kind).toBe('loaded');
    expect(result.sequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });

  test('materializeCollection loads saved collections and preserves missing-entry conflicts', async () => {
    const pipelineFactory = new PipelineFactory();
    const validator = new CollectionDescriptionValidator();
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('bravo.mp4\nmissing.mp4\n', 'subset.txt', 'text/plain'),
    ];

    const { pipeline } = await pipelineFactory.buildPipeline({
      folderName: 'clips',
      files,
      validator,
    });

    const result = pipeline.materializeCollection(
      pipeline.getCollectionByFilename('subset.txt'),
      { nextClipId: vi.fn().mockReturnValueOnce('clip_3') }
    );

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.partialSequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_3']);
  });
});
