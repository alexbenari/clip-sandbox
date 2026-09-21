import { describe, expect, it } from 'vitest';

import { CaptureEndpointValue } from '../../src/domain/capture-endpoint.js';
import { RangeCaptureModel } from '../../src/domain/range-capture-model.js';

const identity = (frameIndex: number) => Object.freeze({
  frameIndex,
  originalFrameIndex: frameIndex,
  pts: BigInt(frameIndex * 1_000),
  duration: 1_000n,
  timebaseNumerator: 1n,
  timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex * 1_000),
  frameInfoHash: `frame-${frameIndex}`,
});

describe('RangeCaptureModel', () => {
  it('replaces draft endpoints before A and locks an inclusive exact range', () => {
    const model = new RangeCaptureModel(4);
    model.markStart(CaptureEndpointValue.exact(identity(10), 100_000n, 4));
    model.markStart(CaptureEndpointValue.exact(identity(12), 120_000n, 4));
    model.markEnd(CaptureEndpointValue.exact(identity(12), 120_000n, 4));

    const result = model.lockRange();

    expect(result).toMatchObject({ kind: 'locked', range: { kind: 'ready-to-extract' } });
    expect(model.snapshot.ranges).toEqual([
      expect.objectContaining({
        kind: 'ready-to-extract',
        start: expect.objectContaining({ kind: 'exact-frame', identity: expect.objectContaining({ frameIndex: 12 }) }),
        end: expect.objectContaining({ kind: 'exact-frame', identity: expect.objectContaining({ frameIndex: 12 }) }),
      }),
    ]);
  });

  it.each([
    ['exact then timestamp', CaptureEndpointValue.exact(identity(10), 100_000n, 7), CaptureEndpointValue.timestamp(200_000n, 7)],
    ['timestamp then exact', CaptureEndpointValue.timestamp(100_000n, 7), CaptureEndpointValue.exact(identity(20), 200_000n, 7)],
    ['two timestamps', CaptureEndpointValue.timestamp(100_000n, 7), CaptureEndpointValue.timestamp(200_000n, 7)],
  ])('derives Needs exact frames for %s', (_label, start, end) => {
    const model = new RangeCaptureModel(7);
    model.markStart(start);
    model.markEnd(end);

    expect(model.lockRange()).toMatchObject({ kind: 'locked', range: { kind: 'needs-exact-frames' } });
  });

  it('keeps the locked range immutable, ignores W, and starts a new draft on the next Q', () => {
    const model = new RangeCaptureModel(2);
    model.markStart(CaptureEndpointValue.timestamp(100_000n, 2));
    model.markEnd(CaptureEndpointValue.timestamp(200_000n, 2));
    const locked = model.lockRange();
    expect(locked.kind).toBe('locked');

    expect(model.markEnd(CaptureEndpointValue.timestamp(300_000n, 2))).toEqual({
      kind: 'rejected', message: 'Press Q to begin a new range.',
    });
    model.markStart(CaptureEndpointValue.timestamp(400_000n, 2));

    expect(model.snapshot.ranges).toHaveLength(1);
    expect(model.snapshot.capture).toMatchObject({ kind: 'draft', start: { timestampUs: 400_000n }, end: null });
  });

  it('rejects missing, reversed, and stale-generation endpoints without creating a range', () => {
    const model = new RangeCaptureModel(9);
    expect(model.lockRange()).toEqual({ kind: 'rejected', message: 'Mark a start and end before locking.' });
    expect(() => model.markStart(CaptureEndpointValue.timestamp(1n, 8))).toThrow('source generation');
    model.markStart(CaptureEndpointValue.timestamp(200n, 9));
    model.markEnd(CaptureEndpointValue.timestamp(100n, 9));
    expect(model.lockRange()).toEqual({ kind: 'rejected', message: 'The end must not precede the start.' });
    expect(model.snapshot.ranges).toHaveLength(0);
  });
});
