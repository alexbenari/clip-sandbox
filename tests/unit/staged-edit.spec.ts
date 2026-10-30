import { describe, expect, it } from 'vitest';

import { StagedLoopify, StagedRefine } from '../../src/app/staged-edit.js';
import { RefineRange } from '../../src/domain/refine-range.js';

const CLIP_FRAMES = 48;

function stagedRange(start: number, end: number): RefineRange {
  const started = RefineRange.ofClip(CLIP_FRAMES).withStart(start);
  const ended = started.kind === 'changed' ? started.range.withEnd(end) : started;
  if (ended.kind !== 'changed') throw new Error('The test staged an unreachable range.');
  return ended.range;
}

describe('StagedRefine', () => {
  it('is not staged before the clip is ready', () => {
    const refine = new StagedRefine(() => null);

    expect([refine.isStaged, refine.stagedChanges()]).toEqual([false, []]);
  });

  it('is not staged while the range is the whole clip', () => {
    const refine = new StagedRefine(() => RefineRange.ofClip(CLIP_FRAMES));

    expect([refine.isStaged, refine.stagedChanges()]).toEqual([false, []]);
  });

  it('is staged once the range has a new start, which leaving would discard', () => {
    const range = stagedRange(6, CLIP_FRAMES - 1);
    const refine = new StagedRefine(() => range);

    expect([refine.isStaged, refine.stagedChanges()]).toEqual([true, ['start']]);
  });

  it('would discard both new ends', () => {
    const range = stagedRange(6, 40);
    const refine = new StagedRefine(() => range);

    expect(refine.stagedChanges()).toEqual(['start', 'end']);
  });

  it('follows the session’s current range', () => {
    let range = RefineRange.ofClip(CLIP_FRAMES);
    const refine = new StagedRefine(() => range);

    range = stagedRange(0, 40);

    expect([refine.isStaged, refine.stagedChanges()]).toEqual([true, ['end']]);
  });
});

describe('StagedLoopify', () => {
  it('is staged from the start when the mode is entered for Loopify, which leaving would discard', () => {
    const loopify = new StagedLoopify(true);

    expect([loopify.isStaged, loopify.stagedChanges()]).toEqual([true, ['loopify']]);
  });

  it('is not staged when the mode is entered for Refine', () => {
    const loopify = new StagedLoopify(false);

    expect([loopify.isStaged, loopify.stagedChanges()]).toEqual([false, []]);
  });

  it('is staged and dropped again by toggling it', () => {
    const loopify = new StagedLoopify(false);

    loopify.toggle();
    const staged = loopify.isStaged;
    loopify.toggle();

    expect([staged, loopify.isStaged]).toEqual([true, false]);
  });
});
