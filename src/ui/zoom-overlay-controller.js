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

export function createZoomOverlayController({ mountEl, document: doc = document } = {}) {
  let overlayEl = null;
  let frameEl = null;
  let videoEl = null;
  let currentItem = null;

  function ensureMount() {
    if (!mountEl) {
      throw new Error('Zoom overlay mount element is required.');
    }
  }

  function handleOverlayClick(event) {
    if (event.target === overlayEl) close();
  }

  function buildOverlay() {
    ensureMount();
    ensureZoomOverlayStyles(doc);
    if (overlayEl) return;

    overlayEl = doc.createElement('div');
    overlayEl.id = 'zoomOverlay';
    overlayEl.className = 'zoom-overlay';
    overlayEl.dataset.open = 'true';

    frameEl = doc.createElement('div');
    frameEl.id = 'zoomFrame';
    frameEl.className = 'zoom-frame';
    frameEl.tabIndex = -1;
    frameEl.setAttribute('role', 'dialog');
    frameEl.setAttribute('aria-label', 'Zoomed clip');
    frameEl.setAttribute('aria-modal', 'false');

    overlayEl.appendChild(frameEl);
    overlayEl.addEventListener('click', handleOverlayClick);
    mountEl.replaceChildren(overlayEl);
  }

  function createVideo({ src, name = '' }) {
    const nextVideo = doc.createElement('video');
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

  function clearVideo() {
    if (!videoEl) return;
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.remove();
    videoEl = null;
  }

  function open({ clipId = null, src, name = '' } = {}) {
    if (!src) return false;
    buildOverlay();
    clearVideo();
    videoEl = createVideo({ src, name });
    currentItem = { clipId, src, name };
    frameEl.replaceChildren(videoEl);
    frameEl.focus({ preventScroll: true });
    videoEl.play().catch(() => {});
    return true;
  }

  function close() {
    if (!overlayEl) return false;
    clearVideo();
    overlayEl.removeEventListener('click', handleOverlayClick);
    mountEl.replaceChildren();
    overlayEl = null;
    frameEl = null;
    currentItem = null;
    return true;
  }

  function destroy() {
    close();
  }

  function isOpen() {
    return !!overlayEl;
  }

  function getVideoElement() {
    return videoEl;
  }

  function toggleMuted() {
    if (!videoEl) return null;
    videoEl.muted = !videoEl.muted;
    return videoEl.muted;
  }

  function getCurrentClipId() {
    return currentItem?.clipId || null;
  }

  return {
    open,
    close,
    destroy,
    isOpen,
    getVideoElement,
    toggleMuted,
    getCurrentClipId,
  };
}

