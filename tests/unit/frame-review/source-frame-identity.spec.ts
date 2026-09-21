import { describe, expect, it } from 'vitest';

import { SourceFrameIdentity } from '../../../src/frame-review/model/source-frame-identity.js';

describe('source frame identity', () => {
  it('keeps canonical timestamps outside floating-point conversion', () => {
    const identity = SourceFrameIdentity.fromWire({
      frameIndex: 42,
      originalFrameIndex: 42,
      pts: '9007199254740993',
      duration: '1001',
      timebaseNumerator: '1',
      timebaseDenominator: '90000',
      frameInfoPts: '9007199254740993',
      frameInfoHash: 'ab12',
    });

    expect(identity.pts).toBe(9007199254740993n);
    expect(SourceFrameIdentity.timeUs(identity)).toBe(100079991719344366n);
  });

  it('rejects floating-point wire timestamps', () => {
    expect(() => SourceFrameIdentity.fromWire({
      frameIndex: 0,
      originalFrameIndex: 0,
      pts: 1,
      duration: '1',
      timebaseNumerator: '1',
      timebaseDenominator: '24',
      frameInfoPts: '1',
      frameInfoHash: 'hash',
    })).toThrow(/pts must be a decimal integer string/i);
  });
});
