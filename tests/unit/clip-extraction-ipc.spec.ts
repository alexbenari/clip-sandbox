import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { FakeIpcMain } from '../support/fake-ipc-main.js';

const require = createRequire(import.meta.url);
const { ClipExtractionIpc } = require('../../electron/clip-extraction-ipc.cjs');

describe('clip extraction IPC', () => {
  it('continues extraction when the renderer closes during a progress event', async () => {
    const ipcMain = new FakeIpcMain();
    const runtime = { extract: vi.fn(async (_owner: number, _host: unknown, _request: unknown,
      report: (value: unknown) => void) => { report({ stage: 'encoding-video', encodedFrames: 1, totalFrames: 2 });
      return { ok: true, result: { filename: 'Movie-001.mp4' } }; }) };
    new ClipExtractionIpc({ ipcMain, runtime, hostForEvent: vi.fn(() => ({})) }).register();
    const sender = { id: 7, isDestroyed: vi.fn(() => false), send: vi.fn(() => { throw new Error('window closed'); }) };
    const result = await ipcMain.invoke('clip-sandbox:clip-extraction-extract', { sender }, {
      operationId: 'extract_12345678', destinationHandle: 'destination_12345678',
    });
    expect(result).toMatchObject({ ok: true, result: { filename: 'Movie-001.mp4' } });
    expect(runtime.extract).toHaveBeenCalledOnce();
  });
  it('rejects malformed operation ids before runtime work', async () => {
    const ipcMain = new FakeIpcMain();
    const runtime = { openDestination: vi.fn() };
    new ClipExtractionIpc({ ipcMain, runtime, hostForEvent: vi.fn() }).register();

    const result = await ipcMain.invoke('clip-sandbox:clip-extraction-open-destination',
      { sender: { id: 7 } }, { operationId: 'wrong' });

    expect(result).toMatchObject({ ok: false, operationId: 'invalid-operation', error: { code: 'invalid-operation' } });
    expect(runtime.openDestination).not.toHaveBeenCalled();
  });
});
