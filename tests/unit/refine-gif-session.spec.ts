import { describe, expect, it, vi } from 'vitest';

import { GifExtractionSession, type IThumbnailCacheService } from '../../src/app/gif-extraction-session.js';
import { ThumbnailOpaqueId } from '../../src/app/thumbnail-cache-service.js';
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
    play: vi.fn(), pause: vi.fn(), setRate: vi.fn(), seekPlayback: vi.fn(), enterFrameScrub: vi.fn(),
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

async function openSession(thumbnails = thumbnailService()): Promise<{
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
  const session = new GifExtractionSession(service, thumbnails);
  expect(await session.openMovie()).toBe('opened');
  return { session, service, thumbnails };
}

function lockTimestampRange(session: GifExtractionSession, startUs = 100_000n, endUs = 300_000n) {
  session.markStart(displayedCapture('timestamp', startUs));
  session.markEnd(displayedCapture('timestamp', endUs));
  const locked = session.lockRange();
  if (locked.kind !== 'locked') throw new Error(locked.kind === 'rejected' ? locked.message : 'Range did not lock.');
  return locked.range;
}

describe('RefineGifSession', () => {
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
      kind: 'focused', endpoint: 'end', seekTimeUs: 300_000n,
    });
    expect(begin.session.snapshot.end.kind).toBe('playback-timestamp');
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

    expect(begin.session.snapshot).toMatchObject({ focusedEndpoint: 'end', seekTimeUs: 300_000n });
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
    expect(await session.openMovie(async () => true)).toBe('opened');
    expect(stale.session.commit()).toMatchObject({ kind: 'rejected', message: expect.stringContaining('source changed') });
  });
});
