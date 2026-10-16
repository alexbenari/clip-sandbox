import { describe, expect, it } from 'vitest';

import { CaptureEndpoints } from '../../src/domain/capture-endpoint.js';

const identity = Object.freeze({
  frameIndex: 12, originalFrameIndex: 12, pts: 12_000n, duration: 1_000n,
  timebaseNumerator: 1n, timebaseDenominator: 1_000n, frameInfoPts: 12_000n, frameInfoHash: '000000000000000c',
});

describe('CaptureEndpoints', () => {
  it('reads the frame and hash of exact and saved exact endpoints alike', () => {
    const exact = CaptureEndpoints.exact(identity, 12_000n, 1);
    const saved = CaptureEndpoints.savedExact(12, '000000000000000c', 12_000n, 1);

    expect([CaptureEndpoints.frameIndexOf(exact), CaptureEndpoints.frameHashOf(exact)]).toEqual([12, '000000000000000c']);
    expect([CaptureEndpoints.frameIndexOf(saved), CaptureEndpoints.frameHashOf(saved)]).toEqual([12, '000000000000000c']);
    expect([CaptureEndpoints.isFrame(exact), CaptureEndpoints.isFrame(saved)]).toEqual([true, true]);
  });

  it('has no frame for a playback timestamp', () => {
    const timestamp = CaptureEndpoints.timestamp(12_000n, 1);

    expect(CaptureEndpoints.isFrame(timestamp)).toBe(false);
    expect(CaptureEndpoints.frameIndexOf(timestamp)).toBeNull();
    expect(CaptureEndpoints.frameHashOf(timestamp)).toBeNull();
  });
});
