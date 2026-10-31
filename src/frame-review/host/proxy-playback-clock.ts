import { BackendError } from '../model/backend-error.js';
import type { IProxyFrameTimeline } from './proxy-frame-timeline-cache.js';

export interface IProxyLoopTimes {
  readonly startUs: bigint;
  readonly endUs: bigint;
  readonly nextUs: bigint;
  readonly bUs: bigint;
}

// The pinned proxy profile rebases its first video PTS to zero.
export class ProxyPlaybackClock {
  private readonly firstPts: bigint;

  constructor(private readonly timeline: IProxyFrameTimeline) {
    if (timeline.pts.length < 2) throw new BackendError('invalid-state', 'Loop timeline has too few frames.', true);
    this.firstPts = timeline.pts[0];
    if (this.firstPts !== 0n) {
      throw new BackendError('invalid-state', 'This proxy has an unsupported playback-clock origin.', true);
    }
  }

  frameCount(): number { return this.timeline.pts.length; }

  at(frameIndex: number): bigint {
    this.requireFrame(frameIndex);
    return this.toPlayerTime(this.timeline.pts[frameIndex]);
  }

  loop(startFrameIndex: number, endFrameIndex: number): IProxyLoopTimes {
    this.requireFrame(startFrameIndex);
    this.requireFrame(endFrameIndex);
    if (startFrameIndex >= endFrameIndex) {
      throw new BackendError('invalid-request', 'Loop Start must precede End.', true);
    }
    const endPts = this.timeline.pts[endFrameIndex];
    const nextPts = this.timeline.pts[endFrameIndex + 1]
      ?? this.timeline.durationPts
      ?? endPts + (endPts - this.timeline.pts[endFrameIndex - 1]);
    const gap = nextPts - endPts;
    if (gap < 3n) throw new BackendError('frame-boundary', 'Loop interval is too short.', true);
    const bPts = endPts + this.round(gap, 2n);
    if (bPts <= endPts || bPts >= nextPts) {
      throw new BackendError('frame-boundary', 'Loop interval is too short.', true);
    }
    const startUs = this.at(startFrameIndex) - (startFrameIndex > 0 ? 1n : 0n);
    const endUs = this.toPlayerTime(endPts);
    const nextUs = this.toPlayerTime(nextPts);
    const bUs = this.toPlayerTime(bPts);
    if (!(startUs < endUs && endUs < bUs && bUs < nextUs)) {
      throw new BackendError('frame-boundary', 'Loop interval is too short in player time.', true);
    }
    return Object.freeze({ startUs, endUs, nextUs, bUs });
  }

  atOrBefore(playerTimeUs: bigint): number {
    let low = 0;
    let high = this.timeline.pts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.at(middle) <= playerTimeUs) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  private toPlayerTime(pts: bigint): bigint {
    const offset = pts - this.firstPts;
    if (offset < 0n) throw new BackendError('invalid-state', 'Proxy time precedes its first frame.', true);
    const timeUs = this.round(offset * this.timeline.timebaseNumerator * 1_000_000n,
      this.timeline.timebaseDenominator);
    if (timeUs > (1n << 63n) - 1n) {
      throw new BackendError('invalid-state', 'Proxy time exceeds the player time range.', true);
    }
    return timeUs;
  }

  private round(numerator: bigint, denominator: bigint): bigint {
    return (numerator + denominator / 2n) / denominator;
  }

  private requireFrame(frameIndex: number): void {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= this.timeline.pts.length) {
      throw new BackendError('invalid-request', 'Frame ordinal is outside the proxy.', true);
    }
  }
}
