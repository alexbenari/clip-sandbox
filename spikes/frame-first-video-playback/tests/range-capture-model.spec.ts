import { describe, expect, it } from 'vitest';

import { RangeCaptureModel } from '../src/host/range-capture-model';

describe('RangeCaptureModel', () => {
  it('locks a valid range', () => {
    const model = new RangeCaptureModel();

    model.markStart({
      frameIndex: 10,
      timestampMs: 1_000,
      durationMs: 40,
      keyframe: true,
    });
    model.markEnd({
      frameIndex: 20,
      timestampMs: 2_000,
      durationMs: 40,
      keyframe: false,
    });

    const lockedRange = model.lockRange('candidate-a');
    const snapshot = model.getSnapshot();

    expect(lockedRange).not.toBeNull();
    expect(snapshot.ranges).toHaveLength(1);
    expect(snapshot.draft.error).toBeNull();
  });

  it('rejects an invalid range where end is before start', () => {
    const model = new RangeCaptureModel();

    model.markStart({
      frameIndex: 30,
      timestampMs: 3_000,
      durationMs: 40,
      keyframe: false,
    });
    model.markEnd({
      frameIndex: 20,
      timestampMs: 2_000,
      durationMs: 40,
      keyframe: false,
    });

    const lockedRange = model.lockRange('candidate-b');
    const snapshot = model.getSnapshot();

    expect(lockedRange).toBeNull();
    expect(snapshot.ranges).toHaveLength(0);
    expect(snapshot.draft.error).toContain('End frame');
  });
});
