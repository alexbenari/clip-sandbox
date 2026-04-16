// @ts-nocheck
const ZOOM_OVERLAY_STYLE_ID = 'zoomOverlayStyles';
const DEFAULT_ZOOM_OVERLAY_CSS = `
#zoomLayerRoot{ position:relative; z-index:40; }
.zoom-overlay{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:clamp(16px, 3vw, 32px); background:transparent; }
.zoom-frame{ width:min(66vw, 1200px); height:min(66vh, 820px); max-width:100%; max-height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000; border-radius:18px; border:1px solid rgba(148,163,184,.24); box-shadow:0 20px 60px rgba(0,0,0,.45); }
.zoom-frame:focus{ outline:none; }
.zoom-video{ width:100%; height:100%; object-fit:contain; display:block; background:#000; }
`;

function ensureZoomOverlayStyles(doc) {
  if (doc.getElementById(ZOOM_OVERLAY_STYLE_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = ZOOM_OVERLAY_STYLE_ID;
  styleEl.textContent = DEFAULT_ZOOM_OVERLAY_CSS;
  (doc.head || doc.documentElement).appendChild(styleEl);
}

export class ZoomOverlayController {
  constructor({ mountEl, document: doc = document } = {}) {
    this.mountEl = mountEl;
    this.doc = doc;
    this.overlayEl = null;
    this.frameEl = null;
    this.videoEl = null;
    this.currentItem = null;
    this.handleOverlayClick = (event) => {
      if (event.target === this.overlayEl) this.close();
    };
  }

  ensureMount() {
    if (!this.mountEl) {
      throw new Error('Zoom overlay mount element is required.');
    }
  }

  buildOverlay() {
    this.ensureMount();
    ensureZoomOverlayStyles(this.doc);
    if (this.overlayEl) return;

    this.overlayEl = this.doc.createElement('div');
    this.overlayEl.id = 'zoomOverlay';
    this.overlayEl.className = 'zoom-overlay';
    this.overlayEl.dataset.open = 'true';

    this.frameEl = this.doc.createElement('div');
    this.frameEl.id = 'zoomFrame';
    this.frameEl.className = 'zoom-frame';
    this.frameEl.tabIndex = -1;
    this.frameEl.setAttribute('role', 'dialog');
    this.frameEl.setAttribute('aria-label', 'Zoomed clip');
    this.frameEl.setAttribute('aria-modal', 'false');

    this.overlayEl.appendChild(this.frameEl);
    this.overlayEl.addEventListener('click', this.handleOverlayClick);
    this.mountEl.replaceChildren(this.overlayEl);
  }

  createVideo({ src, name = '' }) {
    const nextVideo = this.doc.createElement('video');
    nextVideo.id = 'zoomVideo';
    nextVideo.className = 'zoom-video';
    nextVideo.src = src;
    nextVideo.dataset.name = name;
    nextVideo.autoplay = true;
    nextVideo.controls = false;
    nextVideo.loop = true;
    nextVideo.muted = true;
    nextVideo.playsInline = true;
    nextVideo.preload = 'auto';
    nextVideo.addEventListener(
      'loadedmetadata',
      () => {
        try {
          nextVideo.currentTime = 0;
        } catch {
          // Ignore browsers that block currentTime assignment before seekable data is ready.
        }
      },
      { once: true }
    );
    nextVideo.addEventListener(
      'canplay',
      () => {
        nextVideo.play().catch(() => {});
      },
      { once: true }
    );
    return nextVideo;
  }

  clearVideo() {
    if (!this.videoEl) return;
    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.videoEl.remove();
    this.videoEl = null;
  }

  open({ clipId = null, src, name = '' } = {}) {
    if (!src) return false;
    this.buildOverlay();
    this.clearVideo();
    this.videoEl = this.createVideo({ src, name });
    this.currentItem = { clipId, src, name };
    this.frameEl.replaceChildren(this.videoEl);
    this.frameEl.focus({ preventScroll: true });
    this.videoEl.play().catch(() => {});
    return true;
  }

  close() {
    if (!this.overlayEl) return false;
    this.clearVideo();
    this.overlayEl.removeEventListener('click', this.handleOverlayClick);
    this.mountEl.replaceChildren();
    this.overlayEl = null;
    this.frameEl = null;
    this.currentItem = null;
    return true;
  }

  destroy() {
    this.close();
  }

  isOpen() {
    return !!this.overlayEl;
  }

  getVideoElement() {
    return this.videoEl;
  }

  toggleMuted() {
    if (!this.videoEl) return null;
    this.videoEl.muted = !this.videoEl.muted;
    return this.videoEl.muted;
  }

  getCurrentClipId() {
    return this.currentItem?.clipId || null;
  }
}

export function createZoomOverlayController(options) {
  return new ZoomOverlayController(options);
}
