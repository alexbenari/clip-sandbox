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

export interface ISavedExactFrameEndpoint {
  readonly kind: 'saved-exact-frame';
  readonly frameIndex: number;
  readonly frameInfoHash: string;
  readonly reviewTimeUs: bigint;
  readonly sourceGeneration: number;
}

export type CaptureEndpoint = IExactFrameEndpoint | IPlaybackTimestampEndpoint | ISavedExactFrameEndpoint;

// An endpoint that names a canonical frame: exact now, or exact when it was saved.
export type FrameEndpoint = IExactFrameEndpoint | ISavedExactFrameEndpoint;

export class CaptureEndpoints {
  static isFrame(endpoint: CaptureEndpoint | null | undefined): endpoint is FrameEndpoint {
    return endpoint?.kind === 'exact-frame' || endpoint?.kind === 'saved-exact-frame';
  }

  // The canonical frame an endpoint names; null for a playback timestamp.
  static frameIndexOf(endpoint: FrameEndpoint): number;
  static frameIndexOf(endpoint: CaptureEndpoint): number | null;
  static frameIndexOf(endpoint: CaptureEndpoint): number | null {
    if (endpoint.kind === 'exact-frame') return endpoint.identity.frameIndex;
    return endpoint.kind === 'saved-exact-frame' ? endpoint.frameIndex : null;
  }

  static frameHashOf(endpoint: FrameEndpoint): string;
  static frameHashOf(endpoint: CaptureEndpoint): string | null;
  static frameHashOf(endpoint: CaptureEndpoint): string | null {
    if (endpoint.kind === 'exact-frame') return endpoint.identity.frameInfoHash;
    return endpoint.kind === 'saved-exact-frame' ? endpoint.frameInfoHash : null;
  }

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

  static savedExact(frameIndex: number, frameInfoHash: string, reviewTimeUs: bigint, sourceGeneration: number): ISavedExactFrameEndpoint {
    this.assertGeneration(sourceGeneration);
    this.assertTimestamp(reviewTimeUs, 'Saved exact-frame review time');
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || !/^[a-f0-9]{16}$/.test(frameInfoHash)) {
      throw new Error('Saved exact-frame identity is invalid.');
    }
    return Object.freeze({ kind: 'saved-exact-frame', frameIndex, frameInfoHash, reviewTimeUs, sourceGeneration });
  }

  static positionUs(endpoint: CaptureEndpoint): bigint {
    return endpoint.kind === 'playback-timestamp' ? endpoint.timestampUs : endpoint.reviewTimeUs;
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
