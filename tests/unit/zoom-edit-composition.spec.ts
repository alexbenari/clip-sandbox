import { describe, expect, it } from 'vitest';

import { ZoomEditComposition } from '../../src/domain/zoom-edit-composition.js';

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

  it('refuses an edit it does not know', () => {
    expect(() => ZoomEditComposition.of(['speed' as 'refine'])).toThrow('Zoom edit is unknown.');
  });
});
