import { describe, expect, it } from 'vitest';

import { ZoomEditComposition, type IZoomEditWording } from '../../src/domain/zoom-edit-composition.js';

const wording: IZoomEditWording = {
  refine: () => ({ label: 'Cut label', adjective: 'cut adjective' }),
  loopify: () => ({ label: 'Loop label', adjective: 'loop adjective' }),
};

describe('ZoomEditComposition', () => {
  it('applies the staged edits in their order, the cut before the loop, whatever order they were staged in', () => {
    expect(ZoomEditComposition.of(['loopify', 'refine']).edits).toEqual(['refine', 'loopify']);
  });

  it('counts an edit staged twice once', () => {
    expect(ZoomEditComposition.of(['loopify', 'loopify']).edits).toEqual(['loopify']);
  });

  it('is empty when nothing is staged', () => {
    expect(ZoomEditComposition.of([]).isEmpty).toBe(true);
  });

  it.each([
    [['refine'], true],
    [['loopify'], false],
    [['refine', 'loopify'], false],
  ] as const)('with %j staged keeps the sound: %s', (edits, keepsAudio) => {
    expect(ZoomEditComposition.of(edits).keepsAudio).toBe(keepsAudio);
  });

  it.each([
    [['refine'], false],
    [['loopify'], true],
    [['refine', 'loopify'], true],
  ] as const)('with %j staged plays the frames backward after forward: %s', (edits, playsBackward) => {
    expect(ZoomEditComposition.of(edits).playsBackward).toBe(playsBackward);
  });

  it.each([
    [['refine'], 'movie-range'],
    [['loopify'], 'movie-only'],
    [['refine', 'loopify'], 'movie-only'],
  ] as const)('with %j staged keeps the source info %s', (edits, sourceInfo) => {
    expect(ZoomEditComposition.of(edits).sourceInfo).toBe(sourceInfo);
  });

  it.each([
    [['refine'], '-refined'],
    [['loopify'], '-looped'],
    [['loopify', 'refine'], '-refined-looped'],
  ] as const)('with %j staged names the saved clip with the suffix %s', (edits, suffix) => {
    expect(ZoomEditComposition.of(edits).filenameSuffix).toBe(suffix);
  });

  it('takes the words of the staged edits from the wording, in the order they apply', () => {
    expect(ZoomEditComposition.of(['loopify', 'refine']).wordsFrom(wording)).toEqual([
      { label: 'Cut label', adjective: 'cut adjective' }, { label: 'Loop label', adjective: 'loop adjective' },
    ]);
  });

  it.each([
    ['refine', { label: 'Cut label', adjective: 'cut adjective' }],
    ['loopify', { label: 'Loop label', adjective: 'loop adjective' }],
  ] as const)('takes the words of the %s edit on its own from the wording', (edit, words) => {
    expect(ZoomEditComposition.wordsOf(edit, wording)).toEqual(words);
  });

  it('refuses an edit it does not know', () => {
    expect(() => ZoomEditComposition.of(['speed' as 'refine'])).toThrow('Zoom edit is unknown.');
  });

  it('knows the name of every edit', () => {
    expect([...ZoomEditComposition.names()].sort()).toEqual(['loopify', 'refine']);
  });

  describe('refusing a staged range', () => {
    it.each([
      ['Refine of a range that does not change the clip', ['refine'], { changesRange: false, frameCount: 51 }, 'range-unchanged'],
      ['Refine of a changed range', ['refine'], { changesRange: true, frameCount: 41 }, null],
      ['Loopify of a single frame', ['loopify'], { changesRange: true, frameCount: 1 }, 'loop-needs-two-frames'],
      ['Loopify of two frames', ['loopify'], { changesRange: false, frameCount: 2 }, null],
    ] as const)('answers the refusal of %s: %s', (_case, edits, facts, refusal) => {
      expect(ZoomEditComposition.of(edits).refusal(facts)).toBe(refusal);
    });

    it('answers the refusal of the first edit that refuses, in the order they apply', () => {
      const edits = ZoomEditComposition.of(['loopify', 'refine']);

      expect(edits.refusal({ changesRange: false, frameCount: 1 })).toBe('range-unchanged');
    });

    it('answers a later edit’s refusal when the earlier edits accept the range', () => {
      const edits = ZoomEditComposition.of(['loopify', 'refine']);

      expect(edits.refusal({ changesRange: true, frameCount: 1 })).toBe('loop-needs-two-frames');
    });

    it('accepts any range when nothing is staged', () => {
      expect(ZoomEditComposition.of([]).refusal({ changesRange: false, frameCount: 1 })).toBeNull();
    });
  });
});
