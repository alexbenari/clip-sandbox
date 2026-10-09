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
import type { IClipCapturesStoreService } from '../../src/app/clip-captures-store-service.js';
import type { IClipExtractionService } from '../../src/frame-review/clip-extraction-api.js';

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
    play: vi.fn(), pause: vi.fn(), seekPlayback: vi.fn(), enterFrameScrub: vi.fn(),
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
  it('positions an explicitly opened movie after its last saved capture', async () => {
    const review = reviewSession();
    const onRestoredCaptures = vi.fn(async () => undefined);
    const captureStore: IClipCapturesStoreService = {
      attach: vi.fn(async () => ({ kind: 'attached' as const, movieRef: 'capture_12345678',
        fingerprint: {
          fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
          sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
          selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
        },
        data: { schemaVersion: 1 as const, nextRangeSequence: 3, ranges: [
          { id: 'range-1', start: { kind: 'exact-frame', frameIndex: 2, frameInfoHash: '0000000000000002', reviewTimeUs: '20000' },
            end: { kind: 'exact-frame', frameIndex: 4, frameInfoHash: '0000000000000004', reviewTimeUs: '40000' } },
          { id: 'range-2', start: { kind: 'exact-frame', frameIndex: 10, frameInfoHash: '0000000000000010', reviewTimeUs: '100000' },
            end: { kind: 'exact-frame', frameIndex: 12, frameInfoHash: '0000000000000012', reviewTimeUs: '120000' } },
        ] },
      })), save: vi.fn(),
    };
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Movie.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => review),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { captureStore, onRestoredCaptures });

    expect(await session.openMovie()).toBe('opened');
    await vi.waitFor(() => expect(onRestoredCaptures).toHaveBeenCalledOnce());
    expect(onRestoredCaptures).toHaveBeenCalledWith(review, expect.objectContaining({ kind: 'saved-exact-frame', frameIndex: 12 }));
  });

  it('keeps capture loading visible until the selected movie queue attaches', async () => {
    const fingerprint = {
      fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
      sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
      selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
    };
    let finishAttach: (value: { kind: 'attached'; movieRef: string; fingerprint: typeof fingerprint;
      data: { schemaVersion: 1; nextRangeSequence: number; ranges: [] } }) => void = () => undefined;
    const pendingAttach = new Promise<Parameters<typeof finishAttach>[0]>(resolve => { finishAttach = resolve; });
    const captureStore: IClipCapturesStoreService = {
      attach: vi.fn(() => pendingAttach), save: vi.fn(),
    };
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Movie.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => reviewSession()),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { captureStore });

    expect(await session.openMovie()).toBe('opened');
    expect(session.snapshot.capturesLoading).toBe(true);
    const loaded = new Promise<void>(resolve => {
      const unsubscribe = session.subscribe(snapshot => {
        if (snapshot.source?.name === 'Movie.mp4' && !snapshot.capturesLoading) {
          unsubscribe();
          resolve();
        }
      });
    });
    finishAttach({ kind: 'attached', movieRef: 'capture_12345678', fingerprint,
      data: { schemaVersion: 1, nextRangeSequence: 1, ranges: [] } });
    await loaded;
    expect(session.snapshot.capturesLoading).toBe(false);
  });

  it('stops reporting capture loading when exact preparation fails', async () => {
    let publishReview: (event: FrameReviewEvent) => void = () => undefined;
    const review = {
      ...reviewSession(),
      state: () => FrameReviewState.create('indexing', 1),
      subscribe: vi.fn((listener: (event: FrameReviewEvent) => void) => {
        publishReview = listener;
        return () => undefined;
      }),
    } as unknown as IFrameReviewSession;
    const captureStore: IClipCapturesStoreService = {
      attach: vi.fn(), save: vi.fn(),
    };
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Movie.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => review),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { captureStore });

    await session.openMovie();
    expect(session.snapshot.capturesLoading).toBe(true);
    publishReview({ type: 'state', state: FrameReviewState.create('failed', 1, { message: 'Index unavailable' }) });
    expect(session.snapshot.capturesLoading).toBe(false);
  });

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

  it('names the extraction collection after the full movie stem when the stem contains dots', async () => {
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Heat.1995.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => reviewSession()),
    };
    const extractionService: IClipExtractionService = {
      openExtractionDestination: vi.fn(async () => ({
        destinationHandle: 'destination_12345678', folderPath: 'C:\\extraction-tmp', entries: [],
      })),
      extract: vi.fn(async () => ({ kind: 'created-media' as const, mediaHandle: 'media_12345678', filename: 'Heat.1995-001.mp4' })),
      saveCollection: vi.fn(async () => undefined),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { extractionService });
    await session.openMovie();
    session.markStart(displayedCapture('exact'));
    session.markEnd(displayedCapture('exact'));
    const locked = session.lockRange();
    if (locked.kind !== 'locked') throw new Error('Range did not lock.');

    await session.extractRange(locked.range.id);

    expect(extractionService.extract).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'Heat.1995' }), expect.any(Function));
    expect(extractionService.saveCollection).toHaveBeenCalledWith(
      'destination_12345678', 'Heat.1995.txt', 'Heat.1995-001.mp4\n');
  });

  it('switches movies with locked captures because they belong to the original movie', async () => {
    const first = reviewSession();
    const second = reviewSession();
    let finishOpening: (review: IFrameReviewSession) => void = () => undefined;
    const candidate = new Promise<IFrameReviewSession>(resolve => { finishOpening = resolve; });
    const chooseSource = vi.fn()
      .mockResolvedValueOnce({ name: 'First.mp4', sourceHandle: 'source_12345678' })
      .mockResolvedValueOnce({ name: 'Second.mp4', sourceHandle: 'source_87654321' });
    const service: IFrameReviewService = { chooseSource, open: vi.fn().mockResolvedValueOnce(first).mockReturnValueOnce(candidate) };
    const session = new GifExtractionSession(service, thumbnailService());
    await session.openMovie();
    session.markStart(displayedCapture('timestamp', 10n));
    session.markEnd(displayedCapture('timestamp', 20n));
    session.lockRange();

    const opening = session.openMovie();
    await vi.waitFor(() => expect(session.snapshot.lifecycle).toBe('opening'));
    expect(session.snapshot.source?.name).toBe('First.mp4');
    expect(session.snapshot.ranges).toHaveLength(1);
    expect(session.snapshot.capturesLoading).toBe(false);
    expect(session.snapshot.captureAvailable).toBe(false);
    finishOpening(second);
    const result = await opening;

    expect(result).toBe('opened');
    expect(session.snapshot.source?.name).toBe('Second.mp4');
    expect(session.snapshot.ranges).toHaveLength(0);
    expect(service.open).toHaveBeenCalledTimes(2);
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

    expect(await session.openMovie()).toBe('opened');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(thumbnails.delete).toHaveBeenCalledWith('thumbnail_00000001');
    expect(session.snapshot.source?.name).toBe('Second.mp4');
    expect(session.snapshot.ranges).toHaveLength(0);
  });
});
