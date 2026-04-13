import { describe, expect, test, vi } from 'vitest';
import { ClipPipelineLoader } from '../../src/business-logic/clip-pipeline-loader.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';
import { createSavedCollectionRef } from '../../src/domain/collection-ref.js';

describe('clip pipeline loader', () => {
  function createFile(content, name, type) {
    const file = new File([content], name, { type });
    file.text = () => Promise.resolve(String(content));
    return file;
  }

  test('loadPipeline builds inventory and materializes the default collection', async () => {
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

    expect(result.inventory.folderName).toBe('clips');
    expect(result.initialCollectionContent.isDefault).toBe(true);
    expect(result.materialization.kind).toBe('loaded');
    expect(result.materialization.collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });

  test('loadCollectionByRef materializes saved collections and preserves missing-entry conflicts', async () => {
    const loader = new ClipPipelineLoader();
    const validator = new CollectionDescriptionValidator();
    const files = [
      createFile('a', 'alpha.mp4', 'video/mp4'),
      createFile('b', 'bravo.mp4', 'video/mp4'),
      createFile('bravo.mp4\nmissing.mp4\n', 'subset.txt', 'text/plain'),
    ];

    const pipeline = await loader.loadPipeline({
      folderName: 'clips',
      files,
      validator,
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    const result = loader.loadCollectionByRef({
      inventory: pipeline.inventory,
      collectionRef: createSavedCollectionRef('subset.txt'),
      nextClipId: vi.fn().mockReturnValueOnce('clip_3'),
    });

    expect(result.collectionContent.collectionName).toBe('subset');
    expect(result.materialization.kind).toBe('has-missing');
    expect(result.materialization.missingNames).toEqual(['missing.mp4']);
    expect(result.materialization.partialCollection.orderedClips().map((clip) => clip.id)).toEqual(['clip_3']);
  });
});
