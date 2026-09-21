import { describe, expect, it, vi } from 'vitest';

import { ElectronFrameReviewService, type IElectronFrameReviewApi } from '../../../src/adapters/electron/electron-frame-review-service.js';
import { FrameReviewOpaqueId } from '../../../src/frame-review/frame-review-api.js';

const readyState = {
  phase: 'exact-ready', sourceGeneration: 1, captureEnabled: true, progressPercent: null, message: null,
  playbackDurationUs: '1000',
  preparedReview: {
    cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 1, sourceWidth: 1, sourceHeight: 1, durationUs: '1000',
  },
};

describe('Electron frame review service', () => {
  it('reconstructs safe frame payloads and suppresses events after disposal', async () => {
    let wireListener: ((payload: unknown) => void) | undefined;
    const close = vi.fn(async () => ({ ok: true, result: null }));
    const api: IElectronFrameReviewApi = {
      chooseSource: async () => ({ ok: true, result: { canceled: true } }),
      open: async () => ({ ok: true, result: { sessionId: 'session_12345678', state: readyState } }),
      command: async () => ({ ok: true, result: null }),
      close,
      subscribe: (listener) => { wireListener = listener; return () => { wireListener = undefined; }; },
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);
    const session = await service.open({
      sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
      previewBounds: { maxWidth: 960, maxHeight: 540 },
    });
    const listener = vi.fn();
    expect(session.state().playbackDurationUs).toBe(1_000n);
    session.subscribe(listener);
    wireListener?.({
      sessionId: session.id,
      event: {
        type: 'display-frame',
        frame: {
          kind: 'exact-frame', sourceGeneration: 1, frameGeneration: 1,
          width: 1, height: 1, sourceWidth: 1, sourceHeight: 1,
          reviewTimeUs: '0', pixels: new Uint8Array([1, 2, 3, 255]),
          identity: {
            frameIndex: 0, originalFrameIndex: 0, pts: '0', duration: '1',
            timebaseNumerator: '1', timebaseDenominator: '24', frameInfoPts: '0', frameInfoHash: 'hash',
          },
        },
      },
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'display-frame', frame: expect.objectContaining({ kind: 'exact-frame', pixels: expect.any(Blob) }),
    }));

    await Promise.all([session.dispose(), session.dispose()]);
    expect(close).toHaveBeenCalledOnce();
    expect(wireListener).toBeUndefined();
  });

  it('translates expected host failures without exposing host details', async () => {
    const api: IElectronFrameReviewApi = {
      chooseSource: async () => ({ ok: true, result: { canceled: true } }),
      open: async () => ({
        ok: false,
        error: { category: 'cache-unavailable', message: 'Prepared-review cache is not writable.', recoverable: false },
      }),
      command: vi.fn(), close: vi.fn(), subscribe: vi.fn(),
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);
    await expect(service.open({
      sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
      previewBounds: { maxWidth: 960, maxHeight: 540 },
    })).rejects.toMatchObject({ category: 'cache-unavailable', recoverable: false });
  });

  it('accepts a selected source without exposing a filesystem path', async () => {
    const api: IElectronFrameReviewApi = {
      chooseSource: async () => ({
        ok: true,
        result: { canceled: false, name: 'feature.mp4', sourceHandle: 'source_123456789' },
      }),
      open: vi.fn(), command: vi.fn(), close: vi.fn(), subscribe: vi.fn(),
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);

    await expect(service.chooseSource()).resolves.toEqual({
      name: 'feature.mp4',
      sourceHandle: 'source_123456789',
    });
  });
});
