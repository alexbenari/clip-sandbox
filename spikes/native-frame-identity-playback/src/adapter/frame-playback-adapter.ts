import type { MediaStatus } from '../model/media-status.js';
import type { SourceFrameIdentity } from '../model/source-frame-identity.js';

export interface DisplayFrame {
  readonly identity: SourceFrameIdentity;
  readonly reviewTimeUs: bigint;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly stride: number;
  readonly pixelFormat: 'RGBA8888';
  readonly pixels: Uint8Array;
  readonly timings: Readonly<Record<string, number>>;
}

export interface PreviewBounds {
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export interface PreparedSource {
  readonly playbackSourcePath?: string;
  readonly fallbackPlaybackSourcePath?: string;
  readonly reviewAssetPath: string;
  readonly indexPath: string;
  readonly identitySource?: {
    readonly reviewAssetPath: string;
    readonly indexPath: string;
  };
  readonly previewBounds?: PreviewBounds;
}

export interface PlaybackDisplayFrame {
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly playbackTimestampUs: bigint;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly stride: number;
  readonly pixelFormat: 'RGBA8888';
  readonly pixels: Uint8Array;
  readonly droppedBeforeWrite: number;
  readonly hostReceivedAtMs: number;
}

export interface FramePlaybackAdapter {
  open(source: PreparedSource): Promise<MediaStatus>;
  close(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setRate(rate: number): Promise<void>;
  getExactFrame(frameIndex: number): Promise<DisplayFrame>;
  scrubToFrame(frameIndex: number): Promise<DisplayFrame>;
  stepAdjacent(direction: -1 | 1): Promise<DisplayFrame>;
  status(): Promise<MediaStatus>;
  shutdown(): Promise<void>;
}

export function previewBoundsFields(bounds: PreviewBounds | undefined): Readonly<Record<string, number>> {
  if (!bounds) return Object.freeze({});
  for (const [label, value] of [['maxWidth', bounds.maxWidth], ['maxHeight', bounds.maxHeight]] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) {
      throw new Error(`${label} must be an integer between 1 and 16384.`);
    }
  }
  if (bounds.maxWidth * bounds.maxHeight * 4 > 256 * 1024 * 1024) {
    throw new Error('Preview bounds exceed the native bridge payload limit.');
  }
  return Object.freeze({ maxPreviewWidth: bounds.maxWidth, maxPreviewHeight: bounds.maxHeight });
}
