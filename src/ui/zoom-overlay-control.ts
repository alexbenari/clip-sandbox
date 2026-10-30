const ZOOM_OVERLAY_STYLE_ID = 'zoomOverlayStyles';
const DEFAULT_ZOOM_OVERLAY_CSS = `
#zoomLayerRoot{ position:relative; z-index:40; }
.zoom-overlay{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:clamp(16px, 3vw, 32px); background:transparent; }
.zoom-frame{ position:relative; width:min(66vw, 1200px); height:min(66vh, 820px); max-width:100%; max-height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000; border-radius:18px; border:1px solid rgba(148,163,184,.24); box-shadow:0 20px 60px rgba(0,0,0,.45); }
.zoom-frame:focus{ outline:none; }
.zoom-video{ width:100%; height:100%; object-fit:contain; display:block; background:#000; }
.zoom-edit-surface{ width:100%; height:100%; min-height:0; display:flex; flex-direction:column; }
.zoom-edit-picture{ position:relative; flex:1 1 auto; min-height:0; display:flex; }
.zoom-edit-preview{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; background:#000; }
.zoom-edit-picture > .frame-review-player{ flex:1 1 auto; max-width:none; min-height:0; }
.zoom-edit-picture > .frame-review-player > .frame-review-stage{ flex:1 1 auto; aspect-ratio:auto; width:100%; }
.zoom-edit-hint{ flex:none; margin:0; padding:8px 14px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 16px; font-size:13px; line-height:1.4; color:#94a3b8; background:#0b0f14; border-top:1px solid rgba(148,163,184,.2); }
.zoom-edit-hint-status{ color:#e5e7eb; }
.zoom-edit-hint-status:empty{ display:none; }
.zoom-title{ position:absolute; left:0; right:0; bottom:0; z-index:2; pointer-events:none; font-size:13px; line-height:1.3; color:#d1d5db; padding:8px 14px; background:linear-gradient(180deg, rgba(2,6,23,0), rgba(2,6,23,.75)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.zoom-overlay.titles-hidden .zoom-title{ display:none; }
`;

import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';

export interface IClipAudioPreference {
  readonly current: Readonly<{ singleClipAudioDefault: boolean }>;
}

export interface IZoomEditPlayer {
  mountInZoomEdit(host: HTMLElement): void;
}

export type ZoomEditHintText = Readonly<{ keys: string; status: string | null }>;

type ZoomEditSurface = { readonly root: HTMLElement; readonly picture: HTMLElement; readonly keys: HTMLElement;
  readonly status: HTMLElement; preview: HTMLVideoElement | null };

const SILENT_BY_DEFAULT: IClipAudioPreference = Object.freeze({ current: Object.freeze({ singleClipAudioDefault: false }) });

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

export interface IZoomOverlayEvents {
  playbackFailed: Readonly<ZoomPlaybackFailure>;
  contextMenuRequested: Readonly<ZoomContextMenuEvent>;
  closeRequested: void;
}

type ZoomItem = {
  clipId: string | null;
  src: string;
  name: string;
};

export class ZoomOverlayControl implements IEventSource<IZoomOverlayEvents> {
  private readonly mountEl: HTMLElement | null;
  private readonly doc: Document;
  private readonly events = new EventSource<IZoomOverlayEvents>();
  private overlayEl: HTMLElement | null;
  private frameEl: HTMLElement | null;
  private videoEl: HTMLVideoElement | null;
  private currentItem: ZoomItem | null;
  private readonly handleOverlayClick: (event: MouseEvent) => void;
  private readonly audioPreference: IClipAudioPreference;
  private readonly editPlayer: IZoomEditPlayer | null;
  private editSurface: ZoomEditSurface | null = null;
  private playbackAttempt = 0;
  private playbackFailureReported = false;
  private titleHidden = false;

  static fromDocument(doc: Document, { audioPreference, editPlayer }: {
    audioPreference: IClipAudioPreference;
    editPlayer?: IZoomEditPlayer;
  }): ZoomOverlayControl {
    return new ZoomOverlayControl({ mountEl: new DocumentElements(doc).required('zoomLayerRoot'), document: doc, audioPreference, editPlayer });
  }

