import { describe, expect, test } from 'vitest';
import { createClip, setClipDuration } from '../../src/domain/clip-model.js';
import {
  clipNamesInOrder,
  createClipCollection,
  createCollectionFromClipNames,
  getClip,
  orderedClips,
  removeClipFromCollection,
  replaceClipOrder,
  renameClipCollection,
} from '../../src/domain/clip-collection.js';

describe('clip and collection models', () => {
  test('creates clips with stable identity and mutable duration', () => {
    const clip = createClip({
      id: 'clip_1',
      file: new File(['x'], 'alpha.mp4', { type: 'video/mp4' }),
    });
    expect(clip.id).toBe('clip_1');
    expect(clip.name).toBe('alpha.mp4');
    expect(clip.durationSec).toBeNull();
    setClipDuration(clip, 12.5);
    expect(clip.durationSec).toBe(12.5);
  });

  test('maintains ordered collection contents and supports full-order replacement', () => {
    const clips = [
      createClip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      createClip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      createClip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ];
    const collection = createClipCollection({ name: 'set-a', clips });
    expect(clipNamesInOrder(collection)).toEqual(['alpha.mp4', 'bravo.webm', 'charlie.mp4']);
    replaceClipOrder(collection, ['clip_3', 'clip_1', 'clip_2']);
    expect(orderedClips(collection).map((clip) => clip.id)).toEqual(['clip_3', 'clip_1', 'clip_2']);
    renameClipCollection(collection, 'set-b');
    expect(collection.name).toBe('set-b');
    expect(getClip(collection, 'clip_2')?.name).toBe('bravo.webm');
  });

  test('supports removal and collection construction from ordered names', () => {
    const clips = [
      createClip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4') }),
      createClip({ id: 'clip_2', file: new File(['b'], 'bravo.webm') }),
      createClip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4') }),
    ];
    const collection = createCollectionFromClipNames({
      name: 'subset',
      orderedNames: ['charlie.mp4', 'alpha.mp4'],
      clips,
    });
    expect(clipNamesInOrder(collection)).toEqual(['charlie.mp4', 'alpha.mp4']);
    expect(removeClipFromCollection(collection, 'clip_3')).toBe(true);
    expect(clipNamesInOrder(collection)).toEqual(['alpha.mp4']);
  });
});
