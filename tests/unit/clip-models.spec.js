import { describe, expect, test } from 'vitest';
import { Clip } from '../../src/domain/clip.js';
import { ClipCollection } from '../../src/domain/clip-collection.js';

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
});

