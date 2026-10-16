import { describe, expect, it, vi } from 'vitest';

import { CaptureQueue } from '../../src/app/capture-queue.js';
import { UnsavedCaptureStorage, type ICaptureStorage } from '../../src/app/capture-storage.js';
import type { IFrameReviewDisplayedCapture } from '../../src/app/frame-review-displayed-capture.js';
import { GifSessionStatus } from '../../src/app/gif-session-status.js';
import { ThumbnailOpaqueId, type IThumbnailCacheService } from '../../src/app/thumbnail-cache-service.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';
import { RangeCaptureModel } from '../../src/domain/range-capture-model.js';
import { CaptureEndpoints } from '../../src/domain/capture-endpoint.js';
import type { IFrameReviewSession } from '../../src/frame-review/frame-review-api.js';

function frame(frameIndex: number) {
  return Object.freeze({
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
    timebaseNumerator: 1n, timebaseDenominator: 1_000n,
    frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash: frameIndex.toString(16).padStart(16, '0'),
  });
}

function exactCapture(frameIndex: number): IFrameReviewDisplayedCapture {
  const identity = frame(frameIndex);
  return Object.freeze({
    point: Object.freeze({ kind: 'exact-frame' as const, identity }),
    positionUs: BigInt(frameIndex * 1_000),
    sourceGeneration: 1,
    thumbnail: Object.freeze({
      kind: 'exact-frame' as const, identity, reviewTimeUs: BigInt(frameIndex * 1_000), sourceGeneration: 1,
      frameGeneration: 1, width: 2, height: 2, sourceWidth: 640, sourceHeight: 360, pixels: new Blob([new Uint8Array(16)]),
    }),
  });
}

function thumbnails(): IThumbnailCacheService {
  let count = 0;
  return {
    save: vi.fn(async () => {
      count += 1;
      return Object.freeze({ id: ThumbnailOpaqueId.parse(`thumbnail_${count.toString().padStart(8, '0')}`), url: `blob:thumbnail-${count}` });
    }),
    load: vi.fn(), delete: vi.fn(async () => undefined), dispose: vi.fn(),
  };
}

function captureQueue({ storage = new UnsavedCaptureStorage() as ICaptureStorage, completed = new Set<string>(), held = new Set<string>() } = {}) {
  const movie = {
    review: { id: 'session_12345678' } as unknown as IFrameReviewSession,
    reviewState: FrameReviewState.create('exact-ready', 1, { playbackDurationUs: 2_000_000n }),
    sourceGeneration: 1,
    lifecycle: 'open' as const,
    opening: false,
  };
  const status = new GifSessionStatus();
  const extraction = {
    isCompleted: (rangeId: string) => completed.has(rangeId),
    revisionBlock: (rangeId: string) => held.has(rangeId) ? 'Wait for this extraction to finish.' : null,
  };
  const queue = new CaptureQueue({ movie, status, thumbnails: thumbnails(), storage, extraction, failures: { report: vi.fn() } });
  queue.startForMovie();
  return { queue, status, movie };
}

function savedDraftModel(): RangeCaptureModel {
  const saved = (frameIndex: number) => CaptureEndpoints.savedExact(frameIndex, frame(frameIndex).frameInfoHash, BigInt(frameIndex * 1_000), 1);
  return RangeCaptureModel.restore({ ranges: [], draft: { start: saved(3), end: null }, nextRangeSequence: 1 }, 1);
}

async function lock(queue: CaptureQueue, start: number, end: number) {
  queue.markStart(exactCapture(start));
  queue.markEnd(exactCapture(end));
  const locked = await queue.lockRange();
  if (locked.kind !== 'locked') throw new Error(`Range did not lock: ${locked.kind}`);
  return locked.range;
}

