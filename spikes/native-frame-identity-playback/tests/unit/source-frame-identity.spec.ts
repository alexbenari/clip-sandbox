import { describe, expect, it } from 'vitest';

import { sourceFrameIdentityFromWire } from '../../src/model/source-frame-identity.js';

describe('source frame identity', () => {
  it('round-trips decimal timestamps beyond JavaScript number precision', () => {
    const identity = sourceFrameIdentityFromWire({
      frameIndex: 12,
      originalFrameIndex: 12,
      pts: '900719925474099312345',
      duration: '1001',
      timebaseNumerator: '1',
      timebaseDenominator: '90000',
      frameInfoPts: '900719925474099312345',
      frameInfoHash: 'abc123',
    });

    expect(identity.pts).toBe(900719925474099312345n);
    expect(identity.timebaseDenominator).toBe(90000n);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it('rejects a floating-point timestamp identity', () => {
    expect(() => sourceFrameIdentityFromWire({
      frameIndex: 1,
      originalFrameIndex: 1,
      pts: 1.5,
      duration: '1',
      timebaseNumerator: '1',
      timebaseDenominator: '25',
      frameInfoPts: '1',
      frameInfoHash: 'abc',
    })).toThrow('decimal integer string');
  });
});
