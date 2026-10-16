import { describe, expect, it, vi } from 'vitest';

import { GifSessionStatus } from '../../src/app/gif-session-status.js';
import { RangeRefinement } from '../../src/app/range-refinement.js';
import { CaptureEndpoints } from '../../src/domain/capture-endpoint.js';
import { CapturedRanges, type CapturedRange, type CapturedRangeId } from '../../src/domain/captured-range.js';
import { FrameReviewState } from '../../src/frame-review/model/frame-review-state.js';

function frame(frameIndex: number) {
  return Object.freeze({
    frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
    timebaseNumerator: 1n, timebaseDenominator: 1_000n,
    frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash: frameIndex.toString(16).padStart(16, '0'),
  });
}

const readyRange = (sequence: number): CapturedRange => Object.freeze({
  id: CapturedRanges.id(sequence), kind: 'ready-to-extract', sourceGeneration: 1,
  start: CaptureEndpoints.exact(frame(sequence * 10), BigInt(sequence * 10_000), 1),
  end: CaptureEndpoints.exact(frame(sequence * 10 + 5), BigInt(sequence * 10_000 + 5_000), 1),
}) as CapturedRange;

const savedRange = (sequence: number): CapturedRange => Object.freeze({
  ...readyRange(sequence), kind: 'saved-exact-range',
}) as unknown as CapturedRange;

function rangeRefinement(ranges: CapturedRange[]) {
  const checks = new Map<CapturedRangeId, (checked: boolean) => void>();
  const queue = {
    range: (rangeId: CapturedRangeId) => ranges.find(range => range.id === rangeId),
    ranges, hasModel: true,
    isStale: () => false,
    markSelected: vi.fn(),
    prepareSavedRange: vi.fn((rangeId: CapturedRangeId) => new Promise<boolean>(resolve => {
      checks.set(rangeId, checked => {
        const index = ranges.findIndex(range => range.id === rangeId);
        if (checked) ranges[index] = readyRange(Number(String(rangeId).split('-')[1]));
        resolve(checked);
      });
    })),
    replaceRangeWithExactEndpoints: vi.fn(), replaceThumbnail: vi.fn(), save: vi.fn(),
  };
  const movie = {
    lifecycle: 'open' as const, sourceGeneration: 1,
    reviewState: FrameReviewState.create('exact-ready', 1, { playbackDurationUs: 2_000_000n }),
  };
  const extraction = { revisionBlock: () => null, state: () => Object.freeze({ kind: 'pending' as const }), resetForRevision: vi.fn() };
  const status = new GifSessionStatus();
  const refinement = new RangeRefinement({ queue, extraction, movie, status });
  return { refinement, checks, queue, status };
}

describe('RangeRefinement', () => {
  it('starts refining a ready range at once and selects it', async () => {
    const range = readyRange(1);
    const { refinement, queue, status } = rangeRefinement([range]);

    const started = await refinement.beginRefinement(range.id);

    expect(started.kind).toBe('started');
    expect(queue.markSelected).toHaveBeenCalledWith(range.id);
    expect(status.message).toBe('Review and adjust exact frames, then lock the range.');
  });

  it('checks a saved range first, and gives way to a newer request made during the check', async () => {
    const first = savedRange(1);
    const second = savedRange(2);
    const { refinement, checks } = rangeRefinement([first, second]);

    const firstRequest = refinement.beginRefinement(first.id);
    const secondRequest = refinement.beginRefinement(second.id);
    checks.get(first.id)?.(true);
    checks.get(second.id)?.(true);

    expect(await firstRequest).toEqual({ kind: 'stopped' });
    expect((await secondRequest).kind).toBe('started');
    expect(refinement.active?.snapshot.rangeId).toBe(second.id);
  });

  it('blocks extraction of the range being refined until its refinement is locked', async () => {
    const range = readyRange(1);
    const other = readyRange(2);
    const { refinement } = rangeRefinement([range, other]);
    await refinement.beginRefinement(range.id);

    expect(refinement.blocksExtraction(range.id)).toBe(true);
    expect(refinement.blocksExtraction(other.id)).toBe(false);
  });

  it('ends only when its own range is removed', async () => {
    const range = readyRange(1);
    const other = readyRange(2);
    const { refinement } = rangeRefinement([range, other]);
    await refinement.beginRefinement(range.id);

    refinement.endForRemovedRange(other.id);
    expect(refinement.active).not.toBeNull();
    refinement.endForRemovedRange(range.id);

    expect(refinement.active).toBeNull();
  });

  it('stays visible but unusable while the next movie opens, until reset', async () => {
    const range = readyRange(1);
    const { refinement } = rangeRefinement([range]);
    await refinement.beginRefinement(range.id);

    refinement.invalidateForNewMovie();
    expect(refinement.active?.snapshot.status).toBe('invalidated');
    refinement.reset();

    expect(refinement.active).toBeNull();
  });
});
