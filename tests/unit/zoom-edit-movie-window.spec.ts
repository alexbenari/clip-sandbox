import { describe, expect, it, vi } from 'vitest';

import {
  ZoomEditMovieWindow,
  type ZoomEditMovieWindowState,
  type ZoomEditWindowAnchor,
} from '../../src/app/zoom-edit-movie-window.js';
import {
  FrameReviewOpaqueId,
  type IFrameReviewOpenRequest,
  type IFrameReviewService,
} from '../../src/frame-review/frame-review-api.js';
import { flushPendingWork } from '../support/flush-pending-work.js';
import { FakeReview, fakeZoomEditSources, windowHandle } from '../support/zoom-edit-fakes.js';

const anchoredAnswer = Object.freeze({ kind: 'anchored' as const, clipStartFrame: 1800, earliestFrame: 360, latestFrame: 3359 });

function movieWindow({ muted = false } = {}) {
  const reviews: FakeReview[] = [];
  const openRequests: IFrameReviewOpenRequest[] = [];
  const frameReview: IFrameReviewService = {
    chooseSource: vi.fn(),
    open: vi.fn(async (request: IFrameReviewOpenRequest) => {
      openRequests.push(request);
      const review = new FakeReview(`session_window_00000${reviews.length + 1}`, 3720);
      reviews.push(review);
      return review.session;
    }),
  };
  const { sources, windowAnswers, anchorAnswers } = fakeZoomEditSources(FrameReviewOpaqueId.sourceHandle('source_clip_000001'));
  const failures = { report: vi.fn() };
  const opened = ZoomEditMovieWindow.open(
    { frameReview, sources, failures, previewBounds: { maxWidth: 1280, maxHeight: 720 } },
    { folder: { folderPath: 'C:/Clips' }, filename: 'harbor-scene.mp4', muted },
  );
  const anchors: ZoomEditWindowAnchor[] = [];
  opened.on('anchored', anchor => anchors.push(anchor));
  const states: ZoomEditMovieWindowState[] = [];
  opened.on('stateChanged', state => states.push(state));

  async function answerWindow(step: number, answer: Parameters<(typeof windowAnswers)[number]['resolve']>[0]): Promise<void> {
    await vi.waitFor(() => expect(windowAnswers).toHaveLength(step));
    windowAnswers[step - 1].resolve(answer);
    await flushPendingWork();
  }

  async function prepared(step = 1): Promise<FakeReview> {
    await answerWindow(step, { kind: 'ready', sourceHandle: windowHandle(step), windowId: `window_${step}` });
    await vi.waitFor(() => expect(reviews).toHaveLength(step));
    await flushPendingWork();
    reviews[step - 1].becomeExactReady();
    await vi.waitFor(() => expect(anchorAnswers).toHaveLength(step));
    return reviews[step - 1];
  }

  return { movieWindow: opened, reviews, openRequests, sources, windowAnswers, anchorAnswers, failures, anchors, states, answerWindow, prepared };
}

