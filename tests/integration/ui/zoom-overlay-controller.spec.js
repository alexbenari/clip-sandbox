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

  test('opens a zoom overlay with an unmuted video', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    expect(controller.open({ src: 'blob:test-a', name: 'alpha.mp4' })).toBe(true);

    const overlay = document.getElementById('zoomOverlay');
    const frame = document.getElementById('zoomFrame');
    const video = document.getElementById('zoomVideo');
    expect(overlay).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(video).not.toBeNull();
    expect(video.muted).toBe(false);
    expect(video.dataset.name).toBe('alpha.mp4');
    expect(controller.isOpen()).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  test('replaces the current zoomed clip when reopened', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    controller.open({ src: 'blob:test-a', name: 'alpha.mp4' });
    const firstVideo = document.getElementById('zoomVideo');
    controller.open({ src: 'blob:test-b', name: 'bravo.webm' });
    const secondVideo = document.getElementById('zoomVideo');

    expect(secondVideo).not.toBe(firstVideo);
    expect(secondVideo.dataset.name).toBe('bravo.webm');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
  });

  test('closes on outside click but not on frame click', () => {
    const controller = createZoomOverlayController({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });

    controller.open({ src: 'blob:test-a', name: 'alpha.mp4' });
    document.getElementById('zoomFrame').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.isOpen()).toBe(true);

    document.getElementById('zoomOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.isOpen()).toBe(false);
    expect(document.getElementById('zoomLayerRoot').children.length).toBe(0);
  });
});
