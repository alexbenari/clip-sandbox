// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ElectronZoomEditSourceService } from '../../src/adapters/electron/electron-zoom-edit-source-service.js';
import { FrameReviewOpaqueId } from '../../src/frame-review/frame-review-api.js';

const sourceHandle = 'source_AAAAAAAAAAAAAAAAAAAAAAAA';
const windowId = 'window_BBBBBBBBBBBBBBBBBBBBBBBB';
const sessionId = FrameReviewOpaqueId.sessionId('session_CCCCCCCCCCCCCCCCCCCCCCCC');
const clip = Object.freeze({ folder: Object.freeze({ folderPath: 'D:\\clips' }), filename: 'Sample Feature-001.mp4' });

function serviceAnswering(answer: unknown) {
  const zoomEdit = {
    openClip: vi.fn(async (_request: unknown) => answer),
    openWindow: vi.fn(async (_request: unknown) => answer),
    anchorWindow: vi.fn(async (_request: unknown) => answer),
  };
  const win = { clipSandboxDesktop: { zoomEdit } } as unknown as Window;
  return { zoomEdit, service: new ElectronZoomEditSourceService(win) };
}

describe('ElectronZoomEditSourceService', () => {
  it('asks to open exactly the named clip of the folder', async () => {
    const { zoomEdit, service } = serviceAnswering({ sourceHandle });

    await service.openClip(clip);

    expect(zoomEdit.openClip.mock.calls).toStrictEqual([[{ folderPath: 'D:\\clips', filename: 'Sample Feature-001.mp4' }]]);
  });

  it('answers the opened clip\'s source handle', async () => {
    const { service } = serviceAnswering({ sourceHandle });

    expect(await service.openClip(clip)).toBe(sourceHandle);
  });

  it('refuses an opened clip without a valid source handle', async () => {
    const { service } = serviceAnswering({ sourceHandle: 'source_short' });

    await expect(service.openClip(clip)).rejects.toThrow('The frame-review source handle is invalid.');
  });

  it('asks for the clip\'s first movie window without naming a previous one', async () => {
    const { zoomEdit, service } = serviceAnswering({ kind: 'cancelled' });

    await service.openWindow({ ...clip, widen: 0 });

    expect(zoomEdit.openWindow.mock.calls).toStrictEqual([[{ folderPath: 'D:\\clips', filename: 'Sample Feature-001.mp4', widen: 0 }]]);
  });

  it('asks for a wider movie window naming the window it replaces', async () => {
    const { zoomEdit, service } = serviceAnswering({ kind: 'cancelled' });

    await service.openWindow({ ...clip, widen: 2, previousWindowId: windowId });

    expect(zoomEdit.openWindow.mock.calls).toStrictEqual([[{
      folderPath: 'D:\\clips', filename: 'Sample Feature-001.mp4', widen: 2, previousWindowId: windowId,
    }]]);
  });

  it.each([
    ['a ready window', { kind: 'ready', sourceHandle, windowId }],
    ['a cancelled movie search', { kind: 'cancelled' }],
    ['a clip without source info', { kind: 'no-source-info' }],
    ['a clip whose source info keeps only its movie', { kind: 'movie-only' }],
  ])('answers %s as the main process gave it', async (_scenario, answer) => {
    const { service } = serviceAnswering(answer);

    expect(await service.openWindow({ ...clip, widen: 0 })).toEqual(answer);
  });

  it.each([
    ['an unknown kind', { kind: 'maybe' }, 'The zoom edit window answer is invalid.'],
    ['no answer at all', null, 'The zoom edit window answer is invalid.'],
    ['a bad source handle', { kind: 'ready', sourceHandle: 7, windowId }, 'The frame-review source handle is invalid.'],
    ['a bad window id', { kind: 'ready', sourceHandle, windowId: 'window/../x' }, 'The zoom edit window id is invalid.'],
  ])('refuses a window answer with %s', async (_scenario, answer, message) => {
    const { service } = serviceAnswering(answer);

    await expect(service.openWindow({ ...clip, widen: 0 })).rejects.toThrow(message);
  });

  it('asks to anchor exactly the named window in the named session', async () => {
    const { zoomEdit, service } = serviceAnswering({ kind: 'not-found' });

    await service.anchorWindow({ windowId, sessionId });

    expect(zoomEdit.anchorWindow.mock.calls).toStrictEqual([[{ windowId, sessionId: 'session_CCCCCCCCCCCCCCCCCCCCCCCC' }]]);
  });

  it.each([
    ['an anchored window', { kind: 'anchored', clipStartFrame: 900, earliestFrame: 0, latestFrame: 4_500 }],
    ['an anchored window whose clip starts at its first frame', { kind: 'anchored', clipStartFrame: 0, earliestFrame: 0, latestFrame: 0 }],
    ['no reference frame found', { kind: 'not-found' }],
  ])('answers %s as the main process gave it', async (_scenario, answer) => {
    const { service } = serviceAnswering(answer);

    expect(await service.anchorWindow({ windowId, sessionId })).toEqual(answer);
  });

  it.each([
    ['an unknown kind', { kind: 'found', clipStartFrame: 900, earliestFrame: 0, latestFrame: 4_500 }],
    ['a negative frame', { kind: 'anchored', clipStartFrame: 900, earliestFrame: -1, latestFrame: 4_500 }],
    ['a fractional frame', { kind: 'anchored', clipStartFrame: 900.5, earliestFrame: 0, latestFrame: 4_500 }],
    ['a missing frame', { kind: 'anchored', clipStartFrame: 900, latestFrame: 4_500 }],
    ['an earliest frame after the clip start', { kind: 'anchored', clipStartFrame: 900, earliestFrame: 901, latestFrame: 4_500 }],
    ['a clip start after the latest frame', { kind: 'anchored', clipStartFrame: 4_501, earliestFrame: 0, latestFrame: 4_500 }],
  ])('refuses an anchor answer with %s', async (_scenario, answer) => {
    const { service } = serviceAnswering(answer);

    await expect(service.anchorWindow({ windowId, sessionId })).rejects.toThrow('The zoom edit anchor answer is invalid.');
  });

  it('freezes the answers it gives', async () => {
    const { service } = serviceAnswering({ kind: 'anchored', clipStartFrame: 900, earliestFrame: 0, latestFrame: 4_500 });

    expect(Object.isFrozen(await service.anchorWindow({ windowId, sessionId }))).toBe(true);
  });
});
