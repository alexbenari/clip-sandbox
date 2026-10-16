import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClipCapturesIpcBoundary } = require('../../electron/clip-captures-ipc.cjs');

const original = {
  fingerprintVersion: 1, sourceSampleDigest: 'a'.repeat(64), sourceBytes: '123',
  sourceDurationUs: '1000000', signatureProfileVersion: '3m-3m-3x1m',
  selectedStream: 0, streamMetadataDigest: 'b'.repeat(64),
};
const changed = { ...original, sourceSampleDigest: 'c'.repeat(64) };
const saved = { nextRangeSequence: 2, ranges: [{ id: 'range-1',
  start: { kind: 'exact-frame', frameIndex: 1, frameInfoHash: '0000000000000001', reviewTimeUs: '10000' },
  end: { kind: 'exact-frame', frameIndex: 2, frameInfoHash: '0000000000000002', reviewTimeUs: '20000' },
}] };

describe('ClipCapturesIpcBoundary', () => {
  it('orders attach writes for one window so the last selected movie remains active', async () => {
    let finishFirst!: () => void;
    const firstWrite = new Promise<void>(resolve => { finishFirst = resolve; });
    const writes: string[] = [];
    const store = {
      key: (value: typeof original) => value.sourceSampleDigest,
      load: vi.fn(async () => ({ nextRangeSequence: 1, ranges: [] })),
      save: vi.fn(async ({ fingerprint }: { fingerprint: typeof original }) => {
        if (fingerprint.sourceSampleDigest === original.sourceSampleDigest) await firstWrite;
        writes.push(fingerprint.sourceSampleDigest);
      }),
    };
    const host = { captureContext: (sessionId: string) => ({
      sourcePath: 'D:\\movies\\Movie.mp4', fingerprint: sessionId.endsWith('A') ? original : changed,
    }) };
    const boundary = new ClipCapturesIpcBoundary({ ipcMain: { handle: vi.fn() }, store, hostForEvent: () => host });
    const event = { sender: { id: 7 } };
    const first = boundary.attach(event, { sessionId: 'session_1234567A' });
    const second = boundary.attach(event, { sessionId: 'session_1234567B' });
    finishFirst();
    await Promise.all([first, second]);

    expect(writes).toEqual([original.sourceSampleDigest, changed.sourceSampleDigest]);
  });

  it('returns the movie\'s saved queue under a reference only the attaching window can save to', async () => {
    const record = {
      ...saved, movieFingerprint: original, displayName: 'Movie.mp4', lastKnownPath: 'D:\\movies\\Movie.mp4',
    };
    const store = {
      key: (value: typeof original) => value.sourceSampleDigest,
      load: vi.fn(async () => record), save: vi.fn(async () => undefined),
    };
    const host = { captureContext: vi.fn(() => ({ sourcePath: 'D:\\movies\\Movie.mp4', fingerprint: original })) };
    const boundary = new ClipCapturesIpcBoundary({ ipcMain: { handle: vi.fn() }, store, hostForEvent: () => host });
    const event = { sender: { id: 7 } };
    const result = await boundary.attach(event, { sessionId: 'session_12345678' });

    expect(result).toMatchObject({ ok: true, result: {
      movieRef: expect.stringMatching(/^capture_/), data: { schemaVersion: 1, ...saved },
    } });
    expect(JSON.stringify(result)).not.toContain('D:\\movies');
    const movieRef = result.result.movieRef;
    const changedData = { nextRangeSequence: 2, ranges: [] };
    store.save.mockClear();
    expect(await boundary.save(event, { movieRef, data: changedData })).toEqual({ ok: true, result: null });
    expect(store.save).toHaveBeenCalledWith({
      fingerprint: original, displayName: 'Movie.mp4', sourcePath: 'D:\\movies\\Movie.mp4', data: changedData,
    });
    expect((await boundary.save({ sender: { id: 8 } }, { movieRef, data: changedData })).ok).toBe(false);
  });

});
