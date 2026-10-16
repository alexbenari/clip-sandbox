import { describe, expect, it, vi } from 'vitest';

import { SavedCaptureStorage, UnsavedCaptureStorage, type ICaptureStorage } from '../../src/app/capture-storage.js';
import type { AttachedCaptures, IClipCapturesStoreService } from '../../src/app/clip-captures-store-service.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const fingerprint = {
  fingerprintVersion: 1 as const, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '100',
  sourceDurationUs: '1000000', signatureProfileVersion: 'sampled-packets-3m-3m-3x1m-v1',
  selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};
const reviewId = FrameReviewOpaqueId.sessionId('session_12345678');
const emptyQueue = (): AttachedCaptures => ({ movieRef: 'capture_12345678', fingerprint, data: { schemaVersion: 1, nextRangeSequence: 1, ranges: [] } });

function store(attach: IClipCapturesStoreService['attach'] = vi.fn(async () => emptyQueue())): IClipCapturesStoreService {
  return { attach, save: vi.fn(async () => undefined) };
}

describe('SavedCaptureStorage', () => {
  it('shows loading from the moment a movie opens until its restore ends', () => {
    const storage = new SavedCaptureStorage(store());
    expect([storage.restoring, storage.loading]).toEqual([false, false]);

    storage.startForMovie(1);
    expect([storage.restoring, storage.loading]).toEqual([true, true]);
    storage.endRestore();

    expect([storage.restoring, storage.loading]).toEqual([false, false]);
  });

  it('allows removing captures only once the movie\'s saved queue has loaded', async () => {
    const storage = new SavedCaptureStorage(store());
    storage.startForMovie(1);
    expect(storage.canRemoveCaptures()).toBe(false);

    await storage.attach(reviewId);

    expect(storage.canRemoveCaptures()).toBe(true);
  });

  it('drops a restore that finishes after another movie was opened', async () => {
    let finish: (value: AttachedCaptures) => void = () => undefined;
    const storage = new SavedCaptureStorage(store(() => new Promise(resolve => { finish = resolve; })));
    storage.startForMovie(1);
    const attaching = storage.attach(reviewId);

    storage.startForMovie(2);
    finish(emptyQueue());

    expect(await attaching).toBeNull();
  });

  it('reports a failed save once, with its error', async () => {
    const failing = store();
    const error = new Error('disk full');
    failing.save = vi.fn(async () => { throw error; });
    const failures = { report: vi.fn() };
    const storage = new SavedCaptureStorage(failing, failures);
    storage.startForMovie(1);
    const model = await storage.attach(reviewId);
    model!.markStart({ kind: 'playback-timestamp', timestampUs: 1_000n, sourceGeneration: 1 } as never);

    storage.save(model!, new Set());

    await vi.waitFor(() => expect(failures.report).toHaveBeenCalledWith(
      'Captures could not be saved. Current work remains available until the app closes.', error));
    expect(failures.report).toHaveBeenCalledOnce();
  });
});

describe('UnsavedCaptureStorage', () => {
  it('never restores, never marks ranges stale, and allows removal while the movie is open', async () => {
    const storage: ICaptureStorage = new UnsavedCaptureStorage();
    storage.startForMovie(1);
    storage.markStale('range-1' as never);

    expect([storage.restoring, storage.loading, storage.isStale('range-1' as never)]).toEqual([false, false, false]);
    expect(await storage.attach(reviewId)).toBeNull();
    expect(storage.canRemoveCaptures(true)).toBe(true);
    expect(storage.canRemoveCaptures(false)).toBe(false);

  });
});
