import { vi } from 'vitest';

import type { IFrameReviewSession } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { FrameReviewPlayerControl } from '../../src/ui/frame-review-player-control.js';

export function moviePlayer(): FrameReviewPlayerControl {
  return new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
}

// A review that plays but is not yet ready for exact frames, as a freshly opened clip is.
export function playingReview(): { session: IFrameReviewSession; jumpPlaybackBy: ReturnType<typeof vi.fn> } {
  const jumpPlaybackBy = vi.fn(async (deltaUs: bigint) => deltaUs);
  const session = {
    id: 'session_clip_1234',
    state: () => FrameReviewState.create('playback-ready', 1, { playbackDurationUs: 60_000_000n }),
    subscribe: () => () => undefined,
    jumpPlaybackBy,
  } as unknown as IFrameReviewSession;
  return { session, jumpPlaybackBy };
}

// Screens re-render their commands when the player reports a transport change; call this after changing player state.
export function captureTransportListener(player: FrameReviewPlayerControl): () => void {
  let listener = (): void => undefined;
  vi.spyOn(player, 'subscribeTransport').mockImplementation(next => {
    listener = next;
    return () => undefined;
  });
  return () => listener();
}
