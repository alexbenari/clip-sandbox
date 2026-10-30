import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  FrameReviewCapturePoint,
  FrameReviewDisplayFrame,
  FrameReviewEvent,
  IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState, type IFrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { FrameReviewPlayerControl, type IPlayerFullScreen } from '../../src/ui/frame-review-player-control.js';
import { deferred } from '../support/deferred.js';
import { shippedPageStyles } from '../support/page-markup.js';


const exactIdentity = Object.freeze({
  frameIndex: 12,
  originalFrameIndex: 12,
  pts: 4_000n,
  duration: 333n,
  timebaseNumerator: 1n,
  timebaseDenominator: 1_000n,
  frameInfoPts: 4_000n,
  frameInfoHash: 'frame-hash-012',
});

function state(phase: IFrameReviewState['phase'], captureEnabled = phase === 'exact-ready'): IFrameReviewState {
  return Object.freeze({
    ...FrameReviewState.create(phase, 7, { playbackDurationUs: 4_000_000n }),
    captureEnabled,
    preparedReview: captureEnabled ? Object.freeze({
      cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 120,
      sourceWidth: 640, sourceHeight: 360, durationUs: 4_000_000n,
    }) : null,
  });
}

function playbackFrame(timestampUs: bigint, frameGeneration: number): FrameReviewDisplayFrame {
  return Object.freeze({
    kind: 'playback-frame', playbackTimestampUs: timestampUs, sourceGeneration: 7,
    frameGeneration, width: 2, height: 2, sourceWidth: 640, sourceHeight: 360,
    pixels: new Blob(['playback']),
  });
}

function exactFrame(frameIndex: number, frameGeneration: number): FrameReviewDisplayFrame {
  return Object.freeze({
    kind: 'exact-frame', identity: Object.freeze({ ...exactIdentity, frameIndex, originalFrameIndex: frameIndex }),
    reviewTimeUs: BigInt(frameIndex) * 333_000n, sourceGeneration: 7, frameGeneration,
    width: 2, height: 2, sourceWidth: 640, sourceHeight: 360,
    pixels: new Blob([`exact-${frameIndex}`]),
  });
}

function session(initialState = state('exact-ready')): {
  value: IFrameReviewSession;
  emit(event: FrameReviewEvent): void;
  state: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekPlayback: ReturnType<typeof vi.fn>;
  jumpPlaybackBy: ReturnType<typeof vi.fn>;
  enterFrameScrub: ReturnType<typeof vi.fn>;
  scrubToFrame: ReturnType<typeof vi.fn>;
  goToFrame: ReturnType<typeof vi.fn>;
  scrubToTime: ReturnType<typeof vi.fn>;
  thumbnailFrame: ReturnType<typeof vi.fn>;
  pressAdjacent: ReturnType<typeof vi.fn>;
  releaseAdjacent: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  let listener: ((event: FrameReviewEvent) => void) | undefined;
  const value = {
    id: 'session_12345678',
    state: vi.fn(() => initialState),
    play: vi.fn(async () => undefined), pause: vi.fn(async () => undefined),
    seekPlayback: vi.fn(async () => undefined),
    jumpPlaybackBy: vi.fn(async (deltaUs: bigint) => deltaUs),
    enterFrameScrub: vi.fn(async () => exactFrame(12, 1)),
    scrubToFrame: vi.fn(async (frameIndex: number) => exactFrame(frameIndex, frameIndex)),
    goToFrame: vi.fn(async (frameIndex: number) => exactFrame(frameIndex, frameIndex)),
    scrubToTime: vi.fn(async (timestampUs: bigint) => exactFrame(Number(timestampUs / 333_000n), Number(timestampUs / 333_000n))),
    thumbnailFrame: vi.fn(async (frameIndex: number) => exactFrame(frameIndex, frameIndex)),
    stepAdjacent: vi.fn(async (direction: -1 | 1) => exactFrame(12 + direction, 2)),
    pressAdjacent: vi.fn(async () => undefined), releaseAdjacent: vi.fn(async () => undefined),
    captureCurrentPoint: vi.fn(async (): Promise<FrameReviewCapturePoint> => ({ kind: 'exact-frame', identity: exactIdentity })),
    subscribe: vi.fn((next: (event: FrameReviewEvent) => void) => { listener = next; return () => { listener = undefined; }; }),
    dispose: vi.fn(async () => undefined),
  } as unknown as IFrameReviewSession;
  return {
    value, emit: (event) => listener?.(event), state: value.state as ReturnType<typeof vi.fn>,
    play: value.play as ReturnType<typeof vi.fn>, pause: value.pause as ReturnType<typeof vi.fn>,
    seekPlayback: value.seekPlayback as ReturnType<typeof vi.fn>,
    jumpPlaybackBy: value.jumpPlaybackBy as ReturnType<typeof vi.fn>,
    thumbnailFrame: value.thumbnailFrame as ReturnType<typeof vi.fn>,
    enterFrameScrub: value.enterFrameScrub as ReturnType<typeof vi.fn>, scrubToFrame: value.scrubToFrame as ReturnType<typeof vi.fn>,
    goToFrame: value.goToFrame as ReturnType<typeof vi.fn>,
    scrubToTime: value.scrubToTime as ReturnType<typeof vi.fn>,
    pressAdjacent: value.pressAdjacent as ReturnType<typeof vi.fn>, releaseAdjacent: value.releaseAdjacent as ReturnType<typeof vi.fn>,
    dispose: value.dispose as ReturnType<typeof vi.fn>,
  };
}

