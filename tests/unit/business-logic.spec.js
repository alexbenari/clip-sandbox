import { describe, expect, test, vi } from 'vitest';
import { getVideosAndCollectionFiles } from '../../src/business-logic/load-clips.js';
import { materializeCollectionContent } from '../../src/business-logic/load-collection.js';
import { persistCollectionContent } from '../../src/business-logic/persist-collection-content.js';
import { ClipCollectionContent } from '../../src/domain/clip-collection-content.js';

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

  test('materializeCollectionContent builds a collection and reports missing entries', () => {
    const result = materializeCollectionContent({
      content: ClipCollectionContent.fromFilename({
        filename: 'subset.txt',
        orderedClipNames: ['bravo.mp4', 'missing.mp4', 'alpha.mp4'],
      }),
      availableVideoFiles: [
        new File(['a'], 'alpha.mp4', { type: 'video/mp4' }),
        new File(['b'], 'bravo.mp4', { type: 'video/mp4' }),
      ],
      nextClipId: vi.fn().mockReturnValueOnce('clip_1').mockReturnValueOnce('clip_2'),
    });

    expect(result.kind).toBe('has-missing');
    expect(result.missingNames).toEqual(['missing.mp4']);
    expect(result.existingNamesInOrder).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(result.partialCollection.orderedClips().map((clip) => clip.id)).toEqual(['clip_1', 'clip_2']);
  });

  test('persistCollectionContent writes content and updates inventory when allowed', async () => {
    const content = ClipCollectionContent.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const fileSystem = {
      saveTextFile: vi.fn().mockResolvedValue({ mode: 'saved' }),
    };
    const inventory = {
      upsertCollectionContent: vi.fn(),
    };

    const result = await persistCollectionContent({
      fileSystem,
      content,
      inventory,
      makeActive: true,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('saved');
    expect(inventory.upsertCollectionContent).toHaveBeenCalledWith(content, { makeActive: true });
  });

  test('persistCollectionContent can require a direct save before updating inventory', async () => {
    const content = ClipCollectionContent.fromFilename({
      filename: 'subset.txt',
      orderedClipNames: ['alpha.mp4'],
    });
    const fileSystem = {
      saveTextFile: vi.fn().mockResolvedValue({ mode: 'downloaded' }),
    };
    const inventory = {
      upsertCollectionContent: vi.fn(),
    };

    const result = await persistCollectionContent({
      fileSystem,
      content,
      inventory,
      requireDirectSave: true,
    });

    expect(result.ok).toBe(false);
    expect(inventory.upsertCollectionContent).not.toHaveBeenCalled();
  });
});
