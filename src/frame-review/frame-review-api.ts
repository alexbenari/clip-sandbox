import type { AdjacentDirection } from './adjacent-step-scheduler.js';
import type { IFrameReviewState } from './model/frame-review-state.js';
import type { ISourceFrameIdentity } from './model/source-frame-identity.js';

declare const frameReviewSourceHandleBrand: unique symbol;
declare const frameReviewSessionIdBrand: unique symbol;

export type FrameReviewSourceHandle = string & { readonly [frameReviewSourceHandleBrand]: true };
export type FrameReviewSessionId = string & { readonly [frameReviewSessionIdBrand]: true };

export interface IFrameReviewOpenRequest {
  readonly sourceHandle: FrameReviewSourceHandle;
  readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
}

export interface IFrameReviewSourceSelection {
  readonly name: string;
  readonly sourceHandle: FrameReviewSourceHandle;
}

export interface IExactDisplayFrame {
  readonly kind: 'exact-frame';
  readonly identity: ISourceFrameIdentity;
  readonly reviewTimeUs: bigint;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly pixels: Blob;
}

export interface IPlaybackDisplayFrame {
  readonly kind: 'playback-frame';
  readonly playbackTimestampUs: bigint;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly pixels: Blob;
}

export type FrameReviewDisplayFrame = IExactDisplayFrame | IPlaybackDisplayFrame;

export type FrameReviewCapturePoint =
  | Readonly<{ kind: 'exact-frame'; identity: ISourceFrameIdentity }>
  | Readonly<{ kind: 'playback-timestamp'; timestampUs: bigint }>;

export type FrameReviewEvent =
  | Readonly<{ type: 'state'; state: IFrameReviewState }>
  | Readonly<{ type: 'display-frame'; frame: FrameReviewDisplayFrame }>
  | Readonly<{ type: 'error'; category: string; message: string; recoverable: boolean }>;

export interface IFrameReviewSession {
  readonly id: FrameReviewSessionId;
  state(): IFrameReviewState;
  play(): Promise<void>;
  pause(): Promise<void>;
  setRate(rate: number): Promise<void>;
  seekPlayback(timestampUs: bigint): Promise<void>;
  enterFrameScrub(): Promise<IExactDisplayFrame>;
  scrubToFrame(frameIndex: number): Promise<IExactDisplayFrame>;
  stepAdjacent(direction: AdjacentDirection): Promise<IExactDisplayFrame>;
  pressAdjacent(direction: AdjacentDirection): Promise<void>;
  releaseAdjacent(direction?: AdjacentDirection): Promise<void>;
  captureCurrentPoint(): Promise<FrameReviewCapturePoint>;
  subscribe(listener: (event: FrameReviewEvent) => void): () => void;
  dispose(): Promise<void>;
}

export interface IFrameReviewService {
  chooseSource(): Promise<IFrameReviewSourceSelection | null>;
  open(request: IFrameReviewOpenRequest): Promise<IFrameReviewSession>;
}

export class FrameReviewOpaqueId {
  static sourceHandle(value: unknown): FrameReviewSourceHandle {
    return this.parse(value, 'source handle') as FrameReviewSourceHandle;
  }

  static sessionId(value: unknown): FrameReviewSessionId {
    return this.parse(value, 'session id') as FrameReviewSessionId;
  }

  private static parse(value: unknown, label: string): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(value)) {
      throw new Error(`Frame-review ${label} is invalid.`);
    }
    return value;
  }
}
