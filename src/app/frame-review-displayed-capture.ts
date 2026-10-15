import type { FrameReviewCapturePoint, FrameReviewDisplayFrame } from '../frame-review/frame-review-api.js';

// The frame the movie player is showing, captured when the user marks an endpoint.
export interface IFrameReviewDisplayedCapture {
  readonly point: FrameReviewCapturePoint;
  readonly positionUs: bigint;
  readonly sourceGeneration: number;
  readonly thumbnail: FrameReviewDisplayFrame;
}
