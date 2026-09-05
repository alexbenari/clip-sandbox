import { describe, expect, it, vi } from 'vitest';

import type { DisplayFrame } from '../../src/adapter/frame-playback-adapter.js';
import { HybridFramePlaybackAdapter } from '../../src/adapter/hybrid-frame-playback-adapter.js';
import { BackendError } from '../../src/model/backend-error.js';
import type { MediaStatus } from '../../src/model/media-status.js';

const frame = Object.freeze({
  identity: Object.freeze({
    frameIndex: 25,
    originalFrameIndex: 25,
    pts: 1_001n,
    duration: 40n,
    timebaseNumerator: 1n,
    timebaseDenominator: 1_000n,
    frameInfoPts: 1_001n,
    frameInfoHash: 'frame-25',
  }),
  reviewTimeUs: 501_000n,
}) as DisplayFrame;

describe('hybrid frame playback adapter', () => {
  it('does not send pause commands while playback is already inactive', async () => {
    const playback = playbackEngine();
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);

    await adapter.getExactFrame(7);
    await adapter.scrubToFrame(8);

    expect(playback.pause).not.toHaveBeenCalled();
  });

  it('shares one pause transition across concurrent exact-frame requests', async () => {
    let releasePause!: () => void;
    const pause = new Promise<void>((resolve) => { releasePause = resolve; });
    const playback = playbackEngine({ pause: vi.fn(() => pause) });
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.play();

    const exactRequest = adapter.getExactFrame(10);
    const scrubRequest = adapter.scrubToFrame(11);
    expect(playback.pause).toHaveBeenCalledTimes(1);
    expect(exact.getExactFrame).not.toHaveBeenCalled();

    releasePause();
    await expect(exactRequest).resolves.toBe(frame);
    await expect(scrubRequest).resolves.toBe(frame);
    expect(playback.pause).toHaveBeenCalledTimes(1);
  });

  it('opens playback before exact review preparation completes', async () => {
    const playback = playbackEngine();
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);

    await adapter.openPlaybackSource('movie.mp4', { maxWidth: 1280, maxHeight: 720 });

    expect(playback.open).toHaveBeenCalledWith('movie.mp4', {
      muted: false,
      previewBounds: { maxWidth: 1280, maxHeight: 720 },
    });
    expect(exact.open).not.toHaveBeenCalled();
  });

  it('activates the prepared proxy without losing position, rate, or playing state', async () => {
    const playback = playbackEngine({
      status: vi.fn()
        .mockResolvedValueOnce({
          state: 'playing' as const, sourceGeneration: 1, frameGeneration: 0,
          timeUs: 4_000_000n, lengthUs: 10_000_000n, rate: 0.5,
        })
        .mockResolvedValueOnce({
          state: 'paused' as const, sourceGeneration: 1, frameGeneration: 0,
          timeUs: 4_040_000n, lengthUs: 10_000_000n, rate: 0.5,
        }),
    });
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('original.mkv', { maxWidth: 960, maxHeight: 540 });
    await adapter.play();

    await adapter.activatePreparedReview({
      playbackSourcePath: 'review-proxy.mkv',
      reviewAssetPath: 'review-proxy.mkv',
      indexPath: 'review-proxy-index',
      identitySource: { reviewAssetPath: 'canonical.mkv', indexPath: 'canonical-index' },
      previewBounds: { maxWidth: 960, maxHeight: 540 },
    });

    expect(playback.pause).toHaveBeenCalledOnce();
    expect(exact.getFrameAtTime).toHaveBeenCalledWith(4_040_000n);
    expect(playback.open).toHaveBeenLastCalledWith('review-proxy.mkv', {
      muted: false,
      previewBounds: { maxWidth: 960, maxHeight: 540 },
    });
    expect(playback.seekTimeUs).toHaveBeenCalledWith(frame.reviewTimeUs);
    expect(playback.setRate).toHaveBeenCalledWith(0.5);
    expect(playback.play).toHaveBeenCalledTimes(2);
  });

  it('keeps a paused movie paused while activating its prepared proxy', async () => {
    const playback = playbackEngine({
      status: vi.fn(async () => ({
        state: 'paused' as const, sourceGeneration: 1, frameGeneration: 0,
        timeUs: 2_000_000n, lengthUs: 10_000_000n, rate: 1,
      })),
    });
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('original.mkv');

    await adapter.activatePreparedReview({
      playbackSourcePath: 'review-proxy.mkv',
      reviewAssetPath: 'review-proxy.mkv',
      indexPath: 'review-proxy-index',
    });

    expect(playback.pause).not.toHaveBeenCalled();
    expect(playback.primePreview).toHaveBeenCalledOnce();
    expect(playback.seekTimeUs).toHaveBeenCalledWith(frame.reviewTimeUs);
    expect(playback.play).not.toHaveBeenCalled();
  });

  it('restores the provisional source when opening the prepared proxy fails', async () => {
    const open = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('proxy open failed'))
      .mockResolvedValueOnce(undefined);
    const playback = playbackEngine({
      open,
      status: vi.fn(async () => ({
        state: 'paused' as const, sourceGeneration: 1, frameGeneration: 0,
        timeUs: 2_000_000n, lengthUs: 10_000_000n, rate: 0.5,
      })),
    });
    const adapter = new HybridFramePlaybackAdapter(playback, exactEngine());
    await adapter.openPlaybackSource('original.mkv');

    await expect(adapter.activatePreparedReview({
      playbackSourcePath: 'review-proxy.mkv',
      fallbackPlaybackSourcePath: 'original.mkv',
      reviewAssetPath: 'review-proxy.mkv',
      indexPath: 'review-proxy-index',
    })).rejects.toThrow('proxy open failed');

    expect(open).toHaveBeenNthCalledWith(3, 'original.mkv', { muted: false, previewBounds: undefined });
    expect(playback.seekTimeUs).toHaveBeenCalledWith(2_000_000n);
    expect(playback.setRate).toHaveBeenCalledWith(0.5);
  });

  it('primes a paused first-frame preview without entering playback mode', async () => {
    const playback = playbackEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exactEngine());
    await adapter.openPlaybackSource('movie.mp4');

    await adapter.primePreview();
    await adapter.getExactFrame(0);

    expect(playback.primePreview).toHaveBeenCalledOnce();
    expect(playback.pause).not.toHaveBeenCalled();
  });

  it('resolves paused playback time to an exact frame and seeks back before resuming', async () => {
    const playback = playbackEngine({
      status: vi.fn(async () => ({
        state: 'paused' as const, sourceGeneration: 1, frameGeneration: 0,
        timeUs: 1_000_000n, lengthUs: 10_000_000n,
      })),
    });
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('movie.mp4');
    await adapter.enableExactReview({ reviewAssetPath: 'movie.mp4', indexPath: 'movie-index' });
    await adapter.play();

    await expect(adapter.enterExactAtCurrentPlaybackTime()).resolves.toBe(frame);
    expect(exact.getFrameAtTime).toHaveBeenCalledWith(1_000_000n);

    await adapter.play();
    expect(playback.seekTimeUs).toHaveBeenCalledWith(frame.reviewTimeUs);
    expect(playback.play).toHaveBeenCalledTimes(2);
  });

  it('uses adjacent access for one frame and direct exact access for a configurable frame count', async () => {
    const playback = playbackEngine();
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('movie.mp4');
    await adapter.enableExactReview({ reviewAssetPath: 'movie.mp4', indexPath: 'movie-index' });
    await adapter.getExactFrame(25);

    await adapter.stepFrames(1, 1);
    await adapter.stepFrames(-1, 7);

    expect(exact.stepAdjacent).toHaveBeenCalledWith(1);
    expect(exact.getExactFrame).toHaveBeenLastCalledWith(18);
  });

  it('clamps adjacent stepping at a source boundary', async () => {
    const playback = playbackEngine();
    const exact = exactEngine();
    exact.stepAdjacent.mockRejectedValue(new BackendError(
      'frame-boundary', 'adjacent step reached the source boundary', true));
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('movie.mp4');
    await adapter.enableExactReview({ reviewAssetPath: 'movie.mp4', indexPath: 'movie-index' });
    await adapter.getExactFrame(25);

    await expect(adapter.stepFrames(1, 1)).resolves.toBe(frame);
  });

  it('captures a canonical frame during playback without pausing or changing resume position', async () => {
    const playback = playbackEngine({
      status: vi.fn(async () => ({
        state: 'playing' as const, sourceGeneration: 1, frameGeneration: 0,
        timeUs: 2_000_000n, lengthUs: 10_000_000n,
      })),
    });
    const exact = exactEngine();
    const adapter = new HybridFramePlaybackAdapter(playback, exact);
    await adapter.openPlaybackSource('movie.mp4');
    await adapter.enableExactReview({ reviewAssetPath: 'movie.mp4', indexPath: 'movie-index' });
    await adapter.play();

    await expect(adapter.captureCurrentFrame()).resolves.toBe(frame);

    expect(playback.pause).not.toHaveBeenCalled();
    expect(exact.getFrameAtTime).toHaveBeenCalledWith(2_000_000n);
    await adapter.play();
    expect(playback.seekTimeUs).not.toHaveBeenCalled();
  });
});

function playbackEngine(overrides: Partial<ReturnType<typeof playbackEngineBase>> = {}) {
  return { ...playbackEngineBase(), ...overrides };
}

function playbackEngineBase() {
  return {
    open: vi.fn(),
    close: vi.fn(),
    primePreview: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setRate: vi.fn(async () => {}),
    seekTimeUs: vi.fn(async () => {}),
    status: vi.fn(async (): Promise<MediaStatus> => ({
      state: 'paused' as const, sourceGeneration: 1, frameGeneration: 0,
      timeUs: 0n, lengthUs: 10_000_000n,
    })),
    setFrameListener: vi.fn(),
    shutdown: vi.fn(async () => {}),
  };
}

function exactEngine() {
  return {
    open: vi.fn(async () => ({
      state: 'exact-ready' as const, sourceGeneration: 1, frameGeneration: 0, numFrames: 100,
    })),
    close: vi.fn(),
    getExactFrame: vi.fn(async () => frame),
    scrubToFrame: vi.fn(async () => frame),
    stepAdjacent: vi.fn(async () => frame),
    getFrameAtTime: vi.fn(async () => frame),
    status: vi.fn(),
    shutdown: vi.fn(async () => {}),
  };
}
