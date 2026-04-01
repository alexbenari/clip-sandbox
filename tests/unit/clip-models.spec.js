import { describe, expect, test } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { ClipCollection } from '../../src/domain/clip-collection.js';
import { ClipCollectionContent } from '../../src/domain/clip-collection-content.js';
import {
  ClipCollectionInventory,
  DEFAULT_COLLECTION_SELECTION_VALUE,
} from '../../src/domain/clip-collection-inventory.js';
import { CollectionDescriptionValidator } from '../../src/domain/collection-description-validator.js';

describe('clip and collection models', () => {
  test('creates clips with stable identity and mutable duration', () => {
    const clip = new Clip({
      id: 'clip_1',
      file: new File(['x'], 'alpha.mp4', { type: 'video/mp4' }),
    });
    expect(clip.id).toBe('clip_1');
    expect(clip.name).toBe('alpha.mp4');
    expect(clip.durationSec).toBeNull();
    clip.setDuration(12.5);
    expect(clip.durationSec).toBe(12.5);
  });

  test('maintains ordered collection contents and supports full-order replacement', () => {
    const clips = [
      new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ];
    const collection = new ClipCollection({ name: 'set-a', clips });
    expect(collection.clipNamesInOrder()).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    collection.replaceOrder(['clip_3', 'clip_1', 'clip_2']);
    expect(collection.orderedClips().map((clip) => clip.id)).toEqual(['clip_3', 'clip_1', 'clip_2']);
    collection.rename('set-b');
    expect(collection.name).toBe('set-b');
    expect(collection.getClip('clip_2')?.name).toBe('bravo.webm');
  });

  test('supports removal and collection construction from ordered names', () => {
    const clips = [
      new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ];
    const collection = ClipCollection.fromClipNames({
      name: 'subset',
      orderedNames: ['charlie.mp4', 'alpha.mp4'],
      clips,
    });
    expect(collection.clipNamesInOrder()).toEqual(['charlie.mp4', 'alpha.mp4']);
    expect(collection.remove('clip_3')).toBe(true);
    expect(collection.clipNamesInOrder()).toEqual(['alpha.mp4']);
  });

  test('builds collection content from runtime collections', () => {
    const clips = [
      new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
    ];
    const collection = new ClipCollection({ name: 'director-cut', clips });
    const content = collection.toCollectionContent({ filename: 'director-cut.txt' });
    expect(content).toBeInstanceOf(ClipCollectionContent);
    expect(content.collectionName).toBe('director-cut');
    expect(content.filename).toBe('director-cut.txt');
    expect(content.orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
    expect(content.toText()).toBe('alpha.mp4\nbravo.webm\n');
  });

  test('creates a synthetic default collection and sorts explicit collections alphabetically', () => {
    const inventory = new ClipCollectionInventory({
      folderName: 'clips',
      videoFiles: [
        new File(['b'], 'bravo.webm'),
        new File(['a'], 'alpha.mp4'),
      ],
      collectionContents: [
        ClipCollectionContent.fromFilename({
          filename: 'zeta.txt',
          orderedClipNames: ['bravo.webm'],
        }),
        ClipCollectionContent.fromFilename({
          filename: 'beta.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
      ],
    });

    expect(inventory.defaultCollection().collectionName).toBe(
      ClipCollectionContent.defaultCollectionNameForFolder('clips')
    );
    expect(inventory.defaultCollection().filename).toBeNull();
    expect(inventory.defaultCollection().orderedClipNames).toEqual(['alpha.mp4', 'bravo.webm']);
    expect(inventory.activeCollection().isDefault).toBe(true);
    expect(inventory.activeSelectionValue()).toBe(DEFAULT_COLLECTION_SELECTION_VALUE);
    expect(inventory.selectableCollections().map((collectionContent) => collectionContent.collectionName)).toEqual([
      'clips-default',
      'beta',
      'zeta',
    ]);
  });

  test('treats default-collection.txt as a regular explicit collection', () => {
    const inventory = new ClipCollectionInventory({
      folderName: 'downhill-racer',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
        new File(['c'], 'charlie.mp4'),
      ],
      collectionContents: [
        ClipCollectionContent.fromFilename({
          filename: 'default-collection.txt',
          orderedClipNames: ['charlie.mp4', 'alpha.mp4'],
        }),
        ClipCollectionContent.fromFilename({
          filename: 'minus-1.txt',
          orderedClipNames: ['alpha.mp4'],
        }),
        ClipCollectionContent.fromFilename({
          filename: 'minus-2.txt',
          orderedClipNames: ['bravo.webm'],
        }),
      ],
    });

    expect(inventory.selectableCollections().map((collectionContent) => collectionContent.collectionName)).toEqual([
      'downhill-racer-default',
      'default-collection',
      'minus-1',
      'minus-2',
    ]);
  });

  test('tracks dirty state against the active collection content', () => {
    const inventory = new ClipCollectionInventory({
      folderName: 'clips',
      videoFiles: [
        new File(['a'], 'alpha.mp4'),
        new File(['b'], 'bravo.webm'),
      ],
    });
    const collection = new ClipCollection({
      name: 'clips-default',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      ],
    });

    expect(inventory.refreshDirtyState(collection)).toBe(false);
    collection.remove('clip_2');
    expect(inventory.refreshDirtyState(collection)).toBe(true);
    inventory.clearDirtyState();
    expect(inventory.hasDirtyChanges()).toBe(false);
  });

  test('validates collection description text and reports human-readable diagnostics', () => {
    const validator = new CollectionDescriptionValidator();
    const valid = validator.parseText({
      text: 'alpha.mp4\nbravo.webm\n',
      filename: 'subset.txt',
    });
    expect(valid.ok).toBe(true);
    expect(valid.content.collectionName).toBe('subset');

    const invalid = validator.parseText({
      text: 'alpha.mp4\nalpha.mp4\n',
      filename: 'subset.txt',
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.code).toBe('invalid-duplicates');
    expect(validator.formatLogEntry(invalid)).toContain('Problem: invalid-duplicates');
  });
});
