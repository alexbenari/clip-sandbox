const ZOOM_OVERLAY_STYLE_ID = 'zoomOverlayStyles';
const DEFAULT_ZOOM_OVERLAY_CSS = `
#zoomLayerRoot{ position:relative; z-index:40; }
.zoom-overlay{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:clamp(16px, 3vw, 32px); background:transparent; }
.zoom-frame{ width:min(66vw, 1200px); height:min(66vh, 820px); max-width:100%; max-height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000; border-radius:18px; border:1px solid rgba(148,163,184,.24); box-shadow:0 20px 60px rgba(0,0,0,.45); }
.zoom-frame:focus{ outline:none; }
.zoom-video{ width:100%; height:100%; object-fit:contain; display:block; background:#000; }
`;

type ZoomContextMenuEvent = {
  clipId: string | null;
  name: string;
  point: { x: number; y: number };
};

type ZoomPlaybackFailure = {
  clipId: string | null;
  name: string;
  error: unknown;
};

type ZoomItem = {
  clipId: string | null;
  src: string;
  name: string;
};

export class ZoomOverlayController {
  private readonly mountEl: HTMLElement | null;
  private readonly doc: Document;
  private readonly onContextMenu: ((event: ZoomContextMenuEvent) => void) | null;
  private overlayEl: HTMLElement | null;
  private frameEl: HTMLElement | null;
  private videoEl: HTMLVideoElement | null;
  private currentItem: ZoomItem | null;
  private readonly handleOverlayClick: (event: MouseEvent) => void;
  private readonly audioDefault: () => boolean;
  private readonly onPlaybackFailure: (event: ZoomPlaybackFailure) => void;
  private playbackAttempt = 0;
  private playbackFailureReported = false;

  constructor({ mountEl, document: doc = document, onContextMenu = null, audioDefault = () => false, onPlaybackFailure = () => {} }: {
    mountEl?: HTMLElement | null;
    document?: Document;
    audioDefault?: () => boolean;
    onPlaybackFailure?: (event: ZoomPlaybackFailure) => void;
    onContextMenu?: ((event: ZoomContextMenuEvent) => void) | null;
  } = {}) {
    this.mountEl = mountEl || null;
    this.doc = doc;
    this.audioDefault = audioDefault;
    this.onPlaybackFailure = onPlaybackFailure;
    this.onContextMenu = onContextMenu;
    this.overlayEl = null;
    this.frameEl = null;
    this.videoEl = null;
    this.currentItem = null;
    this.handleOverlayClick = (event) => {
      if (event.target === this.overlayEl) this.close();
    };
  }

  private ensureMount(): HTMLElement {
    if (!this.mountEl) {
      throw new Error('Zoom overlay mount element is required.');
    }
    return this.mountEl;
  }

  private buildOverlay(): void {
    const mountEl = this.ensureMount();
    this.ensureStyles();
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
    mountEl.replaceChildren(this.overlayEl);
  }

  private createVideo({ src, name = '' }: { src: string; name?: string }): HTMLVideoElement {
    const nextVideo = this.doc.createElement('video');
    nextVideo.id = 'zoomVideo';
    nextVideo.className = 'zoom-video';
    nextVideo.src = src;
    nextVideo.dataset.name = name;
    nextVideo.autoplay = true;
    nextVideo.controls = false;
    nextVideo.loop = true;
    nextVideo.muted = !this.audioDefault();
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
        this.startPlayback(nextVideo);
      },
      { once: true }
    );
    nextVideo.addEventListener('playing', () => {
      if (nextVideo === this.videoEl) this.playbackAttempt += 1;
    });
    nextVideo.addEventListener('error', () => this.reportPlaybackFailure(nextVideo, new Error('Video playback failed.')));
    nextVideo.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.onContextMenu?.({
        clipId: this.getCurrentClipId(),
        name,
        point: {
          x: event.clientX,
          y: event.clientY,
        },
      });
    });
    return nextVideo;
  }

  private startPlayback(video: HTMLVideoElement): void {
    if (video !== this.videoEl) return;
    const attempt = ++this.playbackAttempt;
    const failed = (error: unknown) => {
      if (attempt !== this.playbackAttempt) return;
      this.reportPlaybackFailure(video, error);
    };
    try {
      void video.play().catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  private reportPlaybackFailure(video: HTMLVideoElement, error: unknown): void {
    if (video !== this.videoEl || !this.currentItem || this.playbackFailureReported) return;
    this.playbackFailureReported = true;
    const mediaError = video.error;
    this.onPlaybackFailure({
      clipId: this.currentItem.clipId,
      name: this.currentItem.name,
      error: mediaError ? new Error(`Media error ${mediaError.code}: ${mediaError.message || 'Playback failed.'}`, { cause: error }) : error,
    });
  }

  private clearVideo(): void {
    const video = this.videoEl;
    this.videoEl = null;
    this.playbackAttempt += 1;
    this.playbackFailureReported = false;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  open({ clipId = null, src, name = '' }: { clipId?: string | null; src?: string; name?: string } = {}): boolean {
    if (!src) return false;
    this.buildOverlay();
    this.clearVideo();
    this.videoEl = this.createVideo({ src, name });
    this.currentItem = { clipId, src, name };
    this.frameEl?.replaceChildren(this.videoEl);
    this.frameEl?.focus({ preventScroll: true });
    this.startPlayback(this.videoEl);
    return true;
  }

  close(): boolean {
    if (!this.overlayEl) return false;
    if (!this.mountEl) return false;
    this.clearVideo();
    this.overlayEl.removeEventListener('click', this.handleOverlayClick);
    this.mountEl.replaceChildren();
    this.overlayEl = null;
    this.frameEl = null;
    this.currentItem = null;
    return true;
  }

  destroy(): void {
    this.close();
  }

  isOpen(): boolean {
    return !!this.overlayEl;
  }

  toggleMuted(): boolean | null {
    if (!this.videoEl) return null;
    this.videoEl.muted = !this.videoEl.muted;
    return this.videoEl.muted;
  }

  getCurrentClipId(): string | null {
    return this.currentItem?.clipId || null;
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(ZOOM_OVERLAY_STYLE_ID)) return;
    const styleEl = this.doc.createElement('style');
    styleEl.id = ZOOM_OVERLAY_STYLE_ID;
    styleEl.textContent = DEFAULT_ZOOM_OVERLAY_CSS;
    (this.doc.head || this.doc.documentElement).appendChild(styleEl);
  }
}
