// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { registerZoomEditPreviewIpc } = require('../../electron/zoom-edit-preview-ipc.cjs');

const previewRequest = {
  operationId: 'preview_12345678', folderPath: 'D:\\clips', filename: 'Feature-002.mp4',
  source: { kind: 'window', windowId: 'window_opaque0001' }, sessionId: 'session_window01',
  startFrame: 1870, endFrame: 1940,
};

function registered(previews: Record<string, unknown>) {
  const handlers = new Map<string, Function>();
  const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler), removeHandler: vi.fn() };
  registerZoomEditPreviewIpc({ ipcMain, previews });
  const sender = { id: 7, isDestroyed: vi.fn(() => false), send: vi.fn() };
  return {
    sender,
    preview: (payload: unknown) => handlers.get('clip-sandbox:zoom-edit-preview')!({ sender }, payload),
    release: () => handlers.get('clip-sandbox:zoom-edit-release-preview')!({ sender }),
  };
}

describe('zoom edit preview IPC', () => {
  it('passes only the staged edits on and answers the preview under the request’s operation id', async () => {
    const previews = { render: vi.fn(async (_event: unknown, _request: unknown) => ({ ok: true, result: { mediaSource: 'file:///D:/previews/preview-1.mp4?modified=1' } })) };
    const { preview } = registered(previews);

    const answer = await preview({ ...previewRequest, outputPath: 'D:\\elsewhere\\x.mp4', edits: [] });

    expect(previews.render.mock.calls[0][1]).toStrictEqual({
      folderPath: 'D:\\clips', filename: 'Feature-002.mp4', source: { kind: 'window', windowId: 'window_opaque0001' },
      sessionId: 'session_window01', startFrame: 1870, endFrame: 1940,
    });
    expect(answer).toEqual({ ok: true, operationId: 'preview_12345678', result: { mediaSource: 'file:///D:/previews/preview-1.mp4?modified=1' } });
  });

  it('sends each progress report to the requesting window with the operation id', async () => {
    const previews = { render: vi.fn(async (_event: unknown, _request: unknown, report: (progress: unknown) => void) => {
      report({ renderedFrames: 30, totalFrames: 142 });
      return { ok: true, result: {} };
    }) };
    const { preview, sender } = registered(previews);

    await preview(previewRequest);

    expect(sender.send.mock.calls).toEqual([['clip-sandbox:zoom-edit-preview-progress',
      { operationId: 'preview_12345678', renderedFrames: 30, totalFrames: 142 }]]);
  });

  it('refuses a malformed operation id before any rendering', async () => {
    const previews = { render: vi.fn() };
    const { preview } = registered(previews);

    const answer = await preview({ ...previewRequest, operationId: 'refine_12345678' });

    expect(answer).toEqual({ ok: false, operationId: 'invalid-operation',
      error: { code: 'invalid-operation', message: 'Zoom edit preview operation id is invalid.' } });
    expect(previews.render).not.toHaveBeenCalled();
  });

  it('answers an unexpected failure without its message, which can name files', async () => {
    const { preview } = registered({ render: () => { throw new Error('EPERM: open \'D:\\profile\\zoom-edit-previews\\preview-1.mp4\''); } });

    await expect(preview(previewRequest)).resolves.toEqual({ ok: false, operationId: 'preview_12345678',
      error: { code: 'preview-failed', message: 'The preview could not be made.' } });
  });

  it('releases the preview of the requesting window', async () => {
    const previews = { release: vi.fn(async () => undefined) };
    const { release } = registered(previews);

    await expect(release()).resolves.toEqual({ ok: true });
    expect(previews.release.mock.calls).toEqual([[7]]);
  });
});
