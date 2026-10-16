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
  return { attach, save: vi.fn(async () => undefined) };
}

const fingerprint = {
  fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
  sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
  selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};

describe('SavedCaptureQueuePersistence', () => {
  it('rejects an attach result that arrives after its source is replaced', async () => {
    let finishAttach: (value: AttachedCaptures) => void = () => undefined;
    const pendingAttach = new Promise<AttachedCaptures>(resolve => { finishAttach = resolve; });
    const queue = new SavedCaptureQueuePersistence(captureStore(() => pendingAttach), 1, vi.fn());
    const attaching = queue.attach(FrameReviewOpaqueId.sessionId('session_12345678'));

    queue.invalidate();
    finishAttach({ movieRef: 'capture_12345678', fingerprint, data: savedData });

    expect(await attaching).toBeNull();
    expect(queue.hasMovieReference).toBe(false);
  });

  it('restores the saved ranges and writes again only after they change', async () => {
    const store = captureStore(async () => ({ movieRef: 'capture_12345678', fingerprint, data: savedData }));
    const queue = new SavedCaptureQueuePersistence(store, 2, vi.fn());

    const restored = await queue.attach(FrameReviewOpaqueId.sessionId('session_12345678'));
    queue.save(restored, new Set());
    expect(store.save).not.toHaveBeenCalled();
    restored!.removeRange(restored!.snapshot.ranges[0]!.id);
    queue.save(restored, new Set());

    expect(restored?.snapshot.ranges).toHaveLength(0);
    expect(queue.hasMovieReference).toBe(true);
    expect(store.save).toHaveBeenCalledWith('capture_12345678', expect.objectContaining({ ranges: [] }));
  });
});