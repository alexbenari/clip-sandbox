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
import type { IFrameReviewDisplayedCapture } from '../../src/app/frame-review-displayed-capture.js';
import { ThumbnailOpaqueId } from '../../src/app/thumbnail-cache-service.js';
import type { IClipCapturesStoreService } from '../../src/app/clip-captures-store-service.js';
import { SavedCaptureStorage } from '../../src/app/capture-storage.js';
import type { IClipExtractionService } from '../../src/business-logic/clip-extraction-service.js';

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
    const capturePositioning = { showFrameAfterCapture: vi.fn(async () => undefined) };
    const captureStore: IClipCapturesStoreService = {
      attach: vi.fn(async () => ({ movieRef: 'capture_12345678',
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
    const session = new GifExtractionSession(service, thumbnailService(), { captureStorage: new SavedCaptureStorage(captureStore), capturePositioning });

    expect(await session.openMovie()).toBe('opened');
    await vi.waitFor(() => expect(capturePositioning.showFrameAfterCapture).toHaveBeenCalledOnce());
    expect(capturePositioning.showFrameAfterCapture).toHaveBeenCalledWith(review, expect.objectContaining({ kind: 'saved-exact-frame', frameIndex: 12 }));
  });

  it('keeps capture loading visible until the selected movie queue attaches', async () => {
    const fingerprint = {
      fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
      sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
      selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
    };
    let finishAttach: (value: { movieRef: string; fingerprint: typeof fingerprint;
      data: { schemaVersion: 1; nextRangeSequence: number; ranges: [] } }) => void = () => undefined;
    const pendingAttach = new Promise<Parameters<typeof finishAttach>[0]>(resolve => { finishAttach = resolve; });
    const captureStore: IClipCapturesStoreService = {
      attach: vi.fn(() => pendingAttach), save: vi.fn(),
    };
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Movie.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => reviewSession()),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { captureStorage: new SavedCaptureStorage(captureStore) });

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
    finishAttach({ movieRef: 'capture_12345678', fingerprint,
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
    const session = new GifExtractionSession(service, thumbnailService(), { captureStorage: new SavedCaptureStorage(captureStore) });

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
    const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn() };
    const session = new GifExtractionSession(service, thumbnailService(), { reporter });

    await session.openMovie();

    expect(reporter.success.mock.calls).toContainEqual(['Reused the prepared review cache for Sample Movie.mkv.']);
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
    const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn() };
    const session = new GifExtractionSession(service, thumbnailService(), { reporter });
    await session.openMovie();
    reporter.progress.mockClear();
    reporter.success.mockClear();

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

    expect(reporter.progress.mock.calls).toEqual([
      ['Checking the prepared review cache for Sample Movie.mkv (32%).'],
      ['Creating the exact-review proxy for Sample Movie.mkv (68%).'],
    ]);
    expect(reporter.success).toHaveBeenCalledWith('Reused the prepared review cache for Sample Movie.mkv.');
  });

  it('reports a movie that cannot be opened in Activity and logs the underlying error', async () => {
    const error = new Error('codec unavailable');
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => { throw error; }),
    };
    const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn() };
    const diagnostics = { logRuntimeError: vi.fn(async () => undefined) };
    const session = new GifExtractionSession(service, thumbnailService(), { reporter, diagnostics });

    await session.openMovie();

    expect(reporter.failure).toHaveBeenCalledWith('The movie could not be opened.');
    expect(diagnostics.logRuntimeError).toHaveBeenCalledWith('The movie could not be opened.', error);
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
    const result = await session.lockRange();
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
    const locked = await session.lockRange();
    if (locked.kind !== 'locked') throw new Error('Range did not lock.');

    await session.extractRange(locked.range.id);

    expect(extractionService.extract).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'Heat.1995' }), expect.any(Function));
    expect(extractionService.saveCollection).toHaveBeenCalledWith(
      'destination_12345678', 'Heat.1995.txt', 'Heat.1995-001.mp4\n');
  });

  it('records the extraction in Activity and tells the publication listener which folder changed', async () => {
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
    const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn() };
    const activityLog = { log: vi.fn() };
    const publications = { onFolderContentsPublished: vi.fn(async () => undefined) };
    const session = new GifExtractionSession(service, thumbnailService(), { extractionService, reporter, activityLog, publications });
    await session.openMovie();
    session.markStart(displayedCapture('exact'));
    session.markEnd(displayedCapture('exact'));
    const locked = await session.lockRange();
    if (locked.kind !== 'locked') throw new Error('Range did not lock.');

    await session.extractRange(locked.range.id);

    expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'information', message: expect.stringContaining('Extracted Heat.1995-001.mp4'),
    }));
    expect(publications.onFolderContentsPublished).toHaveBeenCalledWith('C:\\extraction-tmp');
    expect(reporter.success).toHaveBeenCalledWith(expect.stringContaining('Exact clips were added to'));
    expect(reporter.failure).not.toHaveBeenCalled();
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
    await session.lockRange();

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
    await session.lockRange();
    await vi.waitFor(() => expect(session.snapshot.ranges[0]?.thumbnail.kind).toBe('ready'));

    expect(await session.openMovie()).toBe('opened');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(thumbnails.delete).toHaveBeenCalledWith('thumbnail_00000001');
    expect(session.snapshot.source?.name).toBe('Second.mp4');
    expect(session.snapshot.ranges).toHaveLength(0);
  });
});

