// Compile-time contract: `npm run typecheck` fails if a rejected request below starts to type-check.
// This file is checked by tsc only; it contains no runtime test.
import type {
  FrameReviewCapturePoint,
  FrameReviewSourceHandle,
  IFrameReviewOpenRequest,
} from '../../src/frame-review/frame-review-api.js';

export function rejectedFrameReviewContracts(sourceHandle: FrameReviewSourceHandle): void {
  // @ts-expect-error Renderer open requests use an opaque source handle, never a host path.
  const hostPathRequest: IFrameReviewOpenRequest = { sourcePath: 'C:/movie.mp4', previewBounds: { maxWidth: 1, maxHeight: 1 } };
  void hostPathRequest;

  // @ts-expect-error Timestamp capture points cannot be supplied where canonical frame identity is required.
  const falseExact: FrameReviewCapturePoint = { kind: 'exact-frame', timestampUs: 12n };
  void falseExact;

  const accepted: IFrameReviewOpenRequest = { sourceHandle, previewBounds: { maxWidth: 960, maxHeight: 540 } };
  void accepted;
}
