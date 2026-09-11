import { describe, expect, it } from 'vitest';

import { RangeCaptureModel } from '../../src/model/range-capture-model.js';
import type { ISourceFrameIdentity } from '../../src/model/source-frame-identity.js';

describe('range capture model', () => {
  it('rejects locking a missing or reversed range without losing the draft', () => {
    const model = new RangeCaptureModel();
    model.markStart(frame(20));

    expect(model.toggleLock()).toEqual({ locked: false, error: 'Mark an end frame before locking.' });

    model.markEnd(frame(10));
    expect(model.toggleLock()).toEqual({ locked: false, error: 'The end frame must not precede the start frame.' });
    expect(model.snapshot.draft.start?.frameIndex).toBe(20);
    expect(model.snapshot.draft.end?.frameIndex).toBe(10);
  });

  it('locks and immediately unlocks the current choices when a is pressed twice', () => {
    const model = new RangeCaptureModel();
    model.markStart(frame(10));
    model.markEnd(frame(20));

    expect(model.toggleLock()).toEqual({ locked: true, error: null });
    expect(model.snapshot.draft.locked).toBe(true);
    expect(model.toggleLock()).toEqual({ locked: false, error: null });
    expect(model.snapshot.draft).toMatchObject({ locked: false, start: frame(10), end: frame(20) });
    expect(model.snapshot.ranges).toEqual([]);
  });

  it('moves a locked range to captured ranges when the next endpoint is marked', () => {
    const model = new RangeCaptureModel();
    model.markStart(frame(10));
    model.markEnd(frame(20));
    model.toggleLock();

    model.markStart(frame(30));

    expect(model.snapshot.ranges).toHaveLength(1);
    expect(model.snapshot.ranges[0]).toMatchObject({ start: frame(10), end: frame(20) });
    expect(model.snapshot.draft).toMatchObject({ start: frame(30), end: null, locked: false });
  });

  it('includes a still-current locked range in the exportable range list', () => {
    const model = new RangeCaptureModel();
    model.markStart(frame(4));
    model.markEnd(frame(8));
    model.toggleLock();

    expect(model.exportableRanges()).toEqual([{ start: frame(4), end: frame(8) }]);
  });
});

function frame(frameIndex: number): ISourceFrameIdentity {
  return Object.freeze({
    frameIndex,
    originalFrameIndex: frameIndex,
    pts: BigInt(frameIndex * 40),
    duration: 40n,
    timebaseNumerator: 1n,
    timebaseDenominator: 1_000n,
    frameInfoPts: BigInt(frameIndex * 40),
    frameInfoHash: `frame-${frameIndex}`,
  });
}
