// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const electronPath = require.resolve('electron');
const preloadPath = require.resolve('../../electron/preload.cjs');

// The preload reads Electron from the module cache, so a fake placed there stands in for the renderer side.
function loadPreload(invoke: (channel: string, payload: Record<string, unknown>) => Promise<unknown>) {
  const exposed: Record<string, any> = {};
  const ipcRenderer = { invoke: vi.fn(invoke), on: vi.fn(), removeListener: vi.fn() };
  require.cache[electronPath] = {
    id: electronPath, filename: electronPath, loaded: true,
    exports: { ipcRenderer, contextBridge: { exposeInMainWorld: (name: string, api: unknown) => { exposed[name] = api; } } },
  } as unknown as NodeJS.Module;
  delete require.cache[preloadPath];
  require(preloadPath);
  return { zoomEdit: exposed.clipSandboxDesktop.zoomEdit, frameReview: exposed.clipSandboxDesktop.frameReview, ipcRenderer };
}

const cachedModules: Array<[string, NodeJS.Module | undefined]> = [];

beforeEach(() => {
  cachedModules.splice(0, cachedModules.length, [electronPath, require.cache[electronPath]], [preloadPath, require.cache[preloadPath]]);
});

afterEach(() => {
  for (const [modulePath, cached] of cachedModules) {
    if (cached) require.cache[modulePath] = cached;
    else delete require.cache[modulePath];
  }
});

const echo = async (_channel: string, payload: Record<string, unknown>) => ({ ok: true, operationId: payload.operationId, result: null });

describe('preload zoom edit save', () => {
  it('sends a save request on the save channel under the renderer’s operation id', async () => {
    const { zoomEdit, ipcRenderer } = loadPreload(echo);
    const request = { operationId: 'refine_12345678', folderPath: 'D:\\clips', filename: 'Feature-002.mp4', outcome: 'keep-both' };

    await zoomEdit.save(request);

    expect(ipcRenderer.invoke.mock.calls).toEqual([['clip-sandbox:zoom-edit-save', request]]);
  });

  it('answers a protocol error when the answer belongs to another operation', async () => {
    const { zoomEdit } = loadPreload(async () => ({ ok: true, operationId: 'refine_other_operation', result: null }));

    await expect(zoomEdit.save({ operationId: 'refine_12345678' })).resolves.toEqual({
      ok: false, operationId: 'refine_12345678',
      error: { code: 'protocol-error', message: 'Zoom edit save response correlation failed.' },
    });
  });

  it('cancels a save on the cancel channel naming the save’s operation id', async () => {
    const { zoomEdit, ipcRenderer } = loadPreload(echo);

    await zoomEdit.cancelSave('refine_12345678');

    const [channel, payload] = ipcRenderer.invoke.mock.calls[0];
    expect([channel, payload.saveOperationId]).toEqual(['clip-sandbox:zoom-edit-cancel-save', 'refine_12345678']);
    expect(payload.operationId).toMatch(/^cancel_[a-zA-Z0-9_-]{8,120}$/);
  });

  it('passes save progress events to the listener until it unsubscribes', () => {
    const { zoomEdit, ipcRenderer } = loadPreload(echo);
    const listener = vi.fn();

    const unsubscribe = zoomEdit.subscribeSaveProgress(listener);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];
    handler({}, { operationId: 'refine_12345678', stage: 'saving-media' });
    unsubscribe();

    expect(channel).toBe('clip-sandbox:zoom-edit-save-progress');
    expect(listener.mock.calls).toEqual([[{ operationId: 'refine_12345678', stage: 'saving-media' }]]);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('clip-sandbox:zoom-edit-save-progress', handler);
  });
});

describe('preload zoom edit preview', () => {
  it('sends a preview request on the preview channel under the renderer’s operation id', async () => {
    const { zoomEdit, ipcRenderer } = loadPreload(echo);
    const request = { operationId: 'preview_12345678', folderPath: 'D:\\clips', filename: 'Feature-002.mp4', loopify: true };

    await zoomEdit.preview(request);

    expect(ipcRenderer.invoke.mock.calls).toEqual([['clip-sandbox:zoom-edit-preview', request]]);
  });

  it('answers a protocol error when the preview answer belongs to another operation', async () => {
    const { zoomEdit } = loadPreload(async () => ({ ok: true, operationId: 'preview_other_operation', result: null }));

    await expect(zoomEdit.preview({ operationId: 'preview_12345678' })).resolves.toEqual({
      ok: false, operationId: 'preview_12345678',
      error: { code: 'protocol-error', message: 'Zoom edit preview response correlation failed.' },
    });
  });

  it('releases the preview on the release channel', async () => {
    const { zoomEdit, ipcRenderer } = loadPreload(async () => ({ ok: true }));

    await zoomEdit.releasePreview();

    expect(ipcRenderer.invoke.mock.calls).toEqual([['clip-sandbox:zoom-edit-release-preview']]);
  });

  it('passes preview progress events to the listener until it unsubscribes', () => {
    const { zoomEdit, ipcRenderer } = loadPreload(echo);
    const listener = vi.fn();

    const unsubscribe = zoomEdit.subscribePreviewProgress(listener);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];
    handler({}, { operationId: 'preview_12345678', renderedFrames: 3, totalFrames: 8 });
    unsubscribe();

    expect(channel).toBe('clip-sandbox:zoom-edit-preview-progress');
    expect(listener.mock.calls).toEqual([[{ operationId: 'preview_12345678', renderedFrames: 3, totalFrames: 8 }]]);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('clip-sandbox:zoom-edit-preview-progress', handler);
  });
});

describe('preload frame review', () => {
  it('opens a movie muted when the renderer asks for it', async () => {
    const { frameReview, ipcRenderer } = loadPreload(echo);

    await frameReview.open({ sourceHandle: 'source_12345678', previewBounds: { maxWidth: 640, maxHeight: 360 }, muted: true });

    expect(ipcRenderer.invoke.mock.calls[0]).toEqual(['clip-sandbox:frame-review-open', {
      operationId: expect.any(String), sourceHandle: 'source_12345678', previewBounds: { maxWidth: 640, maxHeight: 360 }, muted: true,
    }]);
  });
});
