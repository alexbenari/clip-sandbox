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

  it('removes the session before awaiting disposal so late commands cannot enter it', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
    let known = true;
    const closeSession = vi.fn(async () => { known = false; });
    const host = { closeSession, session: vi.fn(() => { if (!known) throw new Error('unknown'); }) };
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
});
