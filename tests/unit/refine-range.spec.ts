import { describe, expect, it } from 'vitest';

import { RefineRange, type RefineRangeChange } from '../../src/domain/refine-range.js';

// A 120-frame clip: frames 0 to 119.
const clip = () => RefineRange.ofClip(120);

function changed(change: RefineRangeChange): RefineRange {
  if (change.kind !== 'changed') throw new Error(`Expected a change, got ${change.reason}`);
  return change.range;
}

describe('RefineRange', () => {
  it('starts as the whole clip, unchanged', () => {
    const range = clip();

    expect([range.start, range.end, range.isChanged]).toEqual([0, 119, false]);
  });

  it('trims the clip at both ends', () => {
    const range = changed(changed(clip().withStart(12)).withEnd(80));

    expect([range.start, range.end, range.isChanged, range.extendsClip]).toEqual([12, 80, true, false]);
  });

  it('refuses a start after the staged end', () => {
    const range = changed(clip().withEnd(40));

    expect(range.withStart(41)).toEqual({ kind: 'refused', reason: 'start-after-end' });
  });

  it('refuses an end before the staged start', () => {
    const range = changed(clip().withStart(40));

    expect(range.withEnd(39)).toEqual({ kind: 'refused', reason: 'end-before-start' });
  });

  it('keeps a one-frame range', () => {
    const range = changed(changed(clip().withStart(40)).withEnd(40));

    expect([range.start, range.end]).toEqual([40, 40]);
  });

  it('refuses frames outside the clip until the movie extends it', () => {
    expect([clip().unreachableReason(-1), clip().unreachableReason(120), clip().withStart(-1), clip().withEnd(120)]).toEqual([
      'outside-clip', 'outside-clip',
      { kind: 'refused', reason: 'outside-clip' }, { kind: 'refused', reason: 'outside-clip' },
    ]);
  });

  it('extends the clip up to its extension limits once the movie is ready', () => {
    const range = changed(changed(clip().withExtension(-1440, 1559).withStart(-1440)).withEnd(1559));

    expect([range.start, range.end, range.extendsClip]).toEqual([-1440, 1559, true]);
  });

  it('refuses frames beyond the extension limits', () => {
    const extended = clip().withExtension(-1440, 1559);

    expect([extended.withStart(-1441), extended.withEnd(1560)]).toEqual([
      { kind: 'refused', reason: 'beyond-extension' }, { kind: 'refused', reason: 'beyond-extension' },
    ]);
  });

  it('brings a frame outside the clip back to the clip\'s nearest end', () => {
    expect([clip().nearestReachable(-30), clip().nearestReachable(57), clip().nearestReachable(400)]).toEqual([0, 57, 119]);
  });

  it('brings a frame beyond the extension limits back to the nearest limit', () => {
    const extended = clip().withExtension(-1440, 1559);

    expect([extended.nearestReachable(-2000), extended.nearestReachable(-700), extended.nearestReachable(1600)])
      .toEqual([-1440, -700, 1559]);
  });

  it('keeps the staged range when the movie extends the clip', () => {
    const extended = changed(changed(clip().withStart(5)).withEnd(90)).withExtension(-1440, 1559);

    expect([extended.start, extended.end]).toEqual([5, 90]);
  });

  it('refuses extension limits that do not include the clip', () => {
    expect(() => clip().withExtension(3, 1559)).toThrow('Extension limits must include the clip and the staged range.');
  });

  it('names no changed end while the range is the whole clip', () => {
    expect(clip().changedEnds()).toEqual([]);
  });

  it('names each changed end with its frame, including an end moved into the movie', () => {
    const range = changed(changed(clip().withExtension(-50, 170).withStart(12)).withEnd(140));

    expect(range.changedEnds()).toEqual([{ endpoint: 'start', frameIndex: 12 }, { endpoint: 'end', frameIndex: 140 }]);
  });

  it('names only the end that changed', () => {
    expect(changed(clip().withEnd(80)).changedEnds()).toEqual([{ endpoint: 'end', frameIndex: 80 }]);
  });
});
