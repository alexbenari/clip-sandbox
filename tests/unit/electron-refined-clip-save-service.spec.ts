// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ElectronRefinedClipSaveService } from '../../src/adapters/electron/electron-refined-clip-save-service.js';
import type { IRefinedClipSaveRequest } from '../../src/app/refined-clip-save-service.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const sessionId = FrameReviewOpaqueId.sessionId('session_CCCCCCCCCCCCCCCCCCCCCCCC');
const windowId = 'window_BBBBBBBBBBBBBBBBBBBBBBBB';
const request: IRefinedClipSaveRequest = Object.freeze({
  folder: Object.freeze({ folderPath: 'D:\\clips' }), filename: 'Sample Feature-001.mp4', source: Object.freeze({ kind: 'window', windowId }),
  sessionId, startFrame: 1870, endFrame: 1940, outcome: 'replace',
});
const entry = (name: string) => ({ name, type: 'video/mp4', size: 2048, lastModifiedMs: 1_700_000_000_000 });
const replaced = { filename: 'Sample Feature-001.mp4', entry: entry('Sample Feature-001.mp4'), outcome: 'replaced' };

function serviceAnswering(response: (payload: Record<string, unknown>) => unknown) {
  const listeners = new Set<(value: unknown) => void>();
  const zoomEdit = {
    subscribeSaveProgress: vi.fn((listener: (value: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    save: vi.fn(async (payload: Record<string, unknown>) => response(payload)),
    cancelSave: vi.fn(async (operationId: string) => ({ ok: true, operationId: 'cancel_1', result: null, cancelled: operationId })),
  };
  const emit = (value: unknown) => listeners.forEach(listener => listener(value));
  const win = { clipSandboxDesktop: { zoomEdit } } as unknown as Window;
  return { zoomEdit, emit, service: new ElectronRefinedClipSaveService(win) };
}

const succeeding = (result: unknown) => (payload: Record<string, unknown>) => ({ ok: true, operationId: payload.operationId, result });

describe('ElectronRefinedClipSaveService', () => {
  it('asks to save exactly the requested range of the named clip, by folder path and window id', async () => {
    const { zoomEdit, service } = serviceAnswering(succeeding(replaced));

    await service.save(request);

    const { operationId, ...payload } = zoomEdit.save.mock.calls[0][0];
    expect(payload).toStrictEqual({
      folderPath: 'D:\\clips', filename: 'Sample Feature-001.mp4', source: { kind: 'window', windowId },
      sessionId: 'session_CCCCCCCCCCCCCCCCCCCCCCCC', startFrame: 1870, endFrame: 1940, outcome: 'replace',
    });
    expect(operationId).toMatch(/^refine_[a-zA-Z0-9_-]{8,120}$/);
  });

  it.each([
    ['a replaced clip', replaced],
    ['a replaced clip of another format', { ...replaced, filename: 'Sample Feature-001.mp4', replacedFilename: 'Sample Feature-001.webm' }],
    ['a clip kept beside the original', { filename: 'Sample Feature-001-refined.mp4', entry: entry('Sample Feature-001-refined.mp4'), outcome: 'kept-both' }],
    ['a clip kept because the Recycle Bin refused the original',
      { filename: 'Sample Feature-001-refined.mp4', entry: entry('Sample Feature-001-refined.mp4'), outcome: 'kept-both', notice: 'recycle-bin-refused' }],
    ['a replaced clip kept under the Keep both name because the original’s name was taken',
      { filename: 'Sample Feature-001-refined.mp4', entry: entry('Sample Feature-001-refined.mp4'), outcome: 'replaced', replacedFilename: 'Sample Feature-001.mp4', notice: 'name-taken' }],
    ['a replaced clip kept under the Keep both name because it could not be renamed',
      { filename: 'Sample Feature-001-refined.mp4', entry: entry('Sample Feature-001-refined.mp4'), outcome: 'replaced', replacedFilename: 'Sample Feature-001.mp4', notice: 'rename-failed' }],
    ['a clip saved without its record', { ...replaced, warning: 'Clip saved without source metadata; the metadata writer failed.' }],
  ])('answers %s as the main process gave it', async (_case, result) => {
    const { service } = serviceAnswering(succeeding(result));

    expect(await service.save(request)).toEqual(result);
  });

  it.each([
    ['no answer at all', null],
    ['an unknown outcome', { ...replaced, outcome: 'overwritten' }],
    ['a filename with a folder', { ...replaced, filename: '..\\Sample.mp4', entry: entry('..\\Sample.mp4') }],
    ['an entry for another file', { ...replaced, entry: entry('Other.mp4') }],
    ['an entry that is not an MP4 video', { ...replaced, entry: { ...entry('Sample Feature-001.mp4'), type: 'video/webm' } }],
    ['a negative size', { ...replaced, entry: { ...entry('Sample Feature-001.mp4'), size: -1 } }],
    ['an unknown notice', { ...replaced, outcome: 'kept-both', notice: 'disk-full' }],
    ['a notice on a replaced clip that names no replaced file', { ...replaced, notice: 'name-taken' }],
    ['a Recycle Bin notice on a replaced clip', { ...replaced, replacedFilename: 'Sample Feature-001.webm', notice: 'recycle-bin-refused' }],
    ['a rename notice on a clip kept beside the original', { ...replaced, outcome: 'kept-both', notice: 'rename-failed' }],
    ['a replaced name on a clip kept beside the original', { ...replaced, outcome: 'kept-both', replacedFilename: 'Sample Feature-001.webm' }],
    ['a replaced name with a folder', { ...replaced, replacedFilename: 'D:\\clips\\Sample Feature-001.webm' }],
  ])('refuses an answer with %s', async (_case, result) => {
    const { service } = serviceAnswering(succeeding(result));

    await expect(service.save(request)).rejects.toThrow(/answer is invalid\.$/);
  });

  it('throws the main process’s refusal with its code', async () => {
    const { service } = serviceAnswering(payload => ({
      ok: false, operationId: payload.operationId, error: { code: 'invalid-request', message: 'The movie window is not anchored.' },
    }));

    await expect(service.save(request)).rejects.toMatchObject({ message: 'The movie window is not anchored.', code: 'invalid-request' });
  });

  it('reports valid progress of its own save and ignores other operations and malformed events', async () => {
    const progress: unknown[] = [];
    const { emit, service } = serviceAnswering(payload => {
      emit({ operationId: 'refine_other_operation', stage: 'encoding-video', encodedFrames: 1, totalFrames: 71 });
      emit({ operationId: payload.operationId, stage: 'unknown-stage' });
      emit({ operationId: payload.operationId, stage: 'encoding-video', encodedFrames: 72, totalFrames: 71 });
      emit({ operationId: payload.operationId, stage: 'encoding-video', encodedFrames: 35, totalFrames: 71 });
      emit({ operationId: payload.operationId, stage: 'saving-media' });
      return { ok: true, operationId: payload.operationId, result: replaced };
    });

    await service.save(request, value => progress.push(value));

    expect(progress).toEqual([{ stage: 'encoding-video', encodedFrames: 35, totalFrames: 71 }, { stage: 'saving-media' }]);
  });

  it('stops reporting progress once its save has answered', async () => {
    const progress: unknown[] = [];
    let operationId = '';
    const { emit, service } = serviceAnswering(payload => {
      operationId = String(payload.operationId);
      return { ok: true, operationId, result: replaced };
    });
    await service.save(request, value => progress.push(value));

    emit({ operationId, stage: 'saving-media' });

    expect(progress).toEqual([]);
  });

  it('cancels the save in progress by its operation id', async () => {
    let answer!: (value: unknown) => void;
    const { zoomEdit, service } = serviceAnswering(() => new Promise(resolve => { answer = resolve; }));
    const saving = service.save(request);
    await vi.waitFor(() => expect(zoomEdit.save).toHaveBeenCalled());

    await service.cancelSave();

    const { operationId } = zoomEdit.save.mock.calls[0][0];
    expect(zoomEdit.cancelSave.mock.calls).toEqual([[operationId]]);
    answer({ ok: false, operationId, error: { code: 'cancelled', message: 'Saving was cancelled.' } });
    await expect(saving).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('asks nothing when no save is in progress', async () => {
    const { zoomEdit, service } = serviceAnswering(succeeding(replaced));

    await service.cancelSave();

    expect(zoomEdit.cancelSave).not.toHaveBeenCalled();
  });
});
