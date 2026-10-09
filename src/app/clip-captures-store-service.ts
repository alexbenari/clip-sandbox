import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { ISourceFingerprint } from '../frame-review/model/source-fingerprint.js';
import type { ISavedRangeCaptureData } from '../domain/range-capture-model.js';

export type AttachedCaptures =
  | Readonly<{ kind: 'attached'; movieRef: string; fingerprint: ISourceFingerprint; data: ISavedRangeCaptureData }>
  | Readonly<{ kind: 'stale'; movieRef: string | null; data: ISavedRangeCaptureData | null }>;

export interface IClipCapturesStoreService {
  attach(sessionId: FrameReviewSessionId, expectedFingerprint?: ISourceFingerprint): Promise<AttachedCaptures>;
  save(movieRef: string, data: ISavedRangeCaptureData): Promise<void>;
}
