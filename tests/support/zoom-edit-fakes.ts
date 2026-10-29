import { vi } from 'vitest';

import type {
  IZoomEditClipRequest,
  IZoomEditWindowRequest,
  ZoomEditAnchorAnswer,
  ZoomEditWindowAnswer,
} from '../../src/app/zoom-edit-source-service.js';
import {
  FrameReviewOpaqueId,
  type FrameReviewEvent,
  type FrameReviewSourceHandle,
  type IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState, type IFrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { deferred, type Deferred } from './deferred.js';

export const windowHandle = (step: number) => FrameReviewOpaqueId.sourceHandle(`source_window_00000${step}`);

// A review at 24 frames a second whose readiness the test drives.
export class FakeReview {
  private listener: ((event: FrameReviewEvent) => void) | undefined;
  private current: IFrameReviewState = FrameReviewState.create('playback-ready', 1, { playbackDurationUs: 1_000_000n });
  readonly dispose = vi.fn(async () => undefined);
  readonly session: IFrameReviewSession;

  constructor(id: string, private readonly frameCount: number) {
    this.session = {
      id: FrameReviewOpaqueId.sessionId(id),
      state: () => this.current,
      subscribe: (listener: (event: FrameReviewEvent) => void) => { this.listener = listener; return () => { this.listener = undefined; }; },
      dispose: this.dispose,
    } as unknown as IFrameReviewSession;
  }

  becomeExactReady(): void {
    this.current = FrameReviewState.create('exact-ready', 1, {
      playbackDurationUs: BigInt(this.frameCount) * 1_000_000n / 24n,
      preparedReview: Object.freeze({
        cacheKey: 'a'.repeat(64), cacheHit: false, frameCount: this.frameCount, sourceWidth: 640, sourceHeight: 360,
        durationUs: BigInt(this.frameCount) * 1_000_000n / 24n,
      }),
    });
    this.listener?.({ type: 'state', state: this.current });
  }

  fail(): void {
    this.current = FrameReviewState.create('failed', 1, { message: 'Exact frames are unavailable.' });
    this.listener?.({ type: 'state', state: this.current });
  }
}

// Zoom edit source requests whose window and anchor answers the test gives one by one.
export function fakeZoomEditSources(clipHandle: FrameReviewSourceHandle, clipOpening: Deferred<FrameReviewSourceHandle> | null = null) {
  const windowAnswers: Deferred<ZoomEditWindowAnswer>[] = [];
  const anchorAnswers: Deferred<ZoomEditAnchorAnswer>[] = [];
  const sources = {
    openClip: vi.fn((_request: IZoomEditClipRequest) => clipOpening?.promise ?? Promise.resolve(clipHandle)),
    openWindow: vi.fn((_request: IZoomEditWindowRequest) => {
      const answer = deferred<ZoomEditWindowAnswer>();
      windowAnswers.push(answer);
      return answer.promise;
    }),
    anchorWindow: vi.fn(() => {
      const answer = deferred<ZoomEditAnchorAnswer>();
      anchorAnswers.push(answer);
      return answer.promise;
    }),
  };
  return { sources, windowAnswers, anchorAnswers };
}
