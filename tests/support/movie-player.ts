import { vi } from 'vitest';

import { FrameReviewPlayerControl } from '../../src/ui/frame-review-player-control.js';

export function moviePlayer(): FrameReviewPlayerControl {
  return new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
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
