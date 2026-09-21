import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  FrameReviewCapturePoint,
  FrameReviewDisplayFrame,
  FrameReviewEvent,
  IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState, type IFrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { FrameReviewPlayerControl } from '../../src/ui/frame-review-player-control.js';

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

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
  setRate: ReturnType<typeof vi.fn>;
  seekPlayback: ReturnType<typeof vi.fn>;
  enterFrameScrub: ReturnType<typeof vi.fn>;
  scrubToFrame: ReturnType<typeof vi.fn>;
  pressAdjacent: ReturnType<typeof vi.fn>;
  releaseAdjacent: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  let listener: ((event: FrameReviewEvent) => void) | undefined;
  const value = {
    id: 'session_12345678',
    state: vi.fn(() => initialState),
    play: vi.fn(async () => undefined), pause: vi.fn(async () => undefined),
    setRate: vi.fn(async () => undefined), seekPlayback: vi.fn(async () => undefined),
    enterFrameScrub: vi.fn(async () => exactFrame(12, 1)),
    scrubToFrame: vi.fn(async (frameIndex: number) => exactFrame(frameIndex, frameIndex)),
    stepAdjacent: vi.fn(async (direction: -1 | 1) => exactFrame(12 + direction, 2)),
    pressAdjacent: vi.fn(async () => undefined), releaseAdjacent: vi.fn(async () => undefined),
    captureCurrentPoint: vi.fn(async (): Promise<FrameReviewCapturePoint> => ({ kind: 'exact-frame', identity: exactIdentity })),
    subscribe: vi.fn((next: (event: FrameReviewEvent) => void) => { listener = next; return () => { listener = undefined; }; }),
    dispose: vi.fn(async () => undefined),
  } as unknown as IFrameReviewSession;
  return {
    value, emit: (event) => listener?.(event), state: value.state as ReturnType<typeof vi.fn>,
    play: value.play as ReturnType<typeof vi.fn>, pause: value.pause as ReturnType<typeof vi.fn>,
    setRate: value.setRate as ReturnType<typeof vi.fn>, seekPlayback: value.seekPlayback as ReturnType<typeof vi.fn>,
    enterFrameScrub: value.enterFrameScrub as ReturnType<typeof vi.fn>, scrubToFrame: value.scrubToFrame as ReturnType<typeof vi.fn>,
    pressAdjacent: value.pressAdjacent as ReturnType<typeof vi.fn>, releaseAdjacent: value.releaseAdjacent as ReturnType<typeof vi.fn>,
    dispose: value.dispose as ReturnType<typeof vi.fn>,
  };
}

function frameEvent(frame: FrameReviewDisplayFrame): FrameReviewEvent {
  return { type: 'display-frame', frame };
}

describe('FrameReviewPlayerControl', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('owns one root and one movie-position range, and reparents the same root between hosts', () => {
    const renderer = { render: vi.fn(async () => undefined), clear: vi.fn() };
    const control = new FrameReviewPlayerControl({ document, frameRenderer: renderer });
    const firstHost = document.createElement('section');
    const secondHost = document.createElement('section');
    document.body.append(firstHost, secondHost);

    control.mount(firstHost);
    const root = control.root;
    control.mount(secondHost);

    expect(control.root).toBe(root);
    expect(firstHost.contains(root)).toBe(false);
    expect(secondHost.contains(root)).toBe(true);
    expect(root.querySelectorAll('input[type="range"]').length).toBe(1);
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
});
