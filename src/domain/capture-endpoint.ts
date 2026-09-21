import type { ISourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';

export interface IExactFrameEndpoint {
  readonly kind: 'exact-frame';
  readonly identity: ISourceFrameIdentity;
  readonly reviewTimeUs: bigint;
  readonly sourceGeneration: number;
}

export interface IPlaybackTimestampEndpoint {
  readonly kind: 'playback-timestamp';
  readonly timestampUs: bigint;
  readonly sourceGeneration: number;
}

export type CaptureEndpoint = IExactFrameEndpoint | IPlaybackTimestampEndpoint;

export class CaptureEndpointValue {
  static exact(
    identity: ISourceFrameIdentity,
    reviewTimeUs: bigint,
    sourceGeneration: number,
  ): IExactFrameEndpoint {
    this.assertGeneration(sourceGeneration);
    this.assertTimestamp(reviewTimeUs, 'Exact-frame review time');
    if (!Number.isSafeInteger(identity.frameIndex) || identity.frameIndex < 0) {
      throw new Error('Exact-frame identity has an invalid canonical ordinal.');
    }
    return Object.freeze({ kind: 'exact-frame', identity, reviewTimeUs, sourceGeneration });
  }

  static timestamp(timestampUs: bigint, sourceGeneration: number): IPlaybackTimestampEndpoint {
    this.assertGeneration(sourceGeneration);
    this.assertTimestamp(timestampUs, 'Playback timestamp');
    return Object.freeze({ kind: 'playback-timestamp', timestampUs, sourceGeneration });
  }

  static positionUs(endpoint: CaptureEndpoint): bigint {
    return endpoint.kind === 'exact-frame' ? endpoint.reviewTimeUs : endpoint.timestampUs;
  }

  private static assertGeneration(sourceGeneration: number): void {
    if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 1) {
      throw new Error('Capture endpoint source generation must be a positive safe integer.');
    }
  }

  private static assertTimestamp(value: bigint, label: string): void {
    if (typeof value !== 'bigint' || value < 0n) throw new Error(`${label} must not be negative.`);
  }
}
