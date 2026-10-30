// @ts-nocheck
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { ZoomOverlayControl } from '../../../src/ui/zoom-overlay-control.js';

const createZoomOverlayControl = options => new ZoomOverlayControl(options);

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
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot') });
    controller.on('playbackFailed', onPlaybackFailure);
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
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot') });
    controller.on('playbackFailed', onPlaybackFailure);
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
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot') });
    controller.on('playbackFailed', onPlaybackFailure);
    controller.open({ clipId: 'a', src: 'file:///a.mp4', name: 'a.mp4' });
    document.getElementById('zoomVideo').dispatchEvent(new Event('playing'));
    rejectPlay(new DOMException('Earlier attempt interrupted', 'AbortError'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onPlaybackFailure).not.toHaveBeenCalled();
    controller.close();
  });

  test('reports decode failure after playback starts and permits a report after reopening', () => {
    const onPlaybackFailure = vi.fn();
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot') });
    controller.on('playbackFailed', onPlaybackFailure);
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
    const controller = createZoomOverlayControl({
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
    const first = createZoomOverlayControl({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });
    const secondMount = document.createElement('div');
    secondMount.id = 'zoomLayerRootSecond';
    document.body.appendChild(secondMount);
    const second = createZoomOverlayControl({
      mountEl: secondMount,
      document,
    });

    first.open({ src: 'blob:test-a', name: 'alpha.mp4' });
    second.open({ src: 'blob:test-b', name: 'bravo.webm' });

    expect(document.querySelectorAll('#zoomOverlayStyles')).toHaveLength(1);
  });

  test('opens a zoom overlay with audio muted by default', () => {
    const controller = createZoomOverlayControl({
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
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot'), document,
      audioPreference: { get current() { return { singleClipAudioDefault: audioDefault }; } } });
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
    const controller = createZoomOverlayControl({
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
    const controller = createZoomOverlayControl({
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

  test('asks to close on a backdrop click, staying open for its workflow to decide', () => {
    const controller = createZoomOverlayControl({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });
    const closeRequested = vi.fn();
    controller.on('closeRequested', closeRequested);

    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    document.getElementById('zoomFrame').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closeRequested).not.toHaveBeenCalled();

    document.getElementById('zoomOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closeRequested).toHaveBeenCalledOnce();
    expect(controller.isOpen()).toBe(true);
  });

  function editableZoom() {
    const player = { root: document.createElement('section'), mountInZoomEdit: vi.fn(host => host.replaceChildren(player.root)) };
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot'), document, editPlayer: player });
    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    return { controller, player };
  }

  describe('title', () => {
    const shownTitle = () => {
      const title = document.querySelector('#zoomFrame .zoom-title');
      return title && getComputedStyle(title).display !== 'none' ? title.textContent : null;
    };

    test('shows the zoomed clip’s name wherever Zoom shows the clip, in Zoom and over the edit player', () => {
      const { controller } = editableZoom();

      expect(shownTitle()).toBe('alpha.mp4');
      controller.showEditSurface();
      expect(shownTitle()).toBe('alpha.mp4');
    });

    test('hides the title while titles are hidden, also for the next clip opened', () => {
      const { controller } = editableZoom();

      controller.setTitleHidden(true);
      expect(shownTitle()).toBeNull();
      controller.close();
      controller.open({ clipId: 'clip_2', src: 'blob:test-b', name: 'bravo.mp4' });
      expect(shownTitle()).toBeNull();
    });

    test('shows the title again when titles are shown', () => {
      const { controller } = editableZoom();
      controller.setTitleHidden(true);

      controller.setTitleHidden(false);

      expect(shownTitle()).toBe('alpha.mp4');
    });
  });

  describe('edit surface', () => {

    test('replaces the zoomed video with the edit player and a hint line under it', () => {
      const { controller, player } = editableZoom();

      expect(controller.showEditSurface()).toBe(true);

      const surface = document.getElementById('zoomEditSurface');
      expect(document.getElementById('zoomVideo')).toBeNull();
      expect(surface.contains(player.root)).toBe(true);
      expect(player.root.compareDocumentPosition(document.getElementById('zoomEditHint')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(document.getElementById('zoomFrame').getAttribute('aria-label')).toBe('Zoom edit mode');
      expect(controller.getCurrentClipId()).toBe('clip_1');
    });

    test('shows the keys and the status it is given in the hint line', () => {
      const { controller } = editableZoom();
      controller.showEditSurface();
      const hint = document.getElementById('zoomEditHint');

      controller.showEditHint({ keys: 'Q start · Esc leave', status: 'Finding the source movie…' });
      expect(hint.querySelector('.zoom-edit-hint-keys').textContent).toBe('Q start · Esc leave');
      expect(hint.querySelector('[role="status"]').textContent).toBe('Finding the source movie…');

      controller.showEditHint({ keys: 'Q start · Esc leave', status: null });
      expect(hint.querySelector('[role="status"]').textContent).toBe('');
    });

    test('removes the player and the hint line when the surface is hidden', () => {
      const { controller, player } = editableZoom();
      controller.showEditSurface();

      controller.hideEditSurface();

      expect(document.getElementById('zoomEditSurface')).toBeNull();
      expect(player.root.isConnected).toBe(false);
      expect(document.getElementById('zoomFrame').getAttribute('aria-label')).toBe('Zoomed clip');
    });

    test('plays a preview over the player, silent and looping, until it is hidden', () => {
      const { controller, player } = editableZoom();
      controller.showEditSurface();

      controller.showEditPreview('file:///previews/preview-1.mp4');
      const preview = document.getElementById('zoomEditPreview');
      const shown = [preview.getAttribute('src'), preview.muted, preview.loop, player.root.isConnected];
      controller.hideEditPreview();

      expect(shown).toEqual(['file:///previews/preview-1.mp4', true, true, true]);
      expect(document.getElementById('zoomEditPreview')).toBeNull();
    });

    test('keeps one preview when shown again, and swaps in a new one for another file', () => {
      const { controller } = editableZoom();
      controller.showEditSurface();
      controller.showEditPreview('file:///previews/preview-1.mp4');
      const first = document.getElementById('zoomEditPreview');

      controller.showEditPreview('file:///previews/preview-1.mp4');
      const again = document.getElementById('zoomEditPreview');
      controller.showEditPreview('file:///previews/preview-2.mp4');

      expect(again).toBe(first);
      expect(document.querySelectorAll('#zoomEditPreview').length).toBe(1);
      expect(document.getElementById('zoomEditPreview').getAttribute('src')).toBe('file:///previews/preview-2.mp4');
    });

    test('removes the preview with the edit surface', () => {
      const { controller } = editableZoom();
      controller.showEditSurface();
      controller.showEditPreview('file:///previews/preview-1.mp4');
      const preview = document.getElementById('zoomEditPreview');

      controller.hideEditSurface();

      // A removed preview that kept its source would still hold the file open.
      expect([document.getElementById('zoomEditPreview'), preview.getAttribute('src')]).toEqual([null, null]);
    });

    test('opening a clip again shows its video instead of the edit surface', () => {
      const { controller } = editableZoom();
      controller.showEditSurface();

      controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });

      expect(document.getElementById('zoomEditSurface')).toBeNull();
      expect(document.getElementById('zoomVideo')).not.toBeNull();
    });

    test('has no edit surface without an edit player', () => {
      const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot'), document });
      controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });

      expect(controller.showEditSurface()).toBe(false);
      expect(document.getElementById('zoomVideo')).not.toBeNull();
    });
  });

  test('reports whether the zoomed clip is muted after the audio was toggled', () => {
    const controller = createZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot'), document });
    controller.open({ clipId: 'clip_1', src: 'blob:test-a', name: 'alpha.mp4' });
    expect(controller.isMuted()).toBe(true);

    controller.toggleMuted();

    expect(controller.isMuted()).toBe(false);
  });

  test('forwards right-clicks on the zoomed video through the context-menu seam', () => {
    const onContextMenu = vi.fn();
    const controller = createZoomOverlayControl({
      mountEl: document.getElementById('zoomLayerRoot'),
      document,
    });
    controller.on('contextMenuRequested', onContextMenu);

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


