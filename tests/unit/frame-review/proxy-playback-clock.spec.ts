import { describe, expect, it } from 'vitest';

import { ProxyPlaybackClock } from '../../../src/frame-review/host/proxy-playback-clock.js';
import type { IProxyFrameTimeline } from '../../../src/frame-review/host/proxy-frame-timeline-cache.js';

function timeline(pts: readonly bigint[], denominator = 60_000n): IProxyFrameTimeline {
  return Object.freeze({ cacheKey: 'a'.repeat(64), pts, timebaseNumerator: 1n,
    timebaseDenominator: denominator, durationPts: null });
}

describe('proxy playback clock', () => {
  it('converts variable PTS without assuming a fixed frame rate', () => {
    const clock = new ProxyPlaybackClock(timeline([0n, 2_500n, 7_500n, 10_000n]));
    expect(clock.at(0)).toBe(0n);
    expect(clock.at(1)).toBe(41_667n);
    expect(clock.at(2)).toBe(125_000n);
    expect(clock.atOrBefore(124_999n)).toBe(1);
    expect(clock.atOrBefore(125_000n)).toBe(2);
    expect(clock.loop(1, 2)).toMatchObject({ startUs: 41_666n, endUs: 125_000n,
      bUs: 145_833n, nextUs: 166_667n });
  });

  it('rejects a collapsed B interval and invalid ordinals before arming playback', () => {
    const short = new ProxyPlaybackClock(timeline([0n, 2_500n, 2_501n, 5_000n]));
    expect(() => short.loop(0, 1)).toThrow('Loop interval is too short');
    expect(() => short.loop(1, 1)).toThrow('Loop Start must precede End');
    expect(() => short.loop(-1, 2)).toThrow('Frame ordinal is outside the proxy');
    expect(() => new ProxyPlaybackClock(timeline([1n, 2_501n, 5_001n])))
      .toThrow('unsupported playback-clock origin');
  });
});