  constructor({ mountEl, document: doc = document, audioPreference = SILENT_BY_DEFAULT, editPlayer }: {
    mountEl?: HTMLElement | null;
    document?: Document;
    audioPreference?: IClipAudioPreference;
    editPlayer?: IZoomEditPlayer;
  } = {}) {
    this.mountEl = mountEl || null;
    this.doc = doc;
    this.audioPreference = audioPreference;
    this.editPlayer = editPlayer ?? null;
    this.overlayEl = null;
    this.frameEl = null;
    this.videoEl = null;
    this.currentItem = null;
    this.handleOverlayClick = (event) => {
      if (event.target === this.overlayEl) this.events.emit('closeRequested');
    };
  }

  on<TName extends keyof IZoomOverlayEvents>(name: TName, handler: EventHandler<IZoomOverlayEvents[TName]>): () => void {
    return this.events.on(name, handler);
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
    this.overlayEl.classList.toggle('titles-hidden', this.titleHidden);
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
    nextVideo.muted = !this.audioPreference.current.singleClipAudioDefault;
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
      this.events.emit('contextMenuRequested', {
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
    this.events.emit('playbackFailed', {
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
    this.hideEditSurface();
    this.videoEl = this.createVideo({ src, name });
    this.currentItem = { clipId, src, name };
    this.frameEl?.replaceChildren(this.videoEl, this.createTitle(name));
    this.frameEl?.focus({ preventScroll: true });
    this.startPlayback(this.videoEl);
    return true;
  }

  close(): boolean {
    if (!this.overlayEl) return false;
    if (!this.mountEl) return false;
    this.clearVideo();
    this.hideEditSurface();
    this.overlayEl.removeEventListener('click', this.handleOverlayClick);
    this.mountEl.replaceChildren();
    this.overlayEl = null;
    this.frameEl = null;
    this.currentItem = null;
    return true;
  }

  showEditSurface(): boolean {
    const frame = this.frameEl;
    if (!frame || !this.editPlayer) return false;
    if (this.editSurface) return true;
    this.clearVideo();
    const root = this.doc.createElement('div');
    root.id = 'zoomEditSurface';
    root.className = 'zoom-edit-surface';
    const picture = this.doc.createElement('div');
    picture.className = 'zoom-edit-picture';
    const hint = this.doc.createElement('p');
    hint.id = 'zoomEditHint';
    hint.className = 'zoom-edit-hint';
    const keys = this.doc.createElement('span');
    keys.className = 'zoom-edit-hint-keys';
    const status = this.doc.createElement('span');
    status.className = 'zoom-edit-hint-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    hint.append(keys, status);
    root.append(picture, hint);
    frame.replaceChildren(root);
    frame.setAttribute('aria-label', 'Zoom edit mode');
    this.editPlayer.mountInZoomEdit(picture);
    // After mounting, which replaces the picture's children.
    picture.append(this.createTitle(this.currentItem?.name ?? ''));
    this.editSurface = { root, picture, keys, status, preview: null };
    frame.focus({ preventScroll: true });
    return true;
  }

  showEditHint({ keys, status }: ZoomEditHintText): void {
    if (!this.editSurface) return;
    this.editSurface.keys.textContent = keys;
    this.editSurface.status.textContent = status ?? '';
  }

  showEditPreview(mediaSource: string): void {
    const surface = this.editSurface;
    if (!surface || surface.preview?.dataset.mediaSource === mediaSource) return;
    this.hideEditPreview();
    const preview = this.doc.createElement('video');
    preview.id = 'zoomEditPreview';
    preview.className = 'zoom-edit-preview';
    preview.dataset.mediaSource = mediaSource;
    preview.muted = true;
    preview.loop = true;
    preview.autoplay = true;
    preview.playsInline = true;
    preview.src = mediaSource;
    surface.picture.append(preview);
    surface.preview = preview;
  }

  hideEditPreview(): void {
    const preview = this.editSurface?.preview;
    if (!preview || !this.editSurface) return;
    this.editSurface.preview = null;
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    preview.remove();
  }

  hideEditSurface(): void {
    const surface = this.editSurface;
    if (!surface) return;
    this.hideEditPreview();
    this.editSurface = null;
    surface.root.remove();
    this.frameEl?.setAttribute('aria-label', 'Zoomed clip');
  }

  setTitleHidden(hidden: boolean): void {
    this.titleHidden = hidden;
    this.overlayEl?.classList.toggle('titles-hidden', hidden);
  }

  private createTitle(name: string): HTMLElement {
    const title = this.doc.createElement('div');
    title.className = 'zoom-title';
    title.textContent = name;
    title.title = name;
    return title;
  }

  isMuted(): boolean {
    return this.videoEl ? this.videoEl.muted : !this.audioPreference.current.singleClipAudioDefault;
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
