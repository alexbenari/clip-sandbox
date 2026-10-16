import { describe, expect, it, vi } from 'vitest';

import { CurrentMovie } from '../../src/app/current-movie.js';
import { GifSessionStatus } from '../../src/app/gif-session-status.js';
import type { FrameReviewEvent, IFrameReviewService, IFrameReviewSession } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';

const source = Object.freeze({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') });

function review(phase: Parameters<typeof FrameReviewState.create>[0] = 'playback-ready') {
  let listener: (event: FrameReviewEvent) => void = () => undefined;
  const session = {
    id: 'session_12345678',
    state: () => FrameReviewState.create(phase, 1, { playbackDurationUs: 2_000_000n }),
    subscribe: vi.fn((next: (event: FrameReviewEvent) => void) => { listener = next; return () => { listener = () => undefined; }; }),
    dispose: vi.fn(async () => undefined),
  } as unknown as IFrameReviewSession;
  return { session, emit: (event: FrameReviewEvent) => listener(event) };
}

function currentMovie(frameReview: Partial<IFrameReviewService> = {}) {
  const status = new GifSessionStatus();
  const reporter = { progress: vi.fn(), success: vi.fn() };
  const failures = { report: vi.fn() };
  const movie = new CurrentMovie({
    frameReview: { chooseSource: vi.fn(async () => source), open: vi.fn(), ...frameReview } as IFrameReviewService,
    previewBounds: { maxWidth: 1280, maxHeight: 720 },
    status, reporter, failures,
  });
  return { movie, status, reporter, failures };
}

describe('CurrentMovie', () => {
  it('lets only one movie change run at a time', () => {
    const { movie } = currentMovie();

    expect(movie.beginChange()).toBe(true);
    expect(movie.beginChange()).toBe(false);
    movie.endChange();
    expect(movie.beginChange()).toBe(true);
  });

  it('returns to empty with no message when choosing is cancelled', async () => {
    const { movie, status } = currentMovie({ chooseSource: vi.fn(async () => null) });

    expect(await movie.chooseSource()).toBeNull();

    expect(movie.lifecycle).toBe('empty');
    expect(status.message).toBeNull();
  });

  it('shows the movie being opened, then follows the switched movie until exact capture is ready', async () => {
    const opened = review();
    const { movie, status, reporter } = currentMovie({ open: vi.fn(async () => opened.session) });
    const ready = vi.fn();
    movie.on('exactCaptureReady', ready);

    const candidate = await movie.openCandidate(source);
    expect(movie.lifecycle).toBe('opening');
    expect(status.message).toBe('Opening Sample Movie.mkv');
    expect(movie.switchTo(source, candidate)).toBeNull();
    movie.followReview();
    expect([movie.lifecycle, movie.sourceGeneration, status.message]).toEqual(['open', 1, 'Preparing exact frames']);

    opened.emit({ type: 'state', state: FrameReviewState.create('indexing', 1, { playbackDurationUs: 2_000_000n, progressPercent: 40 }) });
    opened.emit({ type: 'state', state: FrameReviewState.create('exact-ready', 1, { playbackDurationUs: 2_000_000n }) });

    expect(reporter.progress).toHaveBeenCalledWith('Indexing source frames for Sample Movie.mkv (40%).');
    expect(reporter.success).toHaveBeenCalledWith('Exact capture is ready for Sample Movie.mkv.');
    expect(ready).toHaveBeenCalledOnce();
    expect(status.message).toBe('Exact capture ready');
  });

  it('reports at once that a cached movie is ready', async () => {
    const cached = review('exact-ready');
    const { movie, reporter } = currentMovie();
    const ready = vi.fn();
    movie.on('exactCaptureReady', ready);
    Object.assign(cached.session, { state: () => FrameReviewState.create('exact-ready', 1, {
      playbackDurationUs: 2_000_000n,
      preparedReview: Object.freeze({ cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 60, sourceWidth: 640, sourceHeight: 360, durationUs: 2_000_000n }),
    }) });

    movie.switchTo(source, cached.session);
    movie.followReview();

    expect(reporter.success).toHaveBeenCalledWith('Reused the prepared review cache for Sample Movie.mkv.');
    expect(ready).toHaveBeenCalledOnce();
  });

  it('tells its owner when preparation fails', () => {
    const failing = review();
    const { movie } = currentMovie();
    const ended = vi.fn();
    movie.on('reviewEnded', ended);
    movie.switchTo(source, failing.session);
    movie.followReview();

    failing.emit({ type: 'state', state: FrameReviewState.create('failed', 1, { message: 'Index unavailable' }) });

    expect(ended).toHaveBeenCalledOnce();
  });

  it('ignores the previous movie once another has been switched in, and hands the previous one back', () => {
    const first = review();
    const second = review();
    const { movie, failures } = currentMovie();
    movie.switchTo(source, first.session);
    movie.followReview();

    expect(movie.switchTo({ ...source, name: 'Second.mkv' }, second.session)).toBe(first.session);
    first.emit({ type: 'error', message: 'Old movie failed.' } as FrameReviewEvent);

    expect(movie.sourceGeneration).toBe(2);
    expect(failures.report).not.toHaveBeenCalled();
  });

  it('keeps an already open movie when opening another fails, and logs the cause', () => {
    const { movie, status, failures } = currentMovie();
    movie.switchTo(source, review().session);
    const error = new Error('codec unavailable');

    movie.failOpening(error);

    expect(movie.lifecycle).toBe('open');
    expect(status.message).toBe('codec unavailable');
    expect(failures.report).toHaveBeenCalledWith('The movie could not be opened.', error);
  });

  it('hands its review back when closed and refuses further changes', () => {
    const opened = review();
    const { movie } = currentMovie();
    movie.switchTo(source, opened.session);

    expect(movie.close()).toBe(opened.session);
    expect(movie.lifecycle).toBe('disposed');
    expect(movie.beginChange()).toBe(false);
  });
});