describe('ZoomEditMovieWindow', () => {
  it('reports the anchor of a prepared window in window frame numbers', async () => {
    const edit = movieWindow();
    const review = await edit.prepared();

    edit.anchorAnswers[0].resolve(anchoredAnswer);
    await vi.waitFor(() => expect(edit.anchors).toHaveLength(1));

    expect(edit.anchors[0]).toEqual({ windowId: 'window_1', review: review.session, clipStartFrame: 1800, earliestFrame: 360, latestFrame: 3359 });
  });

  it('is preparing the window between the movie being found and the anchor', async () => {
    const edit = movieWindow();

    await edit.prepared();

    expect(edit.movieWindow.state).toBe('preparing-window');
  });

  it('widens the window twice, naming the window it widens, then reports the clip not found', async () => {
    const edit = movieWindow();
    for (const step of [1, 2, 3]) {
      await edit.prepared(step);
      edit.anchorAnswers[step - 1].resolve({ kind: 'not-found' });
    }
    await vi.waitFor(() => expect(edit.movieWindow.state).toBe('not-found'));

    expect(edit.sources.openWindow.mock.calls.map(([request]) => [request.widen, request.previousWindowId])).toEqual([
      [0, undefined], [1, 'window_1'], [2, 'window_2'],
    ]);
  });

  it('closes each window that did not contain the clip', async () => {
    const edit = movieWindow();
    for (const step of [1, 2, 3]) {
      await edit.prepared(step);
      edit.anchorAnswers[step - 1].resolve({ kind: 'not-found' });
    }
    await vi.waitFor(() => expect(edit.movieWindow.state).toBe('not-found'));

    for (const review of edit.reviews) expect(review.dispose).toHaveBeenCalled();
  });

  it('reports a window review that cannot be closed instead of leaving the failure unhandled', async () => {
    const edit = movieWindow();
    const review = await edit.prepared();
    const cause = new Error('The review process stopped responding.');
    review.dispose.mockRejectedValue(cause);

    edit.anchorAnswers[0].resolve({ kind: 'not-found' });

    await vi.waitFor(() => expect(edit.failures.report).toHaveBeenCalledWith('The movie around this clip could not be closed.', cause));
  });

  it('settles as failed without reporting a window failure when its owner stops it', async () => {
    const edit = movieWindow();
    const review = await edit.prepared();

    await edit.movieWindow.stop();

    expect([edit.movieWindow.state, edit.failures.report.mock.calls]).toEqual(['failed', []]);
    expect(review.dispose).toHaveBeenCalled();
  });

  it('reports a cancelled movie lookup', async () => {
    const edit = movieWindow();

    await edit.answerWindow(1, { kind: 'cancelled' });

    expect(edit.states).toEqual(['cancelled']);
  });

  it('reports no extension for a clip whose source info is unreadable', async () => {
    const edit = movieWindow();

    await edit.answerWindow(1, { kind: 'no-source-info' });

    expect(edit.movieWindow.state).toBe('none');
  });

  it('reports that a clip keeping only its movie cannot be extended', async () => {
    const edit = movieWindow();

    await edit.answerWindow(1, { kind: 'movie-only' });

    expect(edit.movieWindow.state).toBe('movie-only');
  });

  it('reports a window that cannot be opened as failed, with the cause', async () => {
    const edit = movieWindow();
    const cause = new Error('The movie could not be read.');
    await vi.waitFor(() => expect(edit.windowAnswers).toHaveLength(1));

    edit.windowAnswers[0].reject(cause);
    await vi.waitFor(() => expect(edit.movieWindow.state).toBe('failed'));

    expect(edit.failures.report).toHaveBeenCalledWith('The source movie around this clip could not be prepared.', cause);
  });

  it('reports a window whose preparation fails as failed', async () => {
    const edit = movieWindow();
    await edit.answerWindow(1, { kind: 'ready', sourceHandle: windowHandle(1), windowId: 'window_1' });
    await vi.waitFor(() => expect(edit.reviews).toHaveLength(1));
    await flushPendingWork();

    edit.reviews[0].fail();

    expect(edit.movieWindow.state).toBe('failed');
  });

  it('lets its owner give up an anchored window that does not fit the clip', async () => {
    const edit = movieWindow();
    const review = await edit.prepared();
    edit.anchorAnswers[0].resolve(anchoredAnswer);
    await vi.waitFor(() => expect(edit.anchors).toHaveLength(1));

    edit.movieWindow.abandon(new Error('The window ends before the clip.'));

    expect(edit.movieWindow.state).toBe('failed');
    expect(review.dispose).toHaveBeenCalled();
  });

  it('opens the window review muted when asked', async () => {
    const edit = movieWindow({ muted: true });

    await edit.prepared();

    expect(edit.openRequests.map(request => request.muted)).toEqual([true]);
  });

  it('ignores an anchor that arrives after it is disposed', async () => {
    const edit = movieWindow();
    await edit.prepared();

    await edit.movieWindow.dispose();
    edit.anchorAnswers[0].resolve(anchoredAnswer);
    await flushPendingWork();

    expect(edit.anchors).toEqual([]);
  });

  it('closes its window review when disposed', async () => {
    const edit = movieWindow();
    const review = await edit.prepared();

    await edit.movieWindow.dispose();

    expect(review.dispose).toHaveBeenCalled();
  });
});
