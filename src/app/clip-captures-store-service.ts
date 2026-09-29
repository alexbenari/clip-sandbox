import type { IFrameReviewSourceSelection, FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { ISourceFingerprint } from '../frame-review/model/source-fingerprint.js';
import type { ISavedRangeCaptureData } from '../domain/range-capture-model.js';

export type LastSavedMovie =
  | Readonly<{ kind: 'available'; selection: IFrameReviewSourceSelection; expectedFingerprint: ISourceFingerprint }>
  | Readonly<{ kind: 'unavailable'; name: string; movieRef: string; data: ISavedRangeCaptureData }>;

export type AttachedCaptures =
  | Readonly<{ kind: 'attached'; movieRef: string; fingerprint: ISourceFingerprint; data: ISavedRangeCaptureData }>
  | Readonly<{ kind: 'stale'; movieRef: string | null; data: ISavedRangeCaptureData | null }>;

export interface IClipCapturesStoreService {
  last(): Promise<LastSavedMovie | null>;
  attach(sessionId: FrameReviewSessionId, expectedFingerprint?: ISourceFingerprint): Promise<AttachedCaptures>;
  save(movieRef: string, data: ISavedRangeCaptureData): Promise<void>;
}