describe('CaptureQueue', () => {
  it('locks a marked draft into a selected range and announces each step', async () => {
    const { queue, status } = captureQueue();
    const changed = vi.fn();
    status.on('changed', changed);

    const range = await lock(queue, 3, 6);

    expect(queue.ranges).toEqual([range]);
    expect(queue.selectedRangeId).toBe(range.id);
    expect(status.message).toBe('Range locked');
    expect(changed).toHaveBeenCalled();
  });

  it('refuses capture with the reason when the movie is not open', () => {
    const { queue, movie } = captureQueue();
    Object.assign(movie, { lifecycle: 'opening' });

    expect(queue.markStart(exactCapture(3))).toEqual({ kind: 'rejected', message: 'Wait for the movie to finish opening.' });
  });

  it('reports a removed range before publishing, so a refinement of it can end first', async () => {
    const { queue, status } = captureQueue();
    const range = await lock(queue, 3, 6);
    const order: string[] = [];
    queue.on('rangeRemoved', rangeId => order.push(`removed ${rangeId}`));
    status.on('changed', () => order.push('changed'));

    expect(queue.removeRange(range.id)).toBe(true);

    expect(order).toEqual([`removed ${range.id}`, 'changed']);
    expect(queue.selectedRangeId).toBeNull();
    expect(queue.ranges).toHaveLength(0);
  });

  it('keeps a range that a running extraction still holds', async () => {
    const held = new Set<string>();
    const { queue } = captureQueue({ held });
    const range = await lock(queue, 3, 6);
    held.add(range.id);

    expect(queue.canRemoveRange(range.id)).toBe(false);
    expect(queue.removeRange(range.id)).toBe(false);
  });

  it('leaves fully extracted ranges out of the saved queue', async () => {
    const completed = new Set<string>();
    const storage = Object.assign(new UnsavedCaptureStorage(), { save: vi.fn() });
    const { queue } = captureQueue({ storage, completed });
    const first = await lock(queue, 3, 6);
    await lock(queue, 8, 9);
    completed.add(first.id);
    storage.save.mockClear();

    queue.save();

    expect(storage.save).toHaveBeenCalledWith(expect.anything(), new Set([first.id]));
  });

  it('says why a saved draft cannot be locked before exact frames are ready', async () => {
    const { queue, status, movie } = captureQueue();
    movie.reviewState = FrameReviewState.create('indexing', 1);
    movie.review = { id: 'session_12345678', state: () => movie.reviewState } as unknown as IFrameReviewSession;
    queue.useModel(savedDraftModel());

    const result = await queue.lockRange();

    expect(result).toEqual({ kind: 'rejected', message: 'Capture becomes available after exact frame preparation.' });
    expect(status.message).toBe('Capture becomes available after exact frame preparation.');
  });

  it('says that a saved draft changed while its frames were being checked, instead of locking it', async () => {
    const { queue, status, movie } = captureQueue();
    let answer: (identity: ReturnType<typeof frame>) => void = () => undefined;
    movie.review = {
      id: 'session_12345678',
      state: () => movie.reviewState,
      frameIdentity: vi.fn(() => new Promise(resolve => { answer = resolve; })),
    } as unknown as IFrameReviewSession;
    queue.useModel(savedDraftModel());

    const locking = queue.lockRange();
    queue.markStart(exactCapture(4));
    answer(frame(3));
    const result = await locking;

    expect(result).toEqual({ kind: 'rejected', message: 'The draft changed while its saved frames were being checked. Lock it again.' });
    expect(status.message).toBe('The draft changed while its saved frames were being checked. Lock it again.');
    expect(queue.ranges).toHaveLength(0);
  });

  it('stops without a word on the status line when the movie was replaced while the saved frames were checked', async () => {
    const { queue, status, movie } = captureQueue();
    let answer: (identity: ReturnType<typeof frame>) => void = () => undefined;
    movie.review = {
      id: 'session_12345678',
      state: () => movie.reviewState,
      frameIdentity: vi.fn(() => new Promise(resolve => { answer = resolve; })),
    } as unknown as IFrameReviewSession;
    queue.useModel(savedDraftModel());

    const locking = queue.lockRange();
    status.show('Opening Next.mkv');
    movie.sourceGeneration = 2;
    answer(frame(3));
    const result = await locking;

    expect(result).toEqual({ kind: 'stopped' });
    expect(status.message).toBe('Opening Next.mkv');
    expect(queue.capture?.capture).toMatchObject({ kind: 'draft', start: { kind: 'saved-exact-frame' } });
  });

  it('restores a saved queue, positions the movie after it, and says what came back', async () => {
    const saved = new RangeCaptureModel(1);
    saved.markStart(CaptureEndpoints.exact(frame(3), 3_000n, 1));
    saved.markEnd(CaptureEndpoints.exact(frame(6), 6_000n, 1));
    saved.lockRange();
    const storage = Object.assign(new UnsavedCaptureStorage(), {
      restoring: true, loading: true,
      attach: vi.fn(async () => saved),
      endRestore() { storage.restoring = false; storage.loading = false; },
    });
    const capturePositioning = { showFrameAfterCapture: vi.fn(async () => undefined) };
    const { status, movie } = captureQueue();
    const queue = new CaptureQueue({
      movie, status, thumbnails: thumbnails(), storage: storage as unknown as ICaptureStorage,
      extraction: { isCompleted: () => false, revisionBlock: () => null }, capturePositioning, failures: { report: vi.fn() },
    });

    await queue.restore(movie.review);

    expect(queue.ranges).toHaveLength(1);
    expect(capturePositioning.showFrameAfterCapture).toHaveBeenCalledWith(movie.review, expect.objectContaining({ kind: 'exact-frame' }));
    expect(status.message).toBe('Restored 1 saved ranges.');
    expect(storage.restoring).toBe(false);
  });
});