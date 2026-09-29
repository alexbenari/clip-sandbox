import { describe, expect, it, vi } from 'vitest';

import { SavedCaptureQueuePersistence } from '../../src/app/saved-capture-queue-persistence.js';
import type { IClipCapturesStoreService, AttachedCaptures } from '../../src/app/clip-captures-store-service.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const savedData = {
  schemaVersion: 1 as const,
  nextRangeSequence: 2,
  ranges: [{
    id: 'range-1',
    start: { kind: 'exact-frame', frameIndex: 2, frameInfoHash: '0000000000000002', reviewTimeUs: '20000' },
    end: { kind: 'exact-frame', frameIndex: 4, frameInfoHash: '0000000000000004', reviewTimeUs: '40000' },
  }],
};

function captureStore(attach: IClipCapturesStoreService['attach']): IClipCapturesStoreService {
  return { last: vi.fn(), attach, save: vi.fn(async () => undefined) };
}

describe('SavedCaptureQueuePersistence', () => {
  it('rejects an attach result that arrives after its source is replaced', async () => {
    let finishAttach: (value: AttachedCaptures) => void = () => undefined;
    const pendingAttach = new Promise<AttachedCaptures>(resolve => { finishAttach = resolve; });
    const queue = new SavedCaptureQueuePersistence(captureStore(() => pendingAttach), 1, vi.fn());
    const attaching = queue.attach(FrameReviewOpaqueId.sessionId('session_12345678'));

    queue.invalidate();
    finishAttach({ kind: 'stale', movieRef: 'capture_12345678', data: savedData });

    expect(await attaching).toBeNull();
    expect(queue.hasMovieReference).toBe(false);
    expect(queue.hasStaleRanges).toBe(false);
  });

  it('retains a stale queue without a usable movie reference so captures remain visible', async () => {
    const queue = new SavedCaptureQueuePersistence(captureStore(async () => ({
      kind: 'stale', movieRef: null, data: savedData,
    })), 2, vi.fn());

    const restored = await queue.attach(FrameReviewOpaqueId.sessionId('session_12345678'));

    expect(restored?.kind).toBe('stale');
    expect(restored?.model?.snapshot.ranges).toHaveLength(1);
    expect(queue.hasMovieReference).toBe(false);
    expect(queue.isStale(restored!.model!.snapshot.ranges[0]!.id)).toBe(true);
  });
});
