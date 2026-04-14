import { describe, expect, test, vi } from 'vitest';
import { ClipPipelineLoader } from '../../src/business-logic/clip-pipeline-loader.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

describe('clip pipeline loader', () => {
  function createFile(content, name, type) {
    const file = new File([content], name, { type });
    file.text = () => Promise.resolve(String(content));
    return file;
  }

  test('loadPipeline builds a pipeline and materializes the pipeline view first', async () => {
    const loader = new ClipPipelineLoader();
    const validator = new CollectionDescriptionValidator();
    const nextClipId = vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2');
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('alpha.mp4\n', 'subset.txt', 'text/plain'),
    ];

    const result = await loader.loadPipeline({
      folderName: 'clips',
      files,
      validator,
      nextClipId,
    });

    expect(result.pipeline.folderName).toBe('clips');
    expect(result.initialSource).toBe(result.pipeline);
    expect(result.initialSourceId).toEqual(Pipeline.sourceIdValue());
    expect(result.pipeline.selectableSources().map((source) => source.displayLabel())).toEqual(['clips', 'subset']);
    expect(result.materialization.kind).toBe('loaded');
    expect(result.materialization.sequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });

  test('loadSourceById materializes saved collections and preserves missing-entry conflicts', async () => {
    const loader = new ClipPipelineLoader();
    const validator = new CollectionDescriptionValidator();
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('bravo.mp4\nmissing.mp4\n', 'subset.txt', 'text/plain'),
    ];

    const loadedPipeline = await loader.loadPipeline({
      folderName: 'clips',
      files,
      validator,
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    const result = loader.loadSourceById({
      pipeline: loadedPipeline.pipeline,
      sourceId: Collection.sourceIdForFilename('subset.txt'),
      nextClipId: vi.fn().mockReturnValueOnce('clip_3'),
    });

    expect(result.source.collectionName).toBe('subset');
    expect(result.materialization.kind).toBe('has-missing');
    expect(result.materialization.missingNames).toEqual(['missing.mp4']);
    expect(result.materialization.partialSequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_3']);
  });
});
