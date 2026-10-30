// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ElectronZoomEditPreviewService } from '../../src/adapters/electron/electron-zoom-edit-preview-service.js';
import type { IZoomEditPreviewRequest } from '../../src/app/zoom-edit-preview-service.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const request: IZoomEditPreviewRequest = Object.freeze({
  folder: Object.freeze({ folderPath: 'D:\\clips' }), filename: 'Sample Feature-001.mp4', source: Object.freeze({ kind: 'clip' }),
  sessionId: FrameReviewOpaqueId.sessionId('session_CCCCCCCCCCCCCCCCCCCCCCCC'), startFrame: 5, endFrame: 45,
});

function serviceAnswering(response: (payload: Record<string, unknown>) => unknown) {
  const listeners = new Set<(value: unknown) => void>();
  const zoomEdit = {
    subscribePreviewProgress: vi.fn((listener: (value: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    preview: vi.fn(async (payload: Record<string, unknown>) => response(payload)),
    releasePreview: vi.fn(async () => ({ ok: true })),
  };
  const emit = (value: unknown) => listeners.forEach(listener => listener(value));
  const win = { clipSandboxDesktop: { zoomEdit } } as unknown as Window;
  return { zoomEdit, emit, listeners, service: new ElectronZoomEditPreviewService(win) };
}

const answering = (mediaSource: unknown) => (payload: Record<string, unknown>) => ({ ok: true, operationId: payload.operationId, result: { mediaSource } });

describe('ElectronZoomEditPreviewService', () => {
  it('asks for a preview of exactly the staged edits of the named clip, by folder path', async () => {
    const { zoomEdit, service } = serviceAnswering(answering('file:///C:/profile/zoom-edit-previews/preview-1.mp4?modified=1'));

    await service.render(request);

    const { operationId, ...payload } = zoomEdit.preview.mock.calls[0][0];
    expect(payload).toStrictEqual({
      folderPath: 'D:\\clips', filename: 'Sample Feature-001.mp4', source: { kind: 'clip' },
      sessionId: 'session_CCCCCCCCCCCCCCCCCCCCCCCC', startFrame: 5, endFrame: 45,
    });
    expect(operationId).toMatch(/^preview_[a-zA-Z0-9_-]{8,120}$/);
  });

  it('answers the preview file’s address', async () => {
    const { service } = serviceAnswering(answering('file:///C:/profile/zoom-edit-previews/preview-1.mp4?modified=1'));

    await expect(service.render(request)).resolves.toBe('file:///C:/profile/zoom-edit-previews/preview-1.mp4?modified=1');
  });

  it.each([
    ['an address that is not a file', 'https://example.test/preview.mp4'],
    ['no address', undefined],
  ])('refuses an answer with %s', async (_case, mediaSource) => {
    const { service } = serviceAnswering(answering(mediaSource));

    await expect(service.render(request)).rejects.toThrow('The zoom edit preview answer is invalid.');
  });

  it('fails with the main process’s message and code', async () => {
    const { service } = serviceAnswering(payload => ({
      ok: false, operationId: payload.operationId, error: { code: 'invalid-request', message: 'The range is outside the clip.' },
    }));

    await expect(service.render(request)).rejects.toMatchObject({ message: 'The range is outside the clip.', code: 'invalid-request' });
  });

  // A preview whose answer the test gives once it has seen the request.
  function renderingPreview() {
    let finish!: () => void;
    const answered = serviceAnswering(payload => new Promise(resolve => {
      finish = () => resolve({ ok: true, operationId: payload.operationId, result: { mediaSource: 'file:///C:/p/preview-1.mp4' } });
    }));
    const progress = vi.fn();
    const rendering = answered.service.render(request, progress);
    return { ...answered, progress, rendering, finish: () => finish() };
  }

  it('passes on the progress of its own preview only', async () => {
    const { zoomEdit, emit, progress, rendering, finish } = renderingPreview();
    await vi.waitFor(() => expect(zoomEdit.preview).toHaveBeenCalled());
    const { operationId } = zoomEdit.preview.mock.calls[0][0];

    emit({ operationId: 'preview_other_1234', renderedFrames: 10, totalFrames: 82 });
    emit({ operationId, renderedFrames: 30, totalFrames: 82 });
    finish();
    await rendering;

    expect(progress.mock.calls).toEqual([[{ renderedFrames: 30, totalFrames: 82 }]]);
  });

  it('stops listening for progress once the preview is answered', async () => {
    const { zoomEdit, listeners, rendering, finish } = renderingPreview();
    await vi.waitFor(() => expect(zoomEdit.preview).toHaveBeenCalled());

    finish();
    await rendering;

    expect(listeners.size).toBe(0);
  });
  it('releases the preview of this app window', async () => {
    const { zoomEdit, service } = serviceAnswering(answering('file:///C:/p/preview-1.mp4'));

    await service.release();

    expect(zoomEdit.releasePreview).toHaveBeenCalledOnce();
  });
});
