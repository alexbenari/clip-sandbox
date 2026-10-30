// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { registerZoomEditSaveIpc } = require('../../electron/zoom-edit-save-ipc.cjs');

const saveRequest = {
  operationId: 'refine_12345678', folderPath: 'D:\\clips', filename: 'Feature-002.mp4',
  source: { kind: 'window', windowId: 'window_opaque0001' }, sessionId: 'session_window01',
  startFrame: 1870, endFrame: 1940, loopify: true, outcome: 'replace',
};

function registered(saver: Record<string, unknown>) {
  const handlers = new Map<string, Function>();
  const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
  registerZoomEditSaveIpc({ ipcMain, saver });
  const sender = { id: 7, isDestroyed: vi.fn(() => false), send: vi.fn() };
  return {
    sender,
    save: (payload: unknown) => handlers.get('clip-sandbox:zoom-edit-save')!({ sender }, payload),
    cancel: (payload: unknown) => handlers.get('clip-sandbox:zoom-edit-cancel-save')!({ sender }, payload),
  };
}

describe('zoom edit save IPC', () => {
  it('passes the save request on and answers the saved clip under the request’s operation id', async () => {
    const saver = { save: vi.fn(async (_event: unknown, _request: unknown) => ({ ok: true, result: { filename: 'Feature-002.mp4', outcome: 'replaced' } })) };
    const { save } = registered(saver);

    const answer = await save({ ...saveRequest, extra: 'ignored' });

    expect(saver.save.mock.calls[0][1]).toStrictEqual(saveRequest);
    expect(answer).toEqual({ ok: true, operationId: 'refine_12345678', result: { filename: 'Feature-002.mp4', outcome: 'replaced' } });
  });

  it('sends each progress report to the requesting window with the operation id', async () => {
    const saver = { save: vi.fn(async (_event: unknown, _request: unknown, report: (progress: unknown) => void) => {
      report({ stage: 'encoding-video', encodedFrames: 35, totalFrames: 71 });
      return { ok: true, result: {} };
    }) };
    const { save, sender } = registered(saver);

    await save(saveRequest);

    expect(sender.send.mock.calls).toEqual([['clip-sandbox:zoom-edit-save-progress',
      { operationId: 'refine_12345678', stage: 'encoding-video', encodedFrames: 35, totalFrames: 71 }]]);
  });

  it('keeps saving when the window closes during a progress report', async () => {
    const saver = { save: vi.fn(async (_event: unknown, _request: unknown, report: (progress: unknown) => void) => {
      report({ stage: 'saving-media' });
      return { ok: true, result: { filename: 'Feature-002.mp4' } };
    }) };
    const { save, sender } = registered(saver);
    sender.send.mockImplementation(() => { throw new Error('window closed'); });

    await expect(save(saveRequest)).resolves.toMatchObject({ ok: true, result: { filename: 'Feature-002.mp4' } });
  });

  it('refuses a malformed operation id before any save work', async () => {
    const saver = { save: vi.fn() };
    const { save } = registered(saver);

    const answer = await save({ ...saveRequest, operationId: 'extract_12345678' });

    expect(answer).toEqual({ ok: false, operationId: 'invalid-operation',
      error: { code: 'invalid-operation', message: 'Zoom edit save operation id is invalid.' } });
    expect(saver.save).not.toHaveBeenCalled();
  });

  it('answers a refusal with its code and message', async () => {
    const { save } = registered({ save: async () => ({ ok: false, code: 'invalid-request', error: { message: 'The clip name is invalid.' } }) });

    await expect(save(saveRequest)).resolves.toEqual({ ok: false, operationId: 'refine_12345678',
      error: { code: 'invalid-request', message: 'The clip name is invalid.' } });
  });

  it('answers an unexpected failure without its message, which can name files', async () => {
    const { save } = registered({ save: () => { throw new Error('EPERM: operation not permitted, open \'D:\\clips\\Feature-002.mp4\''); } });

    await expect(save(saveRequest)).resolves.toEqual({ ok: false, operationId: 'refine_12345678',
      error: { code: 'save-failed', message: 'The refined clip could not be saved.' } });
  });

  it('cancels the named save for the requesting window', async () => {
    const saver = { cancel: vi.fn(async () => ({ ok: true, result: null })) };
    const { cancel } = registered(saver);

    const answer = await cancel({ operationId: 'cancel_12345678', saveOperationId: 'refine_12345678' });

    expect(saver.cancel.mock.calls).toEqual([[7, 'refine_12345678']]);
    expect(answer).toEqual({ ok: true, operationId: 'cancel_12345678', result: null });
  });
});