function frameEvent(frame: FrameReviewDisplayFrame): FrameReviewEvent {
  return { type: 'display-frame', frame };
}

describe('FrameReviewPlayerControl', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('enters only with exact readiness, focuses its root, and leaves normal view after a rejected request', async () => {
    let active = false;
    const fullScreen: IPlayerFullScreen = {
      enterElementFullScreen: vi.fn(async () => { active = true; }),
      exitFullScreen: vi.fn(async () => { active = false; }),
      isElementFullScreen: () => active,
    };
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, fullScreen, frameRenderer: renderer });
    control.mountInGifScreen(document.body);
    control.toggleMovieFullScreen();
    expect(fullScreen.enterElementFullScreen).not.toHaveBeenCalled();
    control.attachSession(session().value);
    expect(control.root.querySelector<HTMLButtonElement>('[data-command="full-screen"]')?.disabled).toBe(false);
    control.toggleMovieFullScreen();
    await vi.waitFor(() => expect(control.root.classList.contains('movie-full-screen')).toBe(true));
    expect(document.activeElement).toBe(control.root);
    await control.exitMovieFullScreen();
    expect(document.activeElement).toBe(control.root);
    expect(control.root.classList.contains('movie-full-screen')).toBe(false);

    const rejected = new FrameReviewPlayerControl({ document, frameRenderer: renderer, fullScreen: {
      ...fullScreen, enterElementFullScreen: vi.fn(async () => { throw new Error('Denied by browser'); }),
    } });
    rejected.mountInGifScreen(document.body);
    rejected.attachSession(session().value);
    rejected.toggleMovieFullScreen();
    await vi.waitFor(() => expect(rejected.root.querySelector('.frame-review-error')?.textContent).toContain('Denied by browser'));
    expect(rejected.root.classList.contains('movie-full-screen')).toBe(false);
  });

  it('holds the replacement first frame until the player leaves full screen, without requiring an event', async () => {
    let active = false;
    const exit = deferred<void>();
    const fullScreen: IPlayerFullScreen = {
      enterElementFullScreen: vi.fn(async () => { active = true; }),
      exitFullScreen: vi.fn(() => exit.promise),
      isElementFullScreen: () => active,
    };
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, fullScreen, frameRenderer: renderer });
    control.mountInGifScreen(document.body);
    const old = session();
    const replacement = session();
    control.attachSession(old.value);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalled());
    renderer.render.mockClear();
    control.toggleMovieFullScreen();
    await vi.waitFor(() => expect(control.isMovieFullScreen()).toBe(true));
    control.attachSession(replacement.value);
    await vi.waitFor(() => expect(replacement.thumbnailFrame).toHaveBeenCalledWith(0));
    expect(renderer.render).not.toHaveBeenCalled();
    active = false;
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
    expect(control.isMovieFullScreen()).toBe(false);
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Frame 0');
  });

  it('keeps a newly attached movie off screen while an earlier entry request is pending', async () => {
    let active = false;
    const enter = deferred<void>();
    const fullScreen: IPlayerFullScreen = {
      enterElementFullScreen: vi.fn(async () => { await enter.promise; active = true; }),
      exitFullScreen: vi.fn(async () => { active = false; }),
      isElementFullScreen: () => active,
    };
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, fullScreen, frameRenderer: renderer });
    control.mountInGifScreen(document.body);
    control.attachSession(session().value);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalled());
    renderer.render.mockClear();
    control.toggleMovieFullScreen();
    const replacement = session();
    control.attachSession(replacement.value);
    await vi.waitFor(() => expect(replacement.thumbnailFrame).toHaveBeenCalledWith(0));
    expect(renderer.render).not.toHaveBeenCalled();
    enter.resolve(undefined);
    await vi.waitFor(() => expect(fullScreen.exitFullScreen).toHaveBeenCalled());
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
    expect(control.isMovieFullScreen()).toBe(false);
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Frame 0');
  });

  it('continues with the chosen movie when browser exit rejects during replacement', async () => {
    let active = false;
    const fullScreen: IPlayerFullScreen = {
      enterElementFullScreen: vi.fn(async () => { active = true; }),
      exitFullScreen: vi.fn(async () => { throw new Error('Exit rejected'); }),
      isElementFullScreen: () => active,
    };
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, fullScreen, frameRenderer: renderer });
    control.mountInGifScreen(document.body);
    control.attachSession(session().value);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalled());
    renderer.render.mockClear();
    const remove = control.root.remove.bind(control.root);
    vi.spyOn(control.root, 'remove').mockImplementation(() => { active = false; remove(); });
    control.toggleMovieFullScreen();
    await vi.waitFor(() => expect(control.root.classList.contains('movie-full-screen')).toBe(true));
    const replacement = session();
    control.attachSession(replacement.value);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
    expect(control.isMovieFullScreen()).toBe(false);
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Frame 0');
  });

  it('hides the seek row after three idle seconds, ignores stationary movement, and exits on readiness loss', async () => {
    vi.useFakeTimers();
    try {
      let active = false;
      const fullScreen: IPlayerFullScreen = {
        enterElementFullScreen: vi.fn(async () => { active = true; }),
        exitFullScreen: vi.fn(async () => { active = false; }),
        isElementFullScreen: () => active,
      };
      const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
      const review = session();
      const control = new FrameReviewPlayerControl({ document, fullScreen, frameRenderer: renderer });
      control.mountInGifScreen(document.body);
      control.attachSession(review.value);
      control.toggleMovieFullScreen();
      control.onFullScreenChange();
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(true);
      const bar = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;
      bar.focus();
      vi.advanceTimersByTime(3000);
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(false);
      expect(document.activeElement).toBe(control.root);
      expect(bar.tabIndex).toBe(-1);
      expect(control.root.querySelector('.frame-review-progress-row')?.getAttribute('aria-hidden')).toBe('true');
      control.root.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(true);
      expect(bar.tabIndex).toBe(0);
      vi.advanceTimersByTime(2000);
      control.root.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));
      vi.advanceTimersByTime(1000);
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(false);
      review.emit({ type: 'state', state: state('closed') });
      await Promise.resolve();
      expect(fullScreen.exitFullScreen).toHaveBeenCalledOnce();
      expect(control.isMovieFullScreen()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the seek row visible in movie full screen while its position is being dragged', async () => {
    vi.useFakeTimers();
    try {
      let active = false;
      const fullScreen: IPlayerFullScreen = {
        enterElementFullScreen: vi.fn(async () => { active = true; }),
        exitFullScreen: vi.fn(async () => { active = false; }),
        isElementFullScreen: () => active,
      };
      const control = new FrameReviewPlayerControl({ document, fullScreen,
        frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
      control.mountInGifScreen(document.body);
      control.attachSession(session().value);
      control.toggleMovieFullScreen();
      await vi.advanceTimersByTimeAsync(0);
      control.onFullScreenChange();
      const bar = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;

      bar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(true);

      bar.value = '20';
      bar.dispatchEvent(new Event('change', { bubbles: true }));
      bar.dispatchEvent(new Event('pointerup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(control.root.classList.contains('movie-overlay-visible')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the first frame when an already prepared movie attaches without a playback frame event', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });

    control.attachSession(review.value);

    await vi.waitFor(() => expect(control.root.querySelector('.frame-review-empty')?.hasAttribute('hidden')).toBe(true));
    expect(review.thumbnailFrame).toHaveBeenCalledWith(0);
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Frame 0');
  });

  it('does not replace playing video with a late initial-frame preview', async () => {
    const initial = deferred<FrameReviewDisplayFrame>();
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    review.thumbnailFrame.mockReturnValue(initial.promise);
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    await control.togglePlayback();
    initial.resolve(exactFrame(0, 1));
    await initial.promise;
    review.emit(frameEvent(playbackFrame(1_000_000n, 2)));

    await vi.waitFor(() => expect(control.root.querySelector('[data-time="current"]')?.textContent)
      .toBe('00:00:01.000'));
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Playback time');
  });

  it('owns one root and one movie-position range, and reparents the same root between hosts', () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    const firstHost = document.createElement('section');
    const secondHost = document.createElement('section');
    document.body.append(firstHost, secondHost);

    control.mountInGifScreen(firstHost);
    const root = control.root;
    control.mountInGifScreen(secondHost);

    expect(control.root).toBe(root);
    expect(firstHost.contains(root)).toBe(false);
    expect(secondHost.contains(root)).toBe(true);
    expect(root.querySelectorAll('input[type="range"]').length).toBe(1);
    expect(root.querySelector('[aria-label="Playback speed"]')).toBeNull();
  });

  describe('looks', () => {
    afterEach(() => { document.head.replaceChildren(); });

    const partsShown = (control: FrameReviewPlayerControl) => Object.fromEntries(
      [['picture', '.frame-review-canvas'], ['progress row', '.frame-review-progress-row'], ['transport', '.frame-review-transport'],
        ['readiness', '.frame-review-readiness'], ['readout', '.frame-review-identity']].map(([part, selector]) => {
        let element: Element | null = control.root.querySelector(selector);
        let shown = true;
        while (element && element !== control.root.parentElement) {
          if (element instanceof HTMLElement && (element.hidden || getComputedStyle(element).display === 'none')) shown = false;
          element = element.parentElement;
        }
        return [part, shown];
      }));

    function preparingPlayer() {
      document.head.innerHTML = shippedPageStyles();
      const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
      const review = session(state('indexing', false));
      control.attachSession(review.value);
      const zoomEditHost = document.createElement('div');
      const gifScreenHost = document.createElement('div');
      document.body.append(zoomEditHost, gifScreenHost);
      return { control, review, zoomEditHost, gifScreenHost };
    }

    it('shows only the picture when mounted in Zoom edit mode', () => {
      const { control, zoomEditHost } = preparingPlayer();

      control.mountInZoomEdit(zoomEditHost);

      expect(partsShown(control)).toEqual({
        picture: true, 'progress row': false, transport: false, readiness: false, readout: false,
      });
    });

    it('shows its progress row, transport, readiness and readout again when mounted back in a GIF screen', () => {
      const { control, zoomEditHost, gifScreenHost } = preparingPlayer();
      control.mountInGifScreen(gifScreenHost);
      control.mountInZoomEdit(zoomEditHost);

      control.mountInGifScreen(gifScreenHost);

      expect(partsShown(control)).toEqual({
        picture: true, 'progress row': true, transport: true, readiness: true, readout: true,
      });
    });

    it('lets Zoom edit mode jump although the GIF screen had made jumping unavailable', async () => {
      const { control, review, zoomEditHost, gifScreenHost } = preparingPlayer();
      control.mountInGifScreen(gifScreenHost);
      control.setJumpUnavailable(true);

      control.mountInZoomEdit(zoomEditHost);
      control.jumpBySeconds(2);

      await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenCalledWith(2_000_000n));
    });
  });

  it('resets position and elapsed time when a different movie session attaches', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    const first = session(state('playback-ready', false));
    control.attachSession(first.value);
    first.emit(frameEvent(playbackFrame(2_000_000n, 1)));
    await vi.waitFor(() => expect(control.root.querySelector('[data-time="current"]')?.textContent).toBe('00:00:02.000'));

    control.attachSession(session(state('playback-ready', false)).value);

    expect(control.root.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('0');
    expect(control.root.querySelector('[data-time="current"]')?.textContent).toBe('00:00:00.000');
    expect(control.root.querySelector('.frame-review-empty')?.textContent).toBe('Preparing movie…');
  });

  it('keeps ordinary transport usable before exact readiness while disabling exact stepping and capture', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session(state('playback-ready', false));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    expect(control.root.querySelector<HTMLButtonElement>('[data-command="play-pause"]')?.disabled).toBe(false);
    expect(control.root.querySelector<HTMLButtonElement>('[data-command="step-left"]')?.disabled).toBe(true);
    expect(control.capturePoint()).toBeNull();

    await control.togglePlayback();
    expect(review.play).toHaveBeenCalledOnce();
    expect(control.root.querySelector('[data-command="play-pause"]')?.getAttribute('aria-label')).toBe('Pause');
    expect(control.root.querySelector('[data-icon="play"]')?.hasAttribute('hidden')).toBe(true);
    expect(control.root.querySelector('[data-icon="pause"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('returns to Play when ordinary playback reaches the end', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    await control.togglePlayback();
    review.emit({ type: 'playback-ended' });

    expect(control.root.querySelector('[data-command="play-pause"]')?.getAttribute('aria-label')).toBe('Play');
    await control.togglePlayback();
    expect(review.play).toHaveBeenCalledTimes(2);
    expect(review.pause).not.toHaveBeenCalled();
  });

  it('goes straight to an exact saved frame by ordinal, not through the progress-bar scrub or a timestamp seek', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    const capture = await control.enterExactScrubAtFrame(24);

    expect(review.goToFrame).toHaveBeenCalledWith(24);
    expect(review.seekPlayback).not.toHaveBeenCalled();
    expect(capture?.point).toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 24 } });
  });

  it('displays the frame after a saved capture and clamps at the movie end', async () => {
    const review = session();
    const control = new FrameReviewPlayerControl({ document,
      frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);

    await control.showFrameAfterCapture(review.value, { kind: 'saved-exact-frame', frameIndex: 24,
      frameInfoHash: '0000000000000024', reviewTimeUs: 800_000n, sourceGeneration: 7 });
    expect(review.goToFrame).toHaveBeenCalledWith(25);
    expect(control.capturePoint()).toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 25 } });

    await control.showFrameAfterCapture(review.value, { kind: 'saved-exact-frame', frameIndex: 119,
      frameInfoHash: '0000000000000119', reviewTimeUs: 3_966_000n, sourceGeneration: 7 });
    expect(review.goToFrame).toHaveBeenLastCalledWith(119);
  });

  it('resolves a timestamp capture to its exact frame before stepping forward', async () => {
    const review = session();
    const control = new FrameReviewPlayerControl({ document,
      frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);

    await control.showFrameAfterCapture(review.value, { kind: 'playback-timestamp', timestampUs: 1_000_000n,
      sourceGeneration: 7 });

    expect(review.scrubToTime).toHaveBeenCalledWith(1_000_000n);
    expect((review.value.stepAdjacent as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(1);
    expect(control.capturePoint()).toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 13 } });
  });

  it('returns a synchronous point from the displayed frame and rejects older async render completion', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const renderer = { render: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    review.emit(frameEvent(exactFrame(12, 1)));
    review.emit(frameEvent(exactFrame(13, 2)));
    second.resolve(undefined);
    await vi.waitFor(() => expect(control.capturePoint()).toEqual({
      kind: 'exact-frame',
      identity: expect.objectContaining({ frameIndex: 13 }),
    }));
    first.resolve(undefined);
    await vi.waitFor(() => expect(control.capturePoint()).toEqual({
      kind: 'exact-frame',
      identity: expect.objectContaining({ frameIndex: 13 }),
    }));
  });

  it('clears stale exact identity when playback starts and reports the newest playback timestamp', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    review.emit(frameEvent(exactFrame(12, 1)));
    await vi.waitFor(() => expect(control.capturePoint()).toMatchObject({ kind: 'exact-frame' }));

    await control.togglePlayback();
    expect(review.play).toHaveBeenCalledOnce();
    expect(control.capturePoint()).toBeNull();
    review.emit(frameEvent(playbackFrame(2_250_000n, 2)));
    await vi.waitFor(() => expect(control.capturePoint()).toEqual({
      kind: 'playback-timestamp', timestampUs: 2_250_000n,
    }));
  });

  it('enters exact scrub on pause and maps the sole range input to canonical frame ordinals', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();
    await control.togglePlayback();
    expect(review.enterFrameScrub).toHaveBeenCalledOnce();

    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;
    progress.value = '42';
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(review.scrubToFrame).toHaveBeenCalledWith(42);
  });

  it('stops playback on the current exact frame when an arrow step begins, without stepping after a quick release', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();

    control.pressStep(1);
    control.releaseStep(1);

    await vi.waitFor(() => expect(review.enterFrameScrub).toHaveBeenCalledOnce());
    expect(review.pressAdjacent).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(control.capturePoint()).toMatchObject({
      kind: 'exact-frame', identity: { frameIndex: 12 },
    }));
  });

  it('does not let a late playback frame replace the exact frame chosen through the progress bar', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;

    progress.value = '8';
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(control.capturePoint()).toMatchObject({
      kind: 'exact-frame', identity: { frameIndex: 8 },
    }));
    review.emit(frameEvent(playbackFrame(400_000n, 99)));
    await Promise.resolve();

    expect(control.capturePoint()).toMatchObject({ kind: 'exact-frame', identity: { frameIndex: 8 } });
  });

  it('keeps an active playback drag stable until its final timestamp seek commits', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session(state('indexing', false));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();
    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;

    progress.value = '75000';
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    review.emit(frameEvent(playbackFrame(400_000n, 99)));

    expect(progress.value).toBe('75000');
    progress.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(review.seekPlayback).toHaveBeenCalledWith(3_000_000n));
  });

  it('shows a movie frame while playback dragging pauses before mouse release', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session(state('indexing', false));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();
    review.seekPlayback.mockImplementation(async () => {
      review.emit(frameEvent(playbackFrame(3_000_000n, 3)));
    });
    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;

    progress.value = '75000';
    progress.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => expect(review.seekPlayback).toHaveBeenCalledWith(3_000_000n));
    await vi.waitFor(() => expect(control.root.querySelector('.frame-review-empty')?.hasAttribute('hidden')).toBe(true));
    expect(progress.value).toBe('75000');
    expect(control.root.querySelector('[data-time="current"]')?.textContent).toBe('00:00:03.000');
  });

  it('uses the one centered readiness surface for temporary preparation status', () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session(state('proxy-encoding', false));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    expect(control.root.querySelector('[data-readiness-text]')?.textContent).toBe('Creating review proxy');
    expect(control.root.querySelector('.frame-review-identity')?.textContent).toBe('Playback time');
  });

  it('routes held stepping to the session and releases it during teardown without disposing the session', () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);

    control.pressStep(-1);
    control.releaseStep(-1);
    expect(review.pressAdjacent).toHaveBeenCalledWith(-1);
    expect(review.releaseAdjacent).toHaveBeenCalledWith(-1);
    control.destroy();
    expect(review.releaseAdjacent).toHaveBeenCalled();
    expect(review.dispose).not.toHaveBeenCalled();
  });

  it('focusInitial focuses the player surface for an already-open review', () => {
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(session().value);
    document.body.append(control.root);
    expect(control.focusInitial()).toBe(true);
    expect(document.activeElement).toBe(control.root);
  });

  it('uses timestamp seeking during playback without entering exact scrub mode', async () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();
    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;
    progress.value = '60';

    progress.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(review.seekPlayback).toHaveBeenCalledWith(2_016_807n);
    expect(review.scrubToFrame).not.toHaveBeenCalled();
    expect(review.pause).not.toHaveBeenCalled();
  });

  it('seeks near an approximate endpoint and reports paused exact mode only after that frame renders', async () => {
    const rendered = deferred<void>();
    const renderer = { render: vi.fn(() => rendered.promise), clear: vi.fn() };
    const review = session();
    review.enterFrameScrub.mockResolvedValueOnce(exactFrame(24, 4));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    control.attachSession(review.value);
    await control.togglePlayback();

    const entering = control.enterExactScrubAt(800_000n);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
    expect(review.seekPlayback).toHaveBeenCalledWith(800_000n);
    expect(review.enterFrameScrub).toHaveBeenCalledOnce();
    expect(control.root.querySelector('[data-command="play-pause"]')?.getAttribute('aria-label')).toBe('Pause');

    rendered.resolve(undefined);
    await expect(entering).resolves.toMatchObject({
      point: { kind: 'exact-frame', identity: { frameIndex: 24 } },
    });
    expect(control.root.querySelector('[data-command="play-pause"]')?.getAttribute('aria-label')).toBe('Play');
  });

  it('starts with a 2-second selection and uses the same playback jump for the button and duration command', async () => {
    const review = session(state('playback-ready', false));
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);
    const selector = control.root.querySelector<HTMLSelectElement>('[aria-label="Jump by seconds"]')!;
    const button = control.root.querySelector<HTMLButtonElement>('[data-command="jump-seconds"]')!;
    expect(selector.value).toBe('2');
    expect(button.textContent).toBe('Jump +2s');

    button.click();
    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenCalledWith(2_000_000n));
    selector.value = '7';
    selector.dispatchEvent(new Event('change'));
    control.jumpBySeconds(5);
    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenCalledWith(5_000_000n));
    expect(selector.value).toBe('7');
  });

  it('uses elapsed time and the last manual step direction in exact scrub', async () => {
    const review = session();
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);
    await control.enterExactScrubAtFrame(12);
    control.pressStep(-1);
    control.releaseStep(-1);

    control.jumpBySeconds(2);
    await vi.waitFor(() => expect(review.scrubToTime).toHaveBeenCalledWith(1_996_000n));
    expect(control.root.querySelector('[data-command="jump-seconds"]')?.textContent).toBe('Jump −2s');
    expect(review.jumpPlaybackBy).not.toHaveBeenCalled();
  });

  it('drops queued jumps at arrow input and enters scrub after only the issued seek settles', async () => {
    const first = deferred<bigint>();
    const review = session();
    review.jumpPlaybackBy.mockReturnValueOnce(first.promise);
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);
    await control.togglePlayback();
    control.jumpBySeconds(5);
    control.jumpBySeconds(5);
    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenCalledOnce());
    control.pressStep(-1);
    control.releaseStep(-1);
    expect(control.exactScrubActive()).toBe(true);
    first.resolve(5_000_000n);
    await vi.waitFor(() => expect(review.enterFrameScrub).toHaveBeenCalledOnce());
    expect(review.jumpPlaybackBy).toHaveBeenCalledOnce();
    expect(review.pressAdjacent).not.toHaveBeenCalled();
  });

  it('steps once for an arrow tap released while a paused exact jump is still landing', async () => {
    const landing = deferred<FrameReviewDisplayFrame>();
    const review = session();
    const adjacentRequests: string[] = [];
    review.pressAdjacent.mockImplementation(async (direction: number) => { adjacentRequests.push(`press ${direction}`); });
    review.releaseAdjacent.mockImplementation(async (direction: number) => { adjacentRequests.push(`release ${direction}`); });
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);
    await control.enterExactScrubAtFrame(12);
    review.scrubToTime.mockReturnValueOnce(landing.promise);
    control.jumpBySeconds(2);
    await vi.waitFor(() => expect(review.scrubToTime).toHaveBeenCalledOnce());

    control.pressStep(1);
    control.releaseStep(1);
    landing.resolve(exactFrame(18, 18));

    await vi.waitFor(() => expect(adjacentRequests).toEqual(['release 1', 'press 1', 'release 1']));
  });

  it('accumulates rapid playback presses while one jump is pending', async () => {
    const first = deferred<bigint>();
    const review = session(state('playback-ready', false));
    review.jumpPlaybackBy.mockReturnValueOnce(first.promise);
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);

    control.jumpBySeconds(2);
    control.jumpBySeconds(5);
    control.jumpBySeconds(5);
    expect(review.jumpPlaybackBy).toHaveBeenCalledTimes(1);
    first.resolve(2_000_000n);

    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenNthCalledWith(2, 10_000_000n));
    expect(review.jumpPlaybackBy).toHaveBeenCalledTimes(2);
  });

  it('keeps a new jump when a previously interrupted seek fails', async () => {
    const first = deferred<bigint>();
    const review = session(state('playback-ready', false));
    review.jumpPlaybackBy.mockReturnValueOnce(first.promise);
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);

    control.jumpBySeconds(2);
    control.interruptJumps();
    control.jumpBySeconds(5);
    first.reject(new Error('Old seek failed'));

    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenNthCalledWith(2, 5_000_000n));
    expect(control.root.querySelector('[role="alert"]')?.textContent).not.toContain('Old seek failed');
  });

  it('drops queued jumps when a movie-position drag begins', async () => {
    const first = deferred<bigint>();
    const review = session();
    review.jumpPlaybackBy.mockReturnValueOnce(first.promise);
    const control = new FrameReviewPlayerControl({ document, frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() } });
    control.attachSession(review.value);
    await control.togglePlayback();
    control.jumpBySeconds(7);
    control.jumpBySeconds(7);
    await vi.waitFor(() => expect(review.jumpPlaybackBy).toHaveBeenCalledOnce());
    const progress = control.root.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(progress.disabled).toBe(false);
    progress.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    progress.value = '50000';
    progress.dispatchEvent(new Event('change', { bubbles: true }));
    first.resolve(7_000_000n);

    await vi.waitFor(() => expect(review.seekPlayback).toHaveBeenCalled());
    expect(review.jumpPlaybackBy).toHaveBeenCalledOnce();
  });
});
