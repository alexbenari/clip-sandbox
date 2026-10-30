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
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false,
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
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false,
    })).rejects.toMatchObject({ category: 'cache-unavailable', recoverable: false });
  });

  it('passes on the state of a review whose proxy is ready before its exact frames', async () => {
    let wireListener: ((payload: unknown) => void) | undefined;
    const api: IElectronFrameReviewApi = {
      chooseSource: vi.fn(),
      open: async () => ({ ok: true, result: { sessionId: 'session_12345678', state: readyState } }),
      command: vi.fn(), close: vi.fn(async () => ({ ok: true, result: null })),
      subscribe: (listener) => { wireListener = listener; return () => { wireListener = undefined; }; },
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);
    const session = await service.open({ sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false });

    wireListener?.({ sessionId: session.id, event: { type: 'state', state: {
      ...readyState, phase: 'proxy-ready', captureEnabled: false, preparedReview: null,
    } } });

    expect(session.state().phase).toBe('proxy-ready');
    await session.dispose();
  });

  it('asks the desktop to open the movie muted when the request says so', async () => {
    const open = vi.fn(async () => ({ ok: true, result: { sessionId: 'session_12345678', state: readyState } }));
    const api: IElectronFrameReviewApi = {
      chooseSource: vi.fn(), open, command: vi.fn(), close: vi.fn(), subscribe: vi.fn(() => () => undefined),
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);

    await service.open({ sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: true });

    expect(open).toHaveBeenCalledWith({
      sourceHandle: 'source_123456789', previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: true,
    });
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

  it('sends decimal jump times and reads the confirmed playback position', async () => {
    const command = vi.fn(async (_id: string, name: string) => ({
      ok: true,
      result: name === 'jump-playback-by' ? '3500000' : null,
    }));
    const api: IElectronFrameReviewApi = {
      chooseSource: vi.fn(),
      open: async () => ({ ok: true, result: { sessionId: 'session_12345678', state: readyState } }),
      command, close: vi.fn(async () => ({ ok: true, result: null })), subscribe: vi.fn(() => () => undefined),
    };
    const service = new ElectronFrameReviewService({ clipSandboxDesktop: { frameReview: api } } as unknown as Window);
    const session = await service.open({ sourceHandle: FrameReviewOpaqueId.sourceHandle('source_123456789'),
      previewBounds: { maxWidth: 960, maxHeight: 540 }, muted: false });

    await expect(session.jumpPlaybackBy(2_000_000n)).resolves.toBe(3_500_000n);
    expect(command).toHaveBeenCalledWith(session.id, 'jump-playback-by', { deltaUs: '2000000' });
    await session.dispose();
  });
});
