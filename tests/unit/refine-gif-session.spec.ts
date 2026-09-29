import { describe, expect, it, vi } from 'vitest';

import { GifExtractionSession, type IThumbnailCacheService } from '../../src/app/gif-extraction-session.js';
import { ThumbnailOpaqueId } from '../../src/app/thumbnail-cache-service.js';
import type { IClipExtractionService } from '../../src/frame-review/clip-extraction-api.js';
import type {
  FrameReviewDisplayFrame,
  IFrameReviewService,
  IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import type { IFrameReviewDisplayedCapture } from '../../src/ui/frame-review-player-control.js';

const identity = (frameIndex: number) => Object.freeze({
  frameIndex,
  originalFrameIndex: frameIndex,
  pts: BigInt(frameIndex * 1_000),
  duration: 1_000n,
  timebaseNumerator: 1n,
  timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex * 1_000),
  frameInfoHash: `frame-${frameIndex}`,
});

function reviewSession(sourceGeneration = 1): IFrameReviewSession {
  const current = FrameReviewState.create('exact-ready', sourceGeneration, {
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

function displayedCapture(
  kind: 'exact' | 'timestamp',
  positionUs: bigint,
  frameIndex = Number(positionUs / 10_000n),
  sourceGeneration = 1,
): IFrameReviewDisplayedCapture {
  const common = {
    sourceGeneration, frameGeneration: frameIndex + 1, width: 2, height: 2,
    sourceWidth: 640, sourceHeight: 360, pixels: new Blob([new Uint8Array(16)]),
  };
  const frame: FrameReviewDisplayFrame = kind === 'exact'
    ? Object.freeze({ ...common, kind: 'exact-frame', identity: identity(frameIndex), reviewTimeUs: positionUs })
    : Object.freeze({ ...common, kind: 'playback-frame', playbackTimestampUs: positionUs });
  return Object.freeze({
    point: kind === 'exact'
      ? Object.freeze({ kind: 'exact-frame', identity: identity(frameIndex) })
      : Object.freeze({ kind: 'playback-timestamp', timestampUs: positionUs }),
    positionUs,
    sourceGeneration,
    thumbnail: frame,
  });
}

function thumbnailService(): IThumbnailCacheService {
  let count = 0;
  return {
    save: vi.fn(async () => {
      count += 1;
      return Object.freeze({
        id: ThumbnailOpaqueId.parse(`thumbnail_${count.toString().padStart(8, '0')}`),
        url: `blob:thumbnail-${count}`,
      });
    }),
    load: vi.fn(),
    delete: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

async function openSession(thumbnails = thumbnailService(), extractionService?: IClipExtractionService): Promise<{
  session: GifExtractionSession;
  service: IFrameReviewService;
  thumbnails: IThumbnailCacheService;
}> {
  const service: IFrameReviewService = {
    chooseSource: vi.fn(async () => ({
      name: 'Feature.mp4',
      sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
    })),
    open: vi.fn(async () => reviewSession()),
  };
  const session = new GifExtractionSession(service, thumbnails, { extractionService });
  expect(await session.openMovie()).toBe('opened');
  return { session, service, thumbnails };
}

function extractionService(): IClipExtractionService {
  let mediaSequence = 0;
  return {
    openExtractionDestination: vi.fn(async () => ({
      destinationHandle: 'destination_12345678', folderPath: 'C:\\extraction-tmp', entries: [],
    })),
    extract: vi.fn(async () => {
      mediaSequence += 1;
      return { kind: 'created-media' as const, mediaHandle: `media_1234567${mediaSequence}`,
        filename: `Feature-${String(mediaSequence).padStart(3, '0')}.mp4` };
    }),
    saveCollection: vi.fn(async () => undefined),
  };
}

function lockTimestampRange(session: GifExtractionSession, startUs = 100_000n, endUs = 300_000n) {
  session.markStart(displayedCapture('timestamp', startUs));
  session.markEnd(displayedCapture('timestamp', endUs));
  const locked = session.lockRange();
  if (locked.kind !== 'locked') throw new Error(locked.kind === 'rejected' ? locked.message : 'Range did not lock.');
  return locked.range;
}

function lockExactRange(session: GifExtractionSession, startFrame = 10, endFrame = 30) {
  session.markStart(displayedCapture('exact', BigInt(startFrame * 10_000), startFrame));
  session.markEnd(displayedCapture('exact', BigInt(endFrame * 10_000), endFrame));
  const locked = session.lockRange();
  if (locked.kind !== 'locked') throw new Error(locked.kind === 'rejected' ? locked.message : 'Range did not lock.');
  return locked.range;
}

describe('RefineGifSession', () => {
  it('leaves the other captures available when the active refinement is removed', async () => {
    const { session } = await openSession();
    const first = lockExactRange(session, 10, 20);
    const second = lockExactRange(session, 30, 40);
    expect(session.beginRefinement(first.id).kind).toBe('started');

    expect(session.removeRange(first.id)).toBe(true);

    expect(session.snapshot.refinement).toBeNull();
    expect(session.snapshot.ranges.map(range => range.id)).toEqual([second.id]);
    expect(session.beginRefinement(second.id).kind).toBe('started');
  });

  it('replaces an unfinished refinement when another capture is selected', async () => {
    const { session } = await openSession();
    const first = lockExactRange(session, 10, 20);
    const second = lockExactRange(session, 30, 40);
    const firstRefinement = session.beginRefinement(first.id);
    if (firstRefinement.kind !== 'started') throw new Error(firstRefinement.message);
    firstRefinement.session.markStart(displayedCapture('exact', 120_000n, 12));

    const replacement = session.beginRefinement(second.id);

    expect(replacement).toMatchObject({ kind: 'started' });
    expect(session.snapshot.refinement?.rangeId).toBe(second.id);
    expect(session.snapshot.ranges.map(range => range.id)).toEqual([first.id, second.id]);
    expect(session.snapshot.ranges[0]?.start).toMatchObject({ identity: { frameIndex: 10 } });
    expect(firstRefinement.session.commit()).toMatchObject({ kind: 'rejected' });
  });

  it('opens an exact capture, discards staged edits on Back, then replaces the same panel entry on Lock', async () => {
    const { session } = await openSession();
    const first = lockExactRange(session);
    const second = lockExactRange(session, 40, 50);
    const begin = session.beginRefinement(first.id);
    if (begin.kind !== 'started') throw new Error(begin.message);
    expect(begin.session.snapshot).toMatchObject({ focusedEndpoint: 'start', canCommit: true });
    begin.session.markStart(displayedCapture('exact', 120_000n, 12));
    session.abandonRefinement();
    expect(session.snapshot.ranges[0]?.start).toMatchObject({ identity: { frameIndex: 10 } });

    const again = session.beginRefinement(first.id);
    if (again.kind !== 'started') throw new Error(again.message);
    again.session.markStart(displayedCapture('exact', 120_000n, 12));
    expect(again.session.commit()).toMatchObject({ kind: 'committed', range: { id: first.id } });
    expect(session.snapshot.ranges.map(range => range.id)).toEqual([first.id, second.id]);
    expect(session.snapshot.ranges[0]?.start).toMatchObject({ identity: { frameIndex: 12 } });
  });

  it('preserves an unchanged completed extraction and makes a changed exact revision extractable again', async () => {
    const extraction = extractionService();
    const { session } = await openSession(thumbnailService(), extraction);
    const captured = lockExactRange(session);
    await session.extractRange(captured.id);
    expect(session.snapshot.ranges[0]?.extraction).toMatchObject({ kind: 'completed',
      media: { filename: 'Feature-001.mp4' } });

    const unchanged = session.beginRefinement(captured.id);
    if (unchanged.kind !== 'started') throw new Error(unchanged.message);
    expect(unchanged.session.commit()).toMatchObject({ kind: 'committed', message: expect.stringContaining('unchanged') });
    expect(session.canExtractRange(captured.id)).toBe(false);
    expect(extraction.extract).toHaveBeenCalledOnce();

    const revised = session.beginRefinement(captured.id);
    if (revised.kind !== 'started') throw new Error(revised.message);
    revised.session.markEnd(displayedCapture('exact', 320_000n, 32));
    revised.session.markEnd(displayedCapture('exact', 320_000n, 32));
    expect(revised.session.commit()).toMatchObject({ kind: 'committed',
      message: expect.stringContaining('earlier clip remains saved') });
    expect(session.snapshot.ranges).toHaveLength(1);
    expect(session.snapshot.ranges[0]?.extraction).toEqual({ kind: 'pending' });
    expect(session.canExtractRange(captured.id)).toBe(true);
    expect(extraction.extract).toHaveBeenCalledOnce();
    await session.extractRange(captured.id);
    expect(extraction.extract).toHaveBeenCalledTimes(2);
    expect(session.snapshot.ranges[0]?.extraction).toMatchObject({ kind: 'completed',
      media: { filename: 'Feature-002.mp4' } });
  });

  it('keeps a failed publication attached to its encoded range until retry', async () => {
    const extraction = extractionService();
    vi.mocked(extraction.saveCollection).mockRejectedValueOnce(new Error('disk busy'));
    const { session } = await openSession(thumbnailService(), extraction);
    const captured = lockExactRange(session);
    await session.extractRange(captured.id);
    expect(session.snapshot.ranges[0]?.extraction).toMatchObject({ kind: 'publication-failed' });
    const refine = session.beginRefinement(captured.id);
    if (refine.kind !== 'started') throw new Error(refine.message);
    refine.session.markEnd(displayedCapture('exact', 320_000n, 32));
    refine.session.markEnd(displayedCapture('exact', 320_000n, 32));
    expect(refine.session.commit()).toMatchObject({ kind: 'rejected', message: expect.stringContaining('Retry') });
    expect(session.snapshot.ranges[0]?.end).toMatchObject({ identity: { frameIndex: 30 } });
    await session.retryExtractionPublication(captured.id);
    expect(refine.session.commit()).toMatchObject({ kind: 'committed' });
    expect(session.canExtractRange(captured.id)).toBe(true);
  });
  it('stages exact endpoints one at a time and atomically preserves range identity and order', async () => {
    const { session, thumbnails } = await openSession();
    const first = lockTimestampRange(session);
    const second = lockTimestampRange(session, 500_000n, 700_000n);
    await vi.waitFor(() => expect(session.snapshot.ranges).toHaveLength(2));

    const begin = session.beginRefinement(first.id);
    expect(begin.kind).toBe('started');
    if (begin.kind !== 'started') return;
    expect(begin.session.snapshot).toMatchObject({ focusedEndpoint: 'start', canCommit: false });

    expect(begin.session.markEnd(displayedCapture('exact', 300_000n, 30))).toMatchObject({
      kind: 'staged', endpoint: 'end',
    });
    expect(begin.session.snapshot.end.kind).toBe('exact-frame');
    begin.session.markStart(displayedCapture('exact', 120_000n, 12));
    begin.session.markStart(displayedCapture('exact', 120_000n, 12));
    begin.session.markEnd(displayedCapture('exact', 320_000n, 32));
    expect(begin.session.snapshot.canCommit).toBe(true);

    expect(begin.session.commit()).toMatchObject({ kind: 'committed', range: { id: first.id } });
    await vi.waitFor(() => expect(session.snapshot.ranges[0]?.thumbnail).toMatchObject({
      kind: 'ready', url: 'blob:thumbnail-3',
    }));
    expect(session.snapshot.ranges.map(range => range.id)).toEqual([first.id, second.id]);
    expect(session.snapshot.ranges[0]).toMatchObject({
      kind: 'ready-to-extract',
      start: { identity: { frameIndex: 12 } },
      end: { identity: { frameIndex: 32 } },
    });
    expect(thumbnails.delete).toHaveBeenCalledWith('thumbnail_00000001');
  });

  it('rejects a reversed exact pair and leaves the original inexact range untouched until A', async () => {
    const { session } = await openSession();
    const original = lockTimestampRange(session);
    const begin = session.beginRefinement(original.id);
    if (begin.kind !== 'started') throw new Error(begin.message);

    begin.session.markStart(displayedCapture('exact', 400_000n, 40));
    begin.session.markEnd(displayedCapture('exact', 200_000n, 20));

    expect(begin.session.snapshot.canCommit).toBe(false);
    expect(begin.session.commit()).toEqual({ kind: 'rejected', message: 'The end must not precede the start.' });
    expect(session.snapshot.ranges[0]).toMatchObject({
      kind: 'needs-exact-frames', start: { timestampUs: 100_000n }, end: { timestampUs: 300_000n },
    });
    session.abandonRefinement();
    expect(session.snapshot.ranges[0]).toMatchObject({ kind: 'needs-exact-frames' });
  });

  it('focuses the only timestamp endpoint for a mixed range and finds the next inexact range in queue order', async () => {
    const { session } = await openSession();
    session.markStart(displayedCapture('exact', 100_000n, 10));
    session.markEnd(displayedCapture('timestamp', 300_000n));
    const mixed = session.lockRange();
    if (mixed.kind !== 'locked') throw new Error(mixed.kind === 'rejected' ? mixed.message : 'Range did not lock.');
    const next = lockTimestampRange(session, 500_000n, 700_000n);
    const begin = session.beginRefinement(mixed.range.id);
    if (begin.kind !== 'started') throw new Error(begin.message);

    expect(begin.session.snapshot).toMatchObject({ focusedEndpoint: 'start', seekTimeUs: 100_000n });
    begin.session.markEnd(displayedCapture('exact', 300_000n, 30));
    expect(begin.session.commit()).toMatchObject({ kind: 'committed' });
    expect(begin.session.snapshot.nextInexactRangeId).toBe(next.id);
  });

  it('invalidates refinement when its range is removed or its source generation changes', async () => {
    const { session, service } = await openSession();
    const range = lockTimestampRange(session);
    const removed = session.beginRefinement(range.id);
    if (removed.kind !== 'started') throw new Error(removed.message);
    session.removeRange(range.id);
    expect(removed.session.commit()).toMatchObject({ kind: 'rejected', message: expect.stringContaining('removed') });

    const replacement = lockTimestampRange(session, 500_000n, 700_000n);
    const stale = session.beginRefinement(replacement.id);
    if (stale.kind !== 'started') throw new Error(stale.message);
    vi.mocked(service.chooseSource).mockResolvedValueOnce({
      name: 'Replacement.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_987654321'),
    });
    vi.mocked(service.open).mockResolvedValueOnce(reviewSession(2));
    expect(await session.openMovie()).toBe('opened');
    expect(stale.session.commit()).toMatchObject({ kind: 'rejected', message: expect.stringContaining('source changed') });
  });
});
