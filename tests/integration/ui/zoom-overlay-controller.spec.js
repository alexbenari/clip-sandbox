import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { createZoomOverlayController } from '../../../src/ui/zoom-overlay-controller.js';

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
});