// Characterization tests: they record today's behavior before the session is split (split plan, M1).
describe('GifExtractionSession behavior before the split', () => {
  const hash = (frameIndex: number) => frameIndex.toString(16).padStart(16, '0');
  const fingerprint = Object.freeze({
    fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
    sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
    selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
  });

  function frameAt(frameIndex: number, frameInfoHash = hash(frameIndex)) {
    return Object.freeze({
      ...identity, frameIndex, originalFrameIndex: frameIndex,
      pts: BigInt(frameIndex * 1_000), frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash,
    });
  }

  function reviewWithFrames({ hashFor = hash, thumbnailsFail = false } = {}) {
    return Object.assign(reviewSession(), {
      frameIdentity: vi.fn(async (frameIndex: number) => frameAt(frameIndex, hashFor(frameIndex))),
      thumbnailFrame: vi.fn(async (frameIndex: number) => {
        if (thumbnailsFail) throw new Error('Thumbnail frame unavailable.');
        return Object.freeze({
          kind: 'exact-frame' as const, identity: frameAt(frameIndex, hashFor(frameIndex)),
          reviewTimeUs: BigInt(frameIndex * 1_000), sourceGeneration: 1, frameGeneration: 1,
          width: 2, height: 2, sourceWidth: 640, sourceHeight: 360, pixels: new Blob([new Uint8Array(16)]),
        });
      }),
    });
  }

  function movieService(review: IFrameReviewSession = reviewWithFrames()): IFrameReviewService {
    return {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(async () => review),
    };
  }

  function savedEndpoint(frameIndex: number) {
    return { kind: 'exact-frame', frameIndex, frameInfoHash: hash(frameIndex), reviewTimeUs: String(frameIndex * 1_000) };
  }

  function savedStore(ranges: Array<[number, number]>, draft?: [number, number]): IClipCapturesStoreService {
    return {
      attach: vi.fn(async () => ({ movieRef: 'capture_12345678', fingerprint, data: {
        schemaVersion: 1 as const, nextRangeSequence: ranges.length + 1,
        ...(draft ? { draft: { start: savedEndpoint(draft[0]), end: savedEndpoint(draft[1]) } } : {}),
        ranges: ranges.map(([start, end], index) => ({ id: `range-${index + 1}`, start: savedEndpoint(start), end: savedEndpoint(end) })),
      } })),
      save: vi.fn(async () => undefined),
    };
  }

  function exactCapture(frameIndex: number): IFrameReviewDisplayedCapture {
    const frameIdentity = frameAt(frameIndex);
    return Object.freeze({
      point: Object.freeze({ kind: 'exact-frame' as const, identity: frameIdentity }),
      positionUs: BigInt(frameIndex * 1_000),
      sourceGeneration: 1,
      thumbnail: Object.freeze({
        kind: 'exact-frame' as const, identity: frameIdentity, reviewTimeUs: BigInt(frameIndex * 1_000),
        sourceGeneration: 1, frameGeneration: 3, width: 2, height: 2, sourceWidth: 640, sourceHeight: 360,
        pixels: new Blob([new Uint8Array(16)]),
      }),
    });
  }

  async function lockExact(session: GifExtractionSession, start: number, end: number) {
    session.markStart(exactCapture(start));
    session.markEnd(exactCapture(end));
    const locked = await session.lockRange();
    if (locked.kind !== 'locked') throw new Error(`Range ${start}-${end} did not lock: ${locked.kind}`);
    return locked.range;
  }

  function extractionService(extract: IClipExtractionService['extract']): IClipExtractionService {
    return {
      openExtractionDestination: vi.fn(async () => ({ destinationHandle: 'destination_12345678', folderPath: 'C:/extraction-tmp', entries: [] })),
      extract, saveCollection: vi.fn(async () => undefined), cancelCurrent: vi.fn(async () => undefined),
    };
  }

  const createdMedia = (filename: string, warning?: string) => Object.freeze({
    kind: 'created-media' as const, mediaHandle: `media_${filename.replace(/\W/g, '').padEnd(8, '0')}`, filename,
    ...(warning ? { warning } : {}),
  });

  function reporter() { return { progress: vi.fn(), success: vi.fn(), failure: vi.fn() }; }

  async function restoredSession(store: IClipCapturesStoreService, review = reviewWithFrames(), options = {}) {
    const session = new GifExtractionSession(movieService(review), thumbnailService(), { captureStorage: new SavedCaptureStorage(store), ...options });
    await session.openMovie();
    await vi.waitFor(() => expect(session.snapshot.capturesLoading).toBe(false));
    return session;
  }

  it('restores saved ranges and a draft and says so', async () => {
    const session = await restoredSession(savedStore([[2, 4], [10, 12]], [20, 22]));

    expect(session.snapshot.message).toBe('Restored 2 saved ranges and a draft.');
    expect(session.snapshot.ranges.map(range => range.kind)).toEqual(['saved-exact-range', 'saved-exact-range']);
  });

  it('reports once, with a count, the saved start thumbnails it could not recreate', async () => {
    const report = reporter();
    await restoredSession(savedStore([[2, 4], [10, 12]], [20, 22]), reviewWithFrames({ thumbnailsFail: true }), { reporter: report });

    await vi.waitFor(() => expect(report.failure).toHaveBeenCalledWith(
      '3 saved start thumbnails could not be recreated. Retry them from Clips.'));
    expect(report.failure.mock.calls.filter(([message]) => message.includes('thumbnails'))).toHaveLength(1);
  });

  it('without saved captures, allows removing a range while the movie is open but not while another opens', async () => {
    let finishOpening: (review: IFrameReviewSession) => void = () => undefined;
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn()
        .mockResolvedValueOnce(reviewWithFrames())
        .mockReturnValueOnce(new Promise<IFrameReviewSession>(resolve => { finishOpening = resolve; })),
    };
    const session = new GifExtractionSession(service, thumbnailService());
    await session.openMovie();
    const range = await lockExact(session, 3, 6);
    expect(session.canRemoveRange(range.id)).toBe(true);

    const opening = session.openMovie();
    await vi.waitFor(() => expect(session.snapshot.lifecycle).toBe('opening'));

    expect(session.canRemoveRange(range.id)).toBe(false);
    finishOpening(reviewWithFrames());
    await opening;
  });

  it('marks a saved range stale when its frames no longer match, and refuses to refine it', async () => {
    const report = reporter();
    const session = await restoredSession(savedStore([[2, 4]]), reviewWithFrames({ hashFor: () => 'ffffffffffffffff' }), { reporter: report });
    const rangeId = session.snapshot.ranges[0]!.id;

    expect(await session.beginRefinement(rangeId)).toEqual({ kind: 'stopped' });

    expect(report.failure).toHaveBeenCalledWith('Saved frames no longer match this movie. Reopen the original movie.');
    expect(session.snapshot.ranges[0]?.validation).toBe('stale');
    expect(await session.beginRefinement(rangeId)).toEqual({ kind: 'rejected',
      message: 'Saved frames no longer match this movie. Remove the range or reopen the original movie.' });
  });

  it('says that some clips need attention when part of an extraction fails', async () => {
    const report = reporter();
    const extract = vi.fn()
      .mockResolvedValueOnce(createdMedia('Sample Movie-001.mp4'))
      .mockRejectedValueOnce(new Error('Encoder stopped.'));
    const session = new GifExtractionSession(movieService(), thumbnailService(),
      { extractionService: extractionService(extract), reporter: report });
    await session.openMovie();
    await lockExact(session, 3, 6);
    await lockExact(session, 8, 9);

    await session.extractAll();

    expect(session.snapshot.message).toBe('Some clips need attention');
    expect(report.failure).toHaveBeenCalledWith('Some clips could not be completed. Retry them from Clips.');
  });

  it('reports a cancelled extraction and keeps the clips already made', async () => {
    const report = reporter();
    let finishFirst: (media: ReturnType<typeof createdMedia>) => void = () => undefined;
    const extract = vi.fn()
      .mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(createdMedia('Sample Movie-002.mp4'));
    const session = new GifExtractionSession(movieService(), thumbnailService(),
      { extractionService: extractionService(extract), reporter: report });
    await session.openMovie();
    await lockExact(session, 3, 6);
    await lockExact(session, 8, 9);

    const extracting = session.extractAll();
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());
    await session.cancelExtraction();
    finishFirst(createdMedia('Sample Movie-001.mp4'));
    await extracting;

    expect(session.snapshot.message).toBe('Extraction cancelled');
    expect(report.progress).toHaveBeenCalledWith('Extraction stopped. Completed clips were saved.');
  });

  it('reports each provenance warning once, however many extractions follow', async () => {
    const report = reporter();
    const extract = vi.fn()
      .mockResolvedValueOnce(createdMedia('Sample Movie-001.mp4', 'Source details could not be written into the clip.'))
      .mockResolvedValueOnce(createdMedia('Sample Movie-002.mp4'));
    const session = new GifExtractionSession(movieService(), thumbnailService(),
      { extractionService: extractionService(extract), reporter: report });
    await session.openMovie();
    const first = await lockExact(session, 3, 6);
    const second = await lockExact(session, 8, 9);

    await session.extractRange(first.id);
    await session.extractRange(second.id);

    expect(report.success.mock.calls.filter(([message]) => message === 'Source details could not be written into the clip.'))
      .toHaveLength(1);
  });

  it('checks saved ranges first, then extracts every ready range', async () => {
    const extract = vi.fn()
      .mockResolvedValueOnce(createdMedia('Sample Movie-001.mp4'))
      .mockResolvedValueOnce(createdMedia('Sample Movie-002.mp4'));
    const review = reviewWithFrames();
    const session = await restoredSession(savedStore([[2, 4], [10, 12]]), review, { extractionService: extractionService(extract) });

    await session.extractAll();

    expect(review.frameIdentity).toHaveBeenCalledWith(2);
    expect(review.frameIdentity).toHaveBeenCalledWith(12);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(session.snapshot.ranges.map(range => range.extraction?.kind)).toEqual(['completed', 'completed']);
  });

  it('with a destination set, does not extract a range whose refinement is not locked yet', async () => {
    const session = new GifExtractionSession(movieService(), thumbnailService(),
      { extractionService: extractionService(vi.fn()) });
    await session.openMovie();
    const range = await lockExact(session, 3, 6);
    session.setExtractionDestination({ kind: 'folder', folderPath: 'C:/pipelines/camera' });
    expect(session.canExtractRange(range.id)).toBe(true);

    expect((await session.beginRefinement(range.id)).kind).toBe('started');

    expect(session.canExtractRange(range.id)).toBe(false);
  });

  it('previews the draft, then the selected locked range, and advances the revision only on a real change', async () => {
    const session = new GifExtractionSession(movieService(), thumbnailService());
    await session.openMovie();
    session.markStart(exactCapture(3));
    session.markEnd(exactCapture(6));
    expect(session.snapshot.previewTarget).toMatchObject({ kind: 'draft', startFrameIndex: 3, endFrameIndex: 6 });
    await session.lockRange();
    const first = session.snapshot.ranges[0]!;
    await lockExact(session, 8, 9);
    expect(session.snapshot.previewTarget).toMatchObject({ kind: 'locked', startFrameIndex: 8, endFrameIndex: 9 });

    const before = session.snapshot.previewRevision;
    session.selectRange(first.id);
    const afterSelect = session.snapshot.previewRevision;
    session.selectRange(first.id);

    expect(session.snapshot.previewTarget).toMatchObject({ kind: 'locked', rangeId: first.id, startFrameIndex: 3 });
    expect(afterSelect).toBeGreaterThan(before);
    expect(session.snapshot.previewRevision).toBe(afterSelect);
  });

  it('refuses capture while a movie opens and while saved captures load', async () => {
    let finishAttach: (value: unknown) => void = () => undefined;
    const store: IClipCapturesStoreService = { attach: vi.fn(() => new Promise(resolve => { finishAttach = resolve; })) as never, save: vi.fn() };
    let finishOpening: (review: IFrameReviewSession) => void = () => undefined;
    const service: IFrameReviewService = {
      chooseSource: vi.fn(async () => ({ name: 'Sample Movie.mkv', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') })),
      open: vi.fn(() => new Promise<IFrameReviewSession>(resolve => { finishOpening = resolve; })),
    };
    const session = new GifExtractionSession(service, thumbnailService(), { captureStorage: new SavedCaptureStorage(store) });

    const opening = session.openMovie();
    await vi.waitFor(() => expect(session.snapshot.lifecycle).toBe('opening'));
    expect(session.markStart(exactCapture(3))).toEqual({ kind: 'rejected', message: 'Wait for the movie to finish opening.' });
    finishOpening(reviewWithFrames());
    await opening;

    expect(session.markStart(exactCapture(3))).toEqual({ kind: 'rejected', message: 'Saved captures are still loading.' });
    finishAttach({ movieRef: 'capture_12345678', fingerprint, data: { schemaVersion: 1, nextRangeSequence: 1, ranges: [] } });
  });

  it('refuses to change the extraction destination while a batch runs', async () => {
    let finish: (media: ReturnType<typeof createdMedia>) => void = () => undefined;
    const extract = vi.fn(() => new Promise<ReturnType<typeof createdMedia>>(resolve => { finish = resolve; }));
    const session = new GifExtractionSession(movieService(), thumbnailService(),
      { extractionService: extractionService(extract) });
    await session.openMovie();
    const range = await lockExact(session, 3, 6);

    const extracting = session.extractRange(range.id);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());

    expect(() => session.setExtractionDestination({ kind: 'folder', folderPath: 'C:/pipelines/camera' }))
      .toThrow('Wait for the current extraction to finish.');
    finish(createdMedia('Sample Movie-001.mp4'));
    await extracting;
  });

  it('releases the movie and its thumbnails when disposed, then neither writes nor publishes', async () => {
    const store = savedStore([]);
    const review = reviewWithFrames();
    const thumbnails = thumbnailService();
    const cancelCurrent = vi.fn(async () => undefined);
    const session = new GifExtractionSession(movieService(review), thumbnails, {
      captureStorage: new SavedCaptureStorage(store), extractionService: { ...extractionService(vi.fn()), cancelCurrent },
    });
    await session.openMovie();
    await vi.waitFor(() => expect(session.snapshot.capturesLoading).toBe(false));
    session.markStart(exactCapture(3));
    const listener = vi.fn();
    session.subscribe(listener);
    listener.mockClear();
    vi.mocked(store.save).mockClear();

    await session.dispose();
    session.markEnd(exactCapture(6));

    expect(store.save).not.toHaveBeenCalled();
    expect(review.dispose).toHaveBeenCalledOnce();
    expect(thumbnails.dispose).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });

  it('checks a restored draft\'s saved frames itself when asked to lock it', async () => {
    const review = reviewWithFrames();
    const session = await restoredSession(savedStore([], [20, 22]), review);

    const locked = await session.lockRange();

    expect(locked.kind).toBe('locked');
    expect(review.frameIdentity).toHaveBeenCalledWith(20);
    expect(session.snapshot.ranges).toHaveLength(1);
  });

  it('refuses to lock a restored draft whose frames no longer match, with the reason', async () => {
    const report = reporter();
    const session = await restoredSession(savedStore([], [20, 22]), reviewWithFrames({ hashFor: () => 'ffffffffffffffff' }), { reporter: report });

    expect(await session.lockRange()).toEqual({ kind: 'rejected',
      message: 'Saved draft frames no longer match this movie. Mark new endpoints before locking.' });
    expect(session.snapshot.ranges).toHaveLength(0);
  });

  it('checks a restored range\'s saved frames itself when asked to refine it', async () => {
    const review = reviewWithFrames();
    const session = await restoredSession(savedStore([[2, 4]]), review);

    const started = await session.beginRefinement(session.snapshot.ranges[0]!.id);

    expect(started.kind).toBe('started');
    expect(review.frameIdentity).toHaveBeenCalledWith(4);
  });

  it('stops quietly when refining a restored range whose frames no longer match; the check already said why', async () => {
    const report = reporter();
    const session = await restoredSession(savedStore([[2, 4]]), reviewWithFrames({ hashFor: () => 'ffffffffffffffff' }), { reporter: report });

    expect(await session.beginRefinement(session.snapshot.ranges[0]!.id)).toEqual({ kind: 'stopped' });
    expect(report.failure).toHaveBeenCalledWith('Saved frames no longer match this movie. Reopen the original movie.');
  });
});