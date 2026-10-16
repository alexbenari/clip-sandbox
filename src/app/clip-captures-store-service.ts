import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { ISourceFingerprint } from '../frame-review/model/source-fingerprint.js';
import type { ISavedRangeCaptureData } from '../domain/range-capture-model.js';

export type AttachedCaptures = Readonly<{ movieRef: string; fingerprint: ISourceFingerprint; data: ISavedRangeCaptureData }>;

export interface IClipCapturesStoreService {
  attach(sessionId: FrameReviewSessionId): Promise<AttachedCaptures>;
  save(movieRef: string, data: ISavedRangeCaptureData): Promise<void>;
}
