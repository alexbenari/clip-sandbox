import { describe, expect, it, vi } from 'vitest';

import type {
  FrameReviewEvent,
  FrameReviewDisplayFrame,
  IFrameReviewService,
  IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { GifExtractionSession, type IThumbnailCacheService } from '../../src/app/gif-extraction-session.js';
import type { IFrameReviewDisplayedCapture } from '../../src/ui/frame-review-player-control.js';
import { ThumbnailOpaqueId } from '../../src/app/thumbnail-cache-service.js';

const identity = Object.freeze({
  frameIndex: 5, originalFrameIndex: 5, pts: 5_000n, duration: 1_000n,
  timebaseNumerator: 1n, timebaseDenominator: 1_000n,
  frameInfoPts: 5_000n, frameInfoHash: 'frame-5',
});

function reviewSession(): IFrameReviewSession {
  const current = FrameReviewState.create('exact-ready', 1, {
    playbackDurationUs: 2_000_000n,
    preparedReview: Object.freeze({
      cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 60,
      sourceWidth: 640, sourceHeight: 360, durationUs: 2_000_000n,
    }),
  });
  return {
    id: 'session_12345678', state: () => current,
    play: vi.fn(), pause: vi.fn(), setRate: vi.fn(), seekPlayback: vi.fn(), enterFrameScrub: vi.fn(),
    scrubToFrame: vi.fn(), stepAdjacent: vi.fn(), pressAdjacent: vi.fn(), releaseAdjacent: vi.fn(),
    captureCurrentPoint: vi.fn(), subscribe: vi.fn(() => () => undefined), dispose: vi.fn(async () => undefined),
  } as unknown as IFrameReviewSession;
}

function displayedCapture(kind: 'exact' | 'timestamp', timestampUs = 500_000n): IFrameReviewDisplayedCapture {
  const common = {
    sourceGeneration: 1, frameGeneration: 3, width: 2, height: 2,
    sourceWidth: 640, sourceHeight: 360, pixels: new Blob([new Uint8Array(16)]),
  };
  const frame: FrameReviewDisplayFrame = kind === 'exact'
    ? Object.freeze({ ...common, kind: 'exact-frame', identity, reviewTimeUs: timestampUs })
    : Object.freeze({ ...common, kind: 'playback-frame', playbackTimestampUs: timestampUs });
  return Object.freeze({
    point: kind === 'exact'
      ? Object.freeze({ kind: 'exact-frame', identity })
      : Object.freeze({ kind: 'playback-timestamp', timestampUs }),
    positionUs: timestampUs,
    sourceGeneration: 1,
    thumbnail: frame,
  });
}

function thumbnailService(): IThumbnailCacheService {
  let count = 0;
  return {
    save: vi.fn(async () => {
      count += 1;
      return Object.freeze({ id: ThumbnailOpaqueId.parse(`thumbnail_${count.toString().padStart(8, '0')}`), url: `blob:thumbnail-${count}` });
    }),
    load: vi.fn(),
    delete: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

describe('GifExtractionSession', () => {
  it('announces cache reuse when the opened review is already exact-ready', async () => {
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => reviewSession()),
    };
    const onSuccess = vi.fn();
    const session = new GifExtractionSession(service, thumbnailService(), { onSuccess });

    await session.openMovie();

    expect(onSuccess.mock.calls).toContainEqual(['Reused the prepared review cache for Sample Movie.mkv.']);
  });

  it('reports exact-review preparation phases and distinguishes a prepared cache reuse', async () => {
    let listener: ((event: FrameReviewEvent) => void) | null = null;
    const current = FrameReviewState.create('playback-ready', 1, { playbackDurationUs: 2_000_000n });
    const review = {
      ...reviewSession(),
      state: () => current,
      subscribe: vi.fn((next: (event: FrameReviewEvent) => void) => {
        listener = next;
        return () => { listener = null; };
      }),
    } as unknown as IFrameReviewSession;
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => review),
    };
    const onProgress = vi.fn();
    const onSuccess = vi.fn();
    const session = new GifExtractionSession(service, thumbnailService(), { onProgress, onSuccess });
    await session.openMovie();
    onProgress.mockClear();
    onSuccess.mockClear();

    listener?.({
      type: 'state',
      state: FrameReviewState.create('cache-validation', 1, { playbackDurationUs: 2_000_000n, progressPercent: 32 }),
    });
    listener?.({
      type: 'state',
      state: FrameReviewState.create('proxy-encoding', 1, { playbackDurationUs: 2_000_000n, progressPercent: 68 }),
    });
    listener?.({
      type: 'state',
      state: FrameReviewState.create('exact-ready', 1, {
        playbackDurationUs: 2_000_000n,
        preparedReview: Object.freeze({
          cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 60,
          sourceWidth: 640, sourceHeight: 360, durationUs: 2_000_000n,
        }),
      }),
    });

    expect(onProgress.mock.calls).toEqual([
      ['Checking the prepared review cache for Sample Movie.mkv (32%).'],
      ['Creating the exact-review proxy for Sample Movie.mkv (68%).'],
    ]);
    expect(onSuccess).toHaveBeenCalledWith('Reused the prepared review cache for Sample Movie.mkv.');
  });

  it('opens a selected movie, captures mixed endpoints, locks, and retains its start thumbnail', async () => {
    const review = reviewSession();
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => review),
    };
    const thumbnails = thumbnailService();
    const session = new GifExtractionSession(service, thumbnails);

    expect(await session.openMovie()).toBe('opened');
    session.markStart(displayedCapture('timestamp', 400_000n));
    session.markEnd(displayedCapture('exact', 900_000n));
    const result = session.lockRange();
    await vi.waitFor(() => expect(session.snapshot.ranges[0]?.thumbnail.kind).toBe('ready'));

    expect(result).toMatchObject({ kind: 'locked', range: { kind: 'needs-exact-frames' } });
    expect(session.snapshot).toMatchObject({
      source: { name: 'Sample Movie.mkv' },
      ranges: [{ kind: 'needs-exact-frames', thumbnail: { kind: 'ready', url: 'blob:thumbnail-1' } }],
    });
    expect(session.reviewSession).toBe(review);
  });

  it('keeps the current source and ranges when replacement is declined', async () => {
    const review = reviewSession();
    const chooseSource = vi.fn()
      .mockResolvedValueOnce({ name: 'First.mp4', sourceHandle: 'source_12345678' })
      .mockResolvedValueOnce({ name: 'Second.mp4', sourceHandle: 'source_87654321' });
    const service: IFrameReviewService = { chooseSource, open: vi.fn(async () => review) };
    const session = new GifExtractionSession(service, thumbnailService());
    await session.openMovie();
    session.markStart(displayedCapture('timestamp', 10n));
    session.markEnd(displayedCapture('timestamp', 20n));
    session.lockRange();

    const result = await session.openMovie(async () => false);

    expect(result).toBe('kept-current');
    expect(session.snapshot.source?.name).toBe('First.mp4');
    expect(session.snapshot.ranges).toHaveLength(1);
    expect(service.open).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous lease and thumbnails only after a confirmed replacement opens', async () => {
    const first = reviewSession();
    const second = reviewSession();
    const service: IFrameReviewService = {
      chooseSource: vi.fn()
        .mockResolvedValueOnce({ name: 'First.mp4', sourceHandle: 'source_12345678' })
        .mockResolvedValueOnce({ name: 'Second.mp4', sourceHandle: 'source_87654321' }),
      open: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    };
    const thumbnails = thumbnailService();
    const session = new GifExtractionSession(service, thumbnails);
    await session.openMovie();
    session.markStart(displayedCapture('timestamp', 10n));
    session.markEnd(displayedCapture('timestamp', 20n));
    session.lockRange();
    await vi.waitFor(() => expect(session.snapshot.ranges[0]?.thumbnail.kind).toBe('ready'));

    expect(await session.openMovie(async () => true)).toBe('opened');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(thumbnails.delete).toHaveBeenCalledWith('thumbnail_00000001');
    expect(session.snapshot.source?.name).toBe('Second.mp4');
    expect(session.snapshot.ranges).toHaveLength(0);
  });
});
