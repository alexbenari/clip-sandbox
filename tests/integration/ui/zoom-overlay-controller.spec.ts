// @ts-nocheck
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { ZoomOverlayController } from '../../../src/ui/zoom-overlay-controller.js';

const createZoomOverlayController = options => new ZoomOverlayController(options);

describe('zoom overlay controller', () => {
  let originalPlay;
  let originalPause;
  let originalLoad;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="zoomLayerRoot"></div>';
    originalPlay = HTMLMediaElement.prototype.play;
    originalPause = HTMLMediaElement.prototype.pause;
    originalLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
    HTMLMediaElement.prototype.load = originalLoad;
  });

  test('reports a rejected active playback attempt and duplicate media errors only once', async () => {
    const failure = new DOMException('Unsupported media', 'NotSupportedError');
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(failure));
    const onPlaybackFailure = vi.fn();
    const controller = createZoomOverlayController({ mountEl: document.getElementById('zoomLayerRoot'), onPlaybackFailure });
    controller.open({ clipId: 'clip_1', src: 'file:///damaged.mp4', name: 'damaged.mp4' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const video = document.getElementById('zoomVideo');
    video.dispatchEvent(new Event('error'));
    video.dispatchEvent(new Event('canplay'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onPlaybackFailure).toHaveBeenCalledOnce();
    expect(onPlaybackFailure).toHaveBeenCalledWith({ clipId: 'clip_1', name: 'damaged.mp4', error: failure });
    controller.close();
  });

  test('ignores closed/replaced videos and superseded attempts without hiding a new clip failure', async () => {
    const rejectors = [];
    HTMLMediaElement.prototype.play = vi.fn(() => new Promise((resolve, reject) => rejectors.push(reject)));
    const onPlaybackFailure = vi.fn();
    const controller = createZoomOverlayController({ mountEl: document.getElementById('zoomLayerRoot'), onPlaybackFailure });
    controller.open({ clipId: 'a', src: 'file:///a.mp4', name: 'a.mp4' });
    const oldVideo = document.getElementById('zoomVideo');
    controller.close();
    controller.open({ clipId: 'b', src: 'file:///b.mp4', name: 'b.mp4' });
    const video = document.getElementById('zoomVideo');
    video.dispatchEvent(new Event('canplay'));
    rejectors[0](new DOMException('Closed', 'AbortError'));
    rejectors[1](new DOMException('Superseded', 'AbortError'));
    oldVideo.dispatchEvent(new Event('error'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onPlaybackFailure).not.toHaveBeenCalled();
    const failure = new Error('Current playback failed');
    rejectors[2](failure);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onPlaybackFailure).toHaveBeenCalledWith({ clipId: 'b', name: 'b.mp4', error: failure });
    controller.close();
  });

  test('ignores a late rejected attempt after playback has recovered', async () => {
    let rejectPlay;
    HTMLMediaElement.prototype.play = vi.fn(() => new Promise((resolve, reject) => { rejectPlay = reject; }));
    const onPlaybackFailure = vi.fn();
    const controller = createZoomOverlayController({ mountEl: document.getElementById('zoomLayerRoot'), onPlaybackFailure });
    controller.open({ clipId: 'a', src: 'file:///a.mp4', name: 'a.mp4' });
    document.getElementById('zoomVideo').dispatchEvent(new Event('playing'));
    rejectPlay(new DOMException('Earlier attempt interrupted', 'AbortError'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onPlaybackFailure).not.toHaveBeenCalled();
    controller.close();
  });

  test('reports decode failure after playback starts and permits a report after reopening', () => {
    const onPlaybackFailure = vi.fn();
    const controller = createZoomOverlayController({ mountEl: document.getElementById('zoomLayerRoot'), onPlaybackFailure });
    const clip = { clipId: 'a', src: 'file:///a.mp4', name: 'a.mp4' };
    controller.open(clip);
    const video = document.getElementById('zoomVideo');
    Object.defineProperty(video, 'error', { value: { code: 3, message: 'Decode failed' } });
    video.dispatchEvent(new Event('error'));
    video.dispatchEvent(new Event('error'));
    expect(onPlaybackFailure).toHaveBeenCalledOnce();
    expect(onPlaybackFailure.mock.calls[0][0].error.message).toContain('Decode failed');
    controller.close();
    controller.open(clip);
    document.getElementById('zoomVideo').dispatchEvent(new Event('error'));
    expect(onPlaybackFailure).toHaveBeenCalledTimes(2);
    controller.close();
  });

  test('installs default styles when the overlay is first opened', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    expect(document.getElementById('zoomOverlayStyles')).toBeNull();

    controller.open({ src: 'blob:test-a', name: 'alpha.mp4' });

    const styleEl = document.getElementById('zoomOverlayStyles');
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toContain('.zoom-overlay');
    expect(styleEl.textContent).toContain('#zoomLayerRoot');
  });

  test('installs default styles only once per document', () => {
    const first = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });
    const secondMount = document.createElement('div');
    secondMount.id = 'zoomLayerRootSecond';
    document.body.appendChild(secondMount);
    const second = createZoomOverlayController({
      mountEl: secondMount,
      document,
    });

    first.open({ src: 'blob:test-a', name: 'alpha.mp4' });
    second.open({ src: 'blob:test-b', name: 'bravo.webm' });

    expect(document.querySelectorAll('#zoomOverlayStyles')).toHaveLength(1);
  });

  test('opens a zoom overlay with audio muted by default', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    expect(controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' })).toBe(true);

    const overlay = document.getElementById('zoomOverlay');
    const frame = document.getElementById('zoomFrame');
    const video = document.getElementById('zoomVideo');
    expect(overlay).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.dataset.name).toBe('alpha.mp4');
    expect(document.activeElement).toBe(frame);
    expect(controller.getCurrentClipId()).toBe('clip_1');
    expect(controller.isOpen()).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  test('uses the current preference only when opening a new video', () => {
    let audioDefault = true;
    const controller = createZoomOverlayController({ mountEl: document.getElementById('zoomLayerRoot'), document, audioDefault: () => audioDefault });
    controller.open({ src: 'blob:first', name: 'first.mp4' });
    const first = document.getElementById('zoomVideo');
    expect(first.muted).toBe(false);
    audioDefault = false;
    expect(first.muted).toBe(false);
    controller.close();
    controller.open({ src: 'blob:second', name: 'second.mp4' });
    expect(document.getElementById('zoomVideo').muted).toBe(true);
    controller.toggleMuted();
    expect(document.getElementById('zoomVideo').muted).toBe(false);
    controller.close();
    controller.open({ src: 'blob:third', name: 'third.mp4' });
    expect(document.getElementById('zoomVideo').muted).toBe(true);
  });

  test('toggles zoom audio for the current session only', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    const firstVideo = document.getElementById('zoomVideo');
    expect(firstVideo.muted).toBe(true);

    expect(controller.toggleMuted()).toBe(false);
    expect(firstVideo.muted).toBe(false);
    expect(controller.toggleMuted()).toBe(true);
    expect(firstVideo.muted).toBe(true);

    controller.close();
    controller.open({ src: 'blob:test-a', name: 'alpha.mp4' });
    expect(document.getElementById('zoomVideo').muted).toBe(true);
  });

  test('replaces the current zoomed clip when reopened', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    const firstVideo = document.getElementById('zoomVideo');
    controller.open({ clipId: 'clip_2', src: 'blob:test-b', name: 'bravo.webm' });
    const secondVideo = document.getElementById('zoomVideo');

    expect(secondVideo).not.toBe(firstVideo);
    expect(secondVideo.dataset.name).toBe('bravo.webm');
    expect(controller.getCurrentClipId()).toBe('clip_2');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  test('closes on outside click but not on frame click', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    document.getElementById('zoomFrame').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.isOpen()).toBe(true);

    document.getElementById('zoomOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.isOpen()).toBe(false);
    expect(controller.getCurrentClipId()).toBeNull();
    expect(document.getElementById('zoomLayerRoot').children.length).toBe(0);
  });

  test('forwards right-clicks on the zoomed video through the context-menu seam', () => {
    const onContextMenu = vi.fn();
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
      onContextMenu,
    });

    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 44,
      clientY: 55,
    }));

    expect(onContextMenu).toHaveBeenCalledWith({
      clipId: 'clip_1',
      name: 'alpha.mp4',
      point: { x: 44, y: 55 },
    });
  });
});


