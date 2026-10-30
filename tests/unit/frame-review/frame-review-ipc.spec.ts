import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('frame review IPC', () => {
  it('rejects malformed commands before they reach a host session', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const session = { play: vi.fn() };
    const host = { session: vi.fn(() => session) };
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => host, chooseSourcePath: vi.fn(async () => null) });

    const response = await handlers.get('clip-sandbox:frame-review-command')?.(
      { sender: { send: vi.fn() } },
      { operationId: 'operation_123456', sessionId: 'session_12345678', command: 'delete-everything', args: {} },
    );

    expect(response).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(host.session).not.toHaveBeenCalled();
  });

  it('closes the session through its host and reports success to the renderer', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const closeSession = vi.fn(async () => undefined);
    const host = { closeSession };
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => host, chooseSourcePath: vi.fn(async () => null) });

    const closed = await handlers.get('clip-sandbox:frame-review-close')?.(
      { sender: {} }, { operationId: 'operation_123456', sessionId: 'session_12345678' });
    expect(closed).toEqual({ ok: true, operationId: 'operation_123456', result: null });
    expect(closeSession).toHaveBeenCalledWith('session_12345678');
  });

  it('registers a selected absolute path and returns only its name and opaque handle', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const registerSource = vi.fn(() => 'source_123456789');
    const host = { registerSource };
    const chooseSourcePath = vi.fn(async () => 'D:\\Movies\\feature.mkv');
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => host, chooseSourcePath });

    const response = await handlers.get('clip-sandbox:frame-review-choose-source')?.(
      { sender: {} }, { operationId: 'operation_123456' });

    expect(registerSource).toHaveBeenCalledWith('D:\\Movies\\feature.mkv');
    expect(response).toEqual({
      ok: true,
      operationId: 'operation_123456',
      result: { canceled: false, name: 'feature.mkv', sourceHandle: 'source_123456789' },
    });
    expect(JSON.stringify(response)).not.toContain('D:\\\\Movies');
  });

  function openThroughIpc(extra: object) {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const open = vi.fn(async (_request: { muted: boolean }) => ({ id: 'session_12345678', state: () => ({ phase: 'opening' }) }));
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => ({ open }), chooseSourcePath: vi.fn(async () => null) });
    const response = handlers.get('clip-sandbox:frame-review-open')!({ sender: { send: vi.fn() } }, {
      operationId: 'operation_123456', sourceHandle: 'source_123456789', previewBounds: { maxWidth: 960, maxHeight: 540 }, ...extra,
    });
    return { open, response };
  }

  it('opens a review muted when the renderer asks for it', async () => {
    const { open, response } = openThroughIpc({ muted: true });
    await response;

    expect(open.mock.calls[0]?.[0].muted).toBe(true);
  });

  it('opens a review with sound when the renderer does not say', async () => {
    const { open, response } = openThroughIpc({});
    await response;

    expect(open.mock.calls[0]?.[0].muted).toBe(false);
  });

  it('refuses a muted value that is not true or false before opening a review', async () => {
    const { open, response } = openThroughIpc({ muted: 'yes' });

    expect(await response).toMatchObject({ ok: false, error: { category: 'invalid-request', message: 'Frame-review muted must be true or false.' } });
    expect(open).not.toHaveBeenCalled();
  });

  it('validates jump duration and exact target time before calling the session', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const session = { jumpPlaybackBy: vi.fn(async () => 3_000_000n), scrubToTime: vi.fn(async () => null) };
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => ({ session: () => session }), chooseSourcePath: vi.fn(async () => null) });
    const command = handlers.get('clip-sandbox:frame-review-command')!;
    const request = (name: string, args: object) => command({ sender: { send: vi.fn() } },
      { operationId: 'operation_123456', sessionId: 'session_12345678', command: name, args });

    expect(await request('jump-playback-by', { deltaUs: '2000000' })).toMatchObject({ ok: true, result: '3000000' });
    expect(session.jumpPlaybackBy).toHaveBeenCalledWith(2_000_000n);
    expect(await request('jump-playback-by', { deltaUs: '0' })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(await request('jump-playback-by', { deltaUs: '10000001' })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(await request('scrub-to-time', { timestampUs: '-1' })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(await request('scrub-to-time', { timestampUs: '9223372036854775808' })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(session.scrubToTime).not.toHaveBeenCalled();
  });

  it('goes to a whole non-negative frame and refuses any other before calling the session', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    const session = { goToFrame: vi.fn(async () => null) };
    const { registerFrameReviewIpc } = require('../../../electron/frame-review-ipc.cjs');
    registerFrameReviewIpc({ ipcMain, hostForEvent: () => ({ session: () => session }), chooseSourcePath: vi.fn(async () => null) });
    const command = handlers.get('clip-sandbox:frame-review-command')!;
    const request = (args: object) => command({ sender: { send: vi.fn() } },
      { operationId: 'operation_123456', sessionId: 'session_12345678', command: 'go-to-frame', args });

    expect(await request({ frameIndex: -1 })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(await request({ frameIndex: 1.5 })).toMatchObject({ ok: false, error: { category: 'invalid-request' } });
    expect(session.goToFrame).not.toHaveBeenCalled();
    expect(await request({ frameIndex: 7 })).toMatchObject({ ok: true });
    expect(session.goToFrame).toHaveBeenCalledWith(7);
  });
});
