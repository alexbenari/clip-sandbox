import { describe, expect, test, vi } from 'vitest';
import { getVideosAndCollectionFiles } from '../../src/business-logic/load-clips.js';
import { materializeSource } from '../../src/business-logic/load-collection.js';
import { persistCollectionContent } from '../../src/business-logic/persist-collection-content.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

describe('business logic modules', () => {
  test('getVideosAndCollectionFiles classifies and sorts top-level folder entries', () => {
    const topVideoB = new File(['b'], 'b.mp4', { type: 'video/mp4' });
    Object.defineProperty(topVideoB, 'webkitRelativePath', { value: 'clips/b.mp4' });
    const topVideoA = new File(['a'], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(topVideoA, 'webkitRelativePath', { value: 'clips/a.mp4' });
    const collection = new File(['a.mp4\n'], 'subset.txt', { type: 'text/plain' });
    Object.defineProperty(collection, 'webkitRelativePath', { value: 'clips/subset.txt' });
    const nested = new File(['n'], 'nested.mp4', { type: 'video/mp4' });
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'clips/nested/nested.mp4' });

    const result = getVideosAndCollectionFiles([topVideoB, collection, topVideoA, nested]);

    expect(result.videos.map((file) => file.name)).toEqual(['a.mp4', 'b.mp4']);
    expect(result.collectionFiles.map((file) => file.name)).toEqual(['subset.txt']);
  });

  test('materializeSource builds a clip sequence and reports missing collection entries', () => {
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

    const result = materializeSource({
      source,
      pipeline,
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.existingNamesInOrder).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(result.partialSequence.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });

  test('persistCollectionContent writes content and updates the pipeline when allowed', async () => {
    const content = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const fileSystem = {
      saveTextFile: vi.fn().mockResolvedValue({ mode: 'saved' }),
    };
    const pipeline = {
      upsertCollection: vi.fn(),
    };

    const result = await persistCollectionContent({
      fileSystem,
      content,
      pipeline,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('saved');
    expect(pipeline.upsertCollection).toHaveBeenCalledWith(content);
  });

  test('persistCollectionContent can require a direct save before updating the pipeline', async () => {
    const content = Collection.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const fileSystem = {
      saveTextFile: vi.fn().mockResolvedValue({ mode: 'downloaded' }),
    };
    const pipeline = {
      upsertCollection: vi.fn(),
    };

    const result = await persistCollectionContent({
      fileSystem,
      content,
      pipeline,
      requireDirectSave: true,
    });

    expect(result.ok).toBe(false);
    expect(pipeline.upsertCollection).not.toHaveBeenCalled();
  });
});
