import { describe, expect, it, vi } from 'vitest';

import { CollectionClipRefinementSession } from '../../src/app/collection-clip-refinement-session.js';
import { ThumbnailOpaqueId, type IThumbnailCacheService } from '../../src/app/thumbnail-cache-service.js';
import type { FrameReviewEvent, IFrameReviewService, IFrameReviewSession } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';

const hash = (frameIndex: number) => frameIndex.toString(16).padStart(16, '0');
const clipRange = Object.freeze({
  start: Object.freeze({ frameIndex: 2, frameInfoHash: hash(2) }),
  end: Object.freeze({ frameIndex: 4, frameInfoHash: hash(4) }),
});
const source = Object.freeze({ name: 'Movie.mp4', sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789') });

function frameAt(frameIndex: number, frameInfoHash = hash(frameIndex)) {
  return Object.freeze({
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
    timebaseNumerator: 1n, timebaseDenominator: 1_000n, frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash,
  });
}

function originalMovie({ phase = 'exact-ready' as Parameters<typeof FrameReviewState.create>[0], hashFor = hash } = {}) {
  const listeners = new Set<(event: FrameReviewEvent) => void>();
  const review = {
    id: 'session_12345678',
    state: () => FrameReviewState.create(phase, 1, { playbackDurationUs: 2_000_000n }),
    subscribe: vi.fn((next: (event: FrameReviewEvent) => void) => { listeners.add(next); return () => listeners.delete(next); }),
    frameIdentity: vi.fn(async (frameIndex: number) => frameAt(frameIndex, hashFor(frameIndex))),
    dispose: vi.fn(async () => undefined),
  } as unknown as IFrameReviewSession;
  const service: IFrameReviewService = { chooseSource: vi.fn(), open: vi.fn(async () => review) };
  return { service, review, emit: (event: FrameReviewEvent) => { for (const next of [...listeners]) next(event); } };
}

function thumbnails(): IThumbnailCacheService {
  return {
    save: vi.fn(async () => Object.freeze({ id: ThumbnailOpaqueId.parse('thumbnail_00000001'), url: 'blob:thumbnail-1' })),
    load: vi.fn(), delete: vi.fn(async () => undefined), dispose: vi.fn(),
  };
}

describe('CollectionClipRefinementSession', () => {
  it('imports the clip\'s range as one exact range and starts refining it', async () => {
    const { service } = originalMovie();
    const session = new CollectionClipRefinementSession(service, thumbnails());
    await session.openCollectionSource(source);

    const started = await session.importCollectionRange(clipRange);

    expect(started.kind).toBe('started');
    expect(session.snapshot.ranges).toEqual([expect.objectContaining({ id: 'range-1', kind: 'ready-to-extract' })]);
    expect(session.snapshot.capture?.capture).toMatchObject({ kind: 'draft', start: null, end: null });
  });

  it('waits for exact frames before checking the clip\'s range', async () => {
    const movie = originalMovie({ phase: 'indexing' });
    const session = new CollectionClipRefinementSession(movie.service, thumbnails());
    await session.openCollectionSource(source);

    const importing = session.importCollectionRange(clipRange);
    expect(movie.review.frameIdentity).not.toHaveBeenCalled();
    movie.emit({ type: 'state', state: FrameReviewState.create('exact-ready', 1, { playbackDurationUs: 2_000_000n }) });

    expect((await importing).kind).toBe('started');
  });

  it('refuses a clip whose frames the movie no longer has', async () => {
    const { service } = originalMovie({ hashFor: () => 'ffffffffffffffff' });
    const session = new CollectionClipRefinementSession(service, thumbnails());
    await session.openCollectionSource(source);

    expect(await session.importCollectionRange(clipRange))
      .toEqual({ kind: 'rejected', message: 'The source range no longer matches this clip.' });
    expect(session.snapshot.ranges).toHaveLength(0);
  });

  it('refuses to import before the original movie is open', async () => {
    const session = new CollectionClipRefinementSession(originalMovie().service, thumbnails());

    expect(await session.importCollectionRange(clipRange))
      .toEqual({ kind: 'rejected', message: 'Collection refinement is unavailable.' });
  });
});
