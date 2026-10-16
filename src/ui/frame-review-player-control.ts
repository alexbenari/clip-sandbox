import type { AdjacentDirection } from '../frame-review/adjacent-step-scheduler.js';
import type {
  FrameReviewCapturePoint,
  FrameReviewDisplayFrame,
  FrameReviewEvent,
  IExactDisplayFrame,
  IFrameReviewSession,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import { CaptureEndpoints, type CaptureEndpoint } from '../domain/capture-endpoint.js';
import type { IFrameReviewDisplayedCapture } from '../app/frame-review-displayed-capture.js';

export interface IFrameReviewFrameRenderer {
  render(canvas: HTMLCanvasElement, frame: FrameReviewDisplayFrame, stillCurrent?: () => boolean): Promise<void>;
  clear(canvas: HTMLCanvasElement): void;
}

export interface IPlayerFullScreen {
  enterElementFullScreen(element: HTMLElement): Promise<void>;
  exitFullScreen(): Promise<void>;
  isElementFullScreen(element: Element): boolean;
}

type FrameReviewPlayerControlOptions = {
  readonly document?: Document;
  readonly frameRenderer?: IFrameReviewFrameRenderer;
  readonly fullScreen?: IPlayerFullScreen;
};

type FrameReviewProbeWindow = Window & {
  __clipSandboxFrameReviewPaintProbe?: Readonly<{
    painted: (frame: FrameReviewDisplayFrame, pixels: Uint8ClampedArray, timeMs: number) => void;
    received?: (frame: FrameReviewDisplayFrame, timeMs: number) => void;
    replaced?: () => void;
  }>;
};

export class FrameReviewPlayerControl {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly emptyState: HTMLElement;
  private readonly busyState: HTMLElement;
  private readonly readiness: HTMLElement;
  private readonly preparationProgress: HTMLProgressElement;
  private readonly currentTime: HTMLElement;
  private readonly duration: HTMLElement;
  private readonly progress: HTMLInputElement;
  private readonly playPause: HTMLButtonElement;
  private readonly playIcon: SVGElement;
  private readonly pauseIcon: SVGElement;
  private readonly stepLeft: HTMLButtonElement;
  private readonly stepRight: HTMLButtonElement;
  private readonly jumpDuration: HTMLSelectElement;
  private readonly jumpButton: HTMLButtonElement;
  private readonly fullScreenButton: HTMLButtonElement;
  private readonly progressRow: HTMLElement;
  private readonly frameIdentity: HTMLElement;
  private readonly error: HTMLElement;
  private readonly frameRenderer: IFrameReviewFrameRenderer;
  private readonly doc: Document;
  private readonly fullScreen: IPlayerFullScreen | null;
  private fullScreenRequest = 0;
  private fullScreenPending = false;
  private pendingEntry: Promise<void> | null = null;
  private fullScreenActive = false;
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayHovered = false;
  private lastPointer: Readonly<{ x: number; y: number }> | null = null;
  private reservedHost: Readonly<{ element: HTMLElement; minHeight: string }> | null = null;
  private replacementBarrier: Promise<void> | null = null;
  private session: IFrameReviewSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private reviewState: IFrameReviewState | null = null;
  private displayedFrame: FrameReviewDisplayFrame | null = null;
  private requestedFrameKey: string | null = null;
  private pendingDisplay: Readonly<{ key: string; promise: Promise<void> }> | null = null;
  private renderRevision = 0;
  private playing = false;
  private scrubbingExact = false;
  private previewRange: Readonly<{ startFrameIndex: number; endFrameIndex: number }> | null = null;
  private previewPhase: 'inactive' | 'running' | 'paused' = 'inactive';
  private previewOperationRevision = 0;
  private readonly transportListeners = new Set<() => void>();
  private lastTransportKey = '';
  private readonly heldStepDirections = new Set<AdjacentDirection>();
  private progressInteractionActive = false;
  private lastScrubDirection: AdjacentDirection = 1;
  private queuedJumpUs = 0n;
  private jumpTask: Promise<void> | null = null;
  private jumpRevision = 0;
  private scrubJumpTargetUs: bigint | null = null;
  private jumpUnavailable = false;
  private progressPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private busyMessage = '';
  private initialFrameRequested = false;
  private destroyed = false;

  constructor(options: FrameReviewPlayerControlOptions = {}) {
    const doc = options.document ?? document;
    this.doc = doc;
    this.fullScreen = options.fullScreen ?? null;
    this.frameRenderer = options.frameRenderer ?? new CanvasFrameRenderer();
    this.root = doc.createElement('section');
    this.root.className = 'frame-review-player';
    this.root.tabIndex = -1;
    this.root.setAttribute('aria-label', 'Movie review player');
    this.root.innerHTML = `
      <div class="frame-review-viewport">
        <canvas class="frame-review-canvas" aria-label="Movie frame"></canvas>
        <div class="frame-review-empty">Open a movie to begin</div>
        <div class="frame-review-busy" role="status" aria-live="polite" hidden></div>
      </div>
      <div class="frame-review-readiness" role="status" aria-live="polite">
        <span data-readiness-text>No movie open</span>
        <progress class="frame-review-preparation-progress" max="100" aria-label="Review preparation progress"></progress>
      </div>
      <div class="frame-review-progress-row">
        <span data-time="current">00:00:00.000</span>
        <input type="range" min="0" max="100000" value="0" aria-label="Movie position" disabled>
        <span data-time="duration">00:00:00.000</span>
      </div>
      <div class="frame-review-transport" aria-label="Playback controls">
        <button type="button" data-command="step-left" aria-label="Step backward one frame" title="Step backward one frame" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5v14M18 6l-8 6 8 6V6Z"/></svg>
        </button>
        <button type="button" data-command="play-pause" aria-label="Play" title="Play" disabled>
          <svg data-icon="play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>
          <svg data-icon="pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden><path d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>
        </button>
        <button type="button" data-command="step-right" aria-label="Step forward one frame" title="Step forward one frame" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 5v14M6 6l8 6-8 6V6Z"/></svg>
        </button>
        <label class="frame-review-jump">Jump by
          <select aria-label="Jump by seconds">
            <option value="1">1 second</option><option value="2" selected>2 seconds</option>
            <option value="5">5 seconds</option><option value="7">7 seconds</option>
            <option value="10">10 seconds</option>
          </select>
        </label>
        <button type="button" class="frame-review-jump-button" data-command="jump-seconds" disabled>Jump +2s</button>
        <button type="button" class="frame-review-full-screen" data-command="full-screen" aria-label="Full screen" title="Full screen" disabled>Full screen</button>
        <output class="frame-review-identity">Frame unavailable</output>
      </div>
      <p class="frame-review-error" role="alert"></p>`;
    this.canvas = this.required(this.root.querySelector('canvas'), HTMLCanvasElement, 'player canvas');
    this.emptyState = this.required(this.root.querySelector('.frame-review-empty'), HTMLElement, 'empty state');
    this.busyState = this.required(this.root.querySelector('.frame-review-busy'), HTMLElement, 'busy state');
    this.readiness = this.required(this.root.querySelector('.frame-review-readiness'), HTMLElement, 'readiness state');
    this.preparationProgress = this.required(this.root.querySelector('.frame-review-preparation-progress'), HTMLProgressElement, 'preparation progress');
    this.currentTime = this.required(this.root.querySelector('[data-time="current"]'), HTMLElement, 'current time');
    this.duration = this.required(this.root.querySelector('[data-time="duration"]'), HTMLElement, 'duration');
    this.progress = this.required(this.root.querySelector('input[type="range"]'), HTMLInputElement, 'movie position');
    this.playPause = this.required(this.root.querySelector('[data-command="play-pause"]'), HTMLButtonElement, 'play control');
    this.playIcon = this.required(this.playPause.querySelector('[data-icon="play"]'), SVGElement, 'play icon');
    this.pauseIcon = this.required(this.playPause.querySelector('[data-icon="pause"]'), SVGElement, 'pause icon');
    this.stepLeft = this.required(this.root.querySelector('[data-command="step-left"]'), HTMLButtonElement, 'back step control');
    this.stepRight = this.required(this.root.querySelector('[data-command="step-right"]'), HTMLButtonElement, 'forward step control');
    this.jumpDuration = this.required(this.root.querySelector('.frame-review-jump select'), HTMLSelectElement, 'jump duration');
    this.jumpButton = this.required(this.root.querySelector('[data-command="jump-seconds"]'), HTMLButtonElement, 'jump control');
    this.fullScreenButton = this.required(this.root.querySelector('[data-command="full-screen"]'), HTMLButtonElement, 'full screen control');
    this.progressRow = this.required(this.root.querySelector('.frame-review-progress-row'), HTMLElement, 'progress row');
    this.frameIdentity = this.required(this.root.querySelector('.frame-review-identity'), HTMLElement, 'frame identity');
    this.error = this.required(this.root.querySelector('.frame-review-error'), HTMLElement, 'player error');
    this.bind();
    this.renderState();
  }

  mount(host: HTMLElement, emptyMessage = 'Open a movie to begin'): void {
    if (this.destroyed) throw new Error('Frame-review player is destroyed.');
    if (this.isMovieFullScreen()) void this.exitMovieFullScreen();
    this.emptyState.textContent = emptyMessage;
    host.replaceChildren(this.root);
  }

  attachSession(session: IFrameReviewSession | null): void {
    if (this.destroyed) throw new Error('Frame-review player is destroyed.');
    if (session === this.session) return;
    this.fullScreenRequest += 1;
    this.fullScreenPending = false;
    if (this.isMovieFullScreen() || this.pendingEntry) {
      const barrier = this.exitForReplacement();
      this.replacementBarrier = barrier;
      void barrier.finally(() => {
        if (this.replacementBarrier === barrier) this.replacementBarrier = null;
      });
    }
    this.overlayHovered = false;
    this.lastPointer = null;
    this.hideOverlay();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelProgressPreview();
    this.interruptJumps();
    this.previewOperationRevision += 1;
    this.invalidatePendingDisplay();
    this.displayedFrame = null;
    this.playing = false;
    this.scrubbingExact = false;
    this.previewRange = null;
    this.previewPhase = 'inactive';
    this.heldStepDirections.clear();
    this.progressInteractionActive = false;
    this.lastScrubDirection = 1;
    this.jumpUnavailable = false;
    this.busy = false;
    this.busyMessage = '';
    this.initialFrameRequested = false;
    this.progress.value = '0';
    this.currentTime.textContent = '00:00:00.000';
    this.duration.textContent = '00:00:00.000';
    if (this.replacementBarrier) void this.replacementBarrier.then(() => {
      if (!this.destroyed && this.session === session) this.frameRenderer.clear(this.canvas);
    });
    else this.frameRenderer.clear(this.canvas);
    this.session = session;
    this.reviewState = session?.state() ?? null;
    if (session) this.unsubscribe = session.subscribe(event => this.onSessionEvent(event));
    this.renderState();
    if (session) void this.showInitialFrame(session);
  }

  capturePoint(): FrameReviewCapturePoint | null {
    return this.displayedCapture()?.point ?? null;
  }

  displayedCapture(): IFrameReviewDisplayedCapture | null {
    if (!this.reviewState?.captureEnabled || !this.displayedFrame) return null;
    const frame = this.displayedFrame;
    const point: FrameReviewCapturePoint = frame.kind === 'exact-frame'
      ? Object.freeze({ kind: 'exact-frame', identity: frame.identity })
      : Object.freeze({ kind: 'playback-timestamp', timestampUs: frame.playbackTimestampUs });
    return Object.freeze({
      point,
      positionUs: frame.kind === 'exact-frame' ? frame.reviewTimeUs : frame.playbackTimestampUs,
      sourceGeneration: frame.sourceGeneration,
      thumbnail: frame,
    });
  }

  state(): IFrameReviewState | null {
    return this.reviewState;
  }

  isMovieFullScreen(): boolean { return this.fullScreen?.isElementFullScreen(this.root) === true; }

  canEnterMovieFullScreen(): boolean {
    return !this.destroyed && !this.fullScreenPending && this.fullScreen !== null
      && this.session !== null && this.reviewState?.phase === 'exact-ready' && this.reviewState.captureEnabled;
  }

  toggleMovieFullScreen(): void {
    if (this.isMovieFullScreen()) { void this.exitMovieFullScreen(); return; }
    if (!this.canEnterMovieFullScreen()) return;
    const request = ++this.fullScreenRequest;
    this.fullScreenPending = true;
    this.reserveHostHeight();
    // Keep the browser request in the trusted key or click task.
    const entry = this.fullScreen!.enterElementFullScreen(this.root);
    this.pendingEntry = entry;
    void entry.then(() => {
      if (request !== this.fullScreenRequest && !this.replacementBarrier && this.isMovieFullScreen()) {
        void this.exitMovieFullScreen();
      }
      this.onFullScreenChange();
    }).catch(error => {
      if (request !== this.fullScreenRequest) return;
      this.fullScreenPending = false;
      this.releaseHostHeight();
      this.showError(error);
      this.renderState();
    }).finally(() => {
      if (this.pendingEntry === entry) this.pendingEntry = null;
    });
  }

  async exitMovieFullScreen(): Promise<void> {
    this.fullScreenRequest += 1;
    this.fullScreenPending = false;
    if (!this.isMovieFullScreen()) { this.onFullScreenChange(); return; }
    try { await this.fullScreen?.exitFullScreen(); }
    catch (error) { if (this.isMovieFullScreen()) this.showError(error); }
    this.onFullScreenChange();
  }

  onFullScreenChange(): void {
    const active = this.isMovieFullScreen();
    if (active === this.fullScreenActive) return;
    this.fullScreenActive = active;
    this.fullScreenPending = false;
    this.root.classList.toggle('movie-full-screen', active);
    if (active) {
      if (this.replacementBarrier || !this.isVisibleHost()) {
        if (!this.replacementBarrier) void this.exitMovieFullScreen();
        return;
      }
      this.lastPointer = null;
      this.root.focus();
      this.showOverlay();
      this.scheduleOverlayHide();
    } else {
      this.overlayHovered = false;
      this.lastPointer = null;
      this.hideOverlay();
      this.releaseHostHeight();
      if (!this.destroyed && this.isVisibleHost()) this.root.focus();
    }
    this.renderState();
  }

  private isVisibleHost(): boolean {
    return this.root.isConnected && this.root.closest('[hidden]') === null;
  }

  private async exitForReplacement(): Promise<void> {
    await this.pendingEntry?.catch(() => undefined);
    if (this.isMovieFullScreen()) void this.exitMovieFullScreen();
    for (let attempt = 0; attempt < 30 && this.isMovieFullScreen(); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    if (this.isMovieFullScreen()) {
      const host = this.root.parentElement;
      if (host) { this.root.remove(); host.append(this.root); }
    }
    while (this.isMovieFullScreen()) await new Promise(resolve => setTimeout(resolve, 16));
    this.onFullScreenChange();
  }

  private reserveHostHeight(): void {
    const host = this.root.parentElement;
    if (!host || this.reservedHost) return;
    this.reservedHost = { element: host, minHeight: host.style.minHeight };
    host.style.minHeight = `${host.getBoundingClientRect().height}px`;
  }

  private releaseHostHeight(): void {
    if (!this.reservedHost) return;
    this.reservedHost.element.style.minHeight = this.reservedHost.minHeight;
    this.reservedHost = null;
  }

  private showOverlay(): void {
    this.root.classList.add('movie-overlay-visible');
    this.progressRow.removeAttribute('aria-hidden');
    this.progress.tabIndex = 0;
  }

  private hideOverlay(): void {
    if (this.overlayTimer !== null) clearTimeout(this.overlayTimer);
    this.overlayTimer = null;
    this.root.classList.remove('movie-overlay-visible');
    if (this.doc.activeElement === this.progress) this.root.focus();
    if (this.isMovieFullScreen()) this.progressRow.setAttribute('aria-hidden', 'true');
    else this.progressRow.removeAttribute('aria-hidden');
    this.progress.tabIndex = this.isMovieFullScreen() ? -1 : 0;
  }

  private scheduleOverlayHide(): void {
    if (this.overlayTimer !== null) clearTimeout(this.overlayTimer);
    if (!this.isMovieFullScreen() || this.overlayHovered || this.progressInteractionActive) return;
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = null;
      if (!this.overlayHovered && !this.progressInteractionActive) this.hideOverlay();
    }, 3000);
  }

  exactPreviewPhase(): 'inactive' | 'running' | 'paused' { return this.previewPhase; }

  ordinaryPlaybackRunning(): boolean { return this.playing && this.previewPhase === 'inactive'; }

  exactScrubActive(): boolean { return this.scrubbingExact && !this.playing; }

  setJumpUnavailable(unavailable: boolean): void {
    this.jumpUnavailable = unavailable;
    this.renderState();
  }

  jumpBySeconds(seconds: number): void {
    if (!this.session || this.destroyed || this.jumpUnavailable
      || ![1, 2, 5, 7, 10].includes(seconds)) return;
    if (this.scrubbingExact && !this.playing && !this.reviewState?.captureEnabled) return;
    if (this.previewPhase === 'running') {
      this.previewPhase = 'inactive';
      this.previewRange = null;
    } else if (this.previewPhase === 'paused') {
      this.previewPhase = 'inactive';
      this.previewRange = null;
    }
    const exact = this.scrubbingExact && !this.playing;
    const direction = exact ? this.lastScrubDirection : 1;
    if (exact) {
      const base = this.scrubJumpTargetUs ?? (this.displayedFrame?.kind === 'exact-frame' ? this.displayedFrame.reviewTimeUs : 0n);
      const requested = base + BigInt(direction * seconds) * 1_000_000n;
      const duration = this.reviewState?.preparedReview?.durationUs ?? this.effectiveDuration();
      this.scrubJumpTargetUs = requested < 0n ? 0n : requested > duration ? duration : requested;
    }
    this.queuedJumpUs += BigInt(seconds) * 1_000_000n;
    this.renderState();
    this.startJumps();
  }

  private startJumps(): void {
    if (this.jumpTask || this.queuedJumpUs === 0n) return;
    this.jumpTask = this.drainJumps(this.jumpRevision).finally(() => {
      this.jumpTask = null;
      this.renderState();
      this.startJumps();
    });
  }

  interruptJumps(): Promise<void> {
    if (this.jumpTask) this.invalidatePendingDisplay();
    this.jumpRevision += 1;
    this.queuedJumpUs = 0n;
    this.scrubJumpTargetUs = null;
    return this.jumpTask ?? Promise.resolve();
  }

  private async drainJumps(revision: number): Promise<void> {
    const session = this.session;
    if (!session) return;
    while (this.queuedJumpUs > 0n && revision === this.jumpRevision && this.session === session) {
      const exact = this.scrubbingExact && !this.playing;
      const deltaUs = exact || this.queuedJumpUs > 10_000_000n ? 10_000_000n : this.queuedJumpUs;
      this.queuedJumpUs = exact ? 0n : this.queuedJumpUs - deltaUs;
      try {
        if (exact) {
          const target = this.scrubJumpTargetUs;
          if (target === null) break;
          const frame = await session.scrubToTime(target);
          if (revision !== this.jumpRevision || this.session !== session || this.destroyed) break;
          await this.requestDisplay(frame);
        } else {
          const confirmed = await session.jumpPlaybackBy(deltaUs);
          if (revision !== this.jumpRevision || this.session !== session || this.destroyed) break;
          this.currentTime.textContent = this.formatTime(confirmed);
        }
      } catch (error) {
        if (revision === this.jumpRevision && this.session === session && !this.destroyed) {
          this.showError(error);
          this.queuedJumpUs = 0n;
        }
        break;
      }
    }
    if (revision === this.jumpRevision) this.scrubJumpTargetUs = null;
  }

  subscribeTransport(listener: () => void): () => void {
    this.transportListeners.add(listener);
    return () => this.transportListeners.delete(listener);
  }

  focusInitial(): boolean {
    if (!this.session || this.destroyed) return false;
    this.root.focus();
    return true;
  }

  async togglePlayback(): Promise<void> {
    if (!this.session || this.busy || this.destroyed) return;
    const barrier = this.interruptJumps();
    const revision = this.jumpRevision;
    await barrier;
    if (revision !== this.jumpRevision || this.destroyed) return;
    await this.changePlayback();
  }

  async startExactPreview(range: Readonly<{ startFrameIndex: number; endFrameIndex: number }>): Promise<void> {
    const barrier = this.interruptJumps();
    const revision = this.jumpRevision;
    await barrier;
    if (revision !== this.jumpRevision) return;
    const session = this.session;
    if (!session || !this.reviewState?.captureEnabled || this.destroyed) return;
    const operation = ++this.previewOperationRevision;
    this.scrubbingExact = false;
    this.playing = true;
    this.previewRange = Object.freeze({ ...range });
    this.previewPhase = 'running';
    this.invalidateDisplayedExactFrame();
    this.renderState();
    try {
      await session.startExactPreview(range);
    } catch (error) {
      if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return;
      this.playing = false;
      this.scrubbingExact = true;
      this.previewRange = null;
      this.previewPhase = 'inactive';
      this.renderState();
      throw error;
    }
    if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return;
    this.renderState();
  }

  async pauseExactPreview(): Promise<IFrameReviewDisplayedCapture | null> {
    await this.interruptJumps();
    const session = this.session;
    if (!session || this.destroyed) return null;
    const operation = ++this.previewOperationRevision;
    let frame: IExactDisplayFrame;
    try {
      frame = await session.pauseExactPreview();
    } catch (error) {
      if (this.session === session && !this.destroyed && operation === this.previewOperationRevision) {
        this.playing = false;
        this.scrubbingExact = true;
        this.previewRange = null;
        this.previewPhase = 'inactive';
        const recovered = await session.stopExactPreview().catch(() => null);
        if (recovered) await this.requestDisplay(recovered);
        this.renderState();
      }
      throw error;
    }
    if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return null;
    this.playing = false;
    this.scrubbingExact = true;
    this.previewPhase = 'paused';
    await this.requestDisplay(frame);
    this.renderState();
    return this.displayedCapture();
  }

  async resumeExactPreview(frameIndex: number): Promise<void> {
    await this.interruptJumps();
    const session = this.session;
    if (!session || this.destroyed) return;
    const operation = ++this.previewOperationRevision;
    this.scrubbingExact = false;
    this.playing = true;
    this.previewPhase = 'running';
    this.invalidateDisplayedExactFrame();
    this.renderState();
    try {
      await session.resumeExactPreview(frameIndex);
    } catch (error) {
      if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return;
      this.playing = false;
      this.scrubbingExact = true;
      this.previewPhase = 'paused';
      this.renderState();
      throw error;
    }
    if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return;
    this.renderState();
  }

  async stopExactPreview(): Promise<IFrameReviewDisplayedCapture | null> {
    await this.interruptJumps();
    const session = this.session;
    if (!session || this.destroyed) return null;
    const operation = ++this.previewOperationRevision;
    let frame: IExactDisplayFrame | null;
    try {
      frame = await session.stopExactPreview();
    } catch (error) {
      if (this.session === session && !this.destroyed && operation === this.previewOperationRevision) {
        this.playing = false;
        this.scrubbingExact = true;
        this.previewRange = null;
        this.previewPhase = 'inactive';
        this.renderState();
      }
      throw error;
    }
    if (this.session !== session || this.destroyed || operation !== this.previewOperationRevision) return null;
    this.playing = false;
    this.scrubbingExact = true;
    this.previewRange = null;
    this.previewPhase = 'inactive';
    if (frame) await this.requestDisplay(frame);
    this.renderState();
    return this.displayedCapture();
  }

  async enterExactScrubAt(timestampUs: bigint): Promise<IFrameReviewDisplayedCapture | null> {
    const capture = await this.enterExactScrub(async session => {
      await session.seekPlayback(timestampUs);
      return session.enterFrameScrub();
    });
    if (capture) {
      this.previewRange = null;
      this.previewPhase = 'inactive';
    }
    return capture;
  }

  async enterExactScrubAtFrame(frameIndex: number): Promise<IFrameReviewDisplayedCapture | null> {
    const capture = await this.enterExactScrub(session => session.scrubToFrame(frameIndex));
    if (capture) this.retainPreviewAt(frameIndex);
    return capture;
  }

  async showFrameAfterCapture(review: IFrameReviewSession, endpoint: CaptureEndpoint): Promise<void> {
    if (this.session !== review) return;
    if (endpoint.kind === 'playback-timestamp') {
      await this.enterExactScrub(async session => {
        await session.scrubToTime(endpoint.timestampUs);
        return session.stepAdjacent(1);
      });
      return;
    }
    const frameCount = this.reviewState?.preparedReview?.frameCount ?? 0;
    if (frameCount < 1) return;
    const frameIndex = CaptureEndpoints.frameIndexOf(endpoint);
    await this.enterExactScrubAtFrame(frameIndex < frameCount - 1 ? frameIndex + 1 : frameCount - 1);
  }

  private async enterExactScrub(
    resolveFrame: (session: IFrameReviewSession) => Promise<IExactDisplayFrame>,
  ): Promise<IFrameReviewDisplayedCapture | null> {
    const barrier = this.interruptJumps();
    const revision = this.jumpRevision;
    await barrier;
    if (revision !== this.jumpRevision) return null;
    const session = this.session;
    if (!session || !this.reviewState?.captureEnabled || this.busy || this.destroyed) return null;
    this.busy = true;
    this.busyMessage = 'Resolving exact frame';
    this.scrubbingExact = true;
    this.clearError();
    this.renderState();
    try {
      const frame = await resolveFrame(session);
      if (this.session !== session || this.destroyed) return null;
      await this.requestDisplay(frame);
      if (this.session !== session || this.destroyed) return null;
      this.playing = false;
      return this.displayedCapture();
    } catch (error) {
      if (!this.isSuperseded(error)) this.showError(error);
      return null;
    } finally {
      if (this.session === session && !this.destroyed) {
        this.busy = false;
        this.busyMessage = '';
        this.renderState();
      }
    }
  }

  pressStep(direction: AdjacentDirection): void {
    if (!this.session || !this.reviewState?.captureEnabled || this.busy || this.destroyed) return;
    const wasPlaying = this.playing;
    const activeJump = this.jumpTask;
    const barrier = this.interruptJumps();
    const revision = this.jumpRevision;
    this.lastScrubDirection = direction;
    this.heldStepDirections.add(direction);
    this.playing = false;
    this.scrubbingExact = true;
    this.renderState();
    const step = (): void => {
      if (revision !== this.jumpRevision || this.destroyed || !this.session) return;
      if (wasPlaying) void this.enterExactScrubForHeldStep(direction);
      else if (this.heldStepDirections.has(direction)) {
        void this.session.pressAdjacent(direction).catch(error => this.showError(error));
      }
    };
    if (activeJump) void barrier.then(step);
    else step();
  }

  releaseStep(direction?: AdjacentDirection): void {
    if (!this.session || this.destroyed) return;
    if (direction === undefined) this.heldStepDirections.clear();
    else this.heldStepDirections.delete(direction);
    void this.session.releaseAdjacent(direction).catch(error => this.showError(error));
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.isMovieFullScreen()) void this.exitMovieFullScreen();
    this.hideOverlay();
    this.releaseHostHeight();
    if (this.session) void this.session.releaseAdjacent().catch(error => this.showError(error));
    this.destroyed = true;
    this.interruptJumps();
    this.cancelProgressPreview();
    this.previewOperationRevision += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.renderRevision += 1;
    this.session = null;
    this.reviewState = null;
    this.displayedFrame = null;
    this.requestedFrameKey = null;
    this.pendingDisplay = null;
  }

  private bind(): void {
    this.playPause.addEventListener('click', () => { void this.togglePlayback(); });
    this.fullScreenButton.addEventListener('click', () => this.toggleMovieFullScreen());
    this.root.addEventListener('pointermove', event => {
      if (!this.isMovieFullScreen()) return;
      if (this.lastPointer?.x === event.clientX && this.lastPointer.y === event.clientY) return;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.showOverlay();
      this.scheduleOverlayHide();
    });
    this.progressRow.addEventListener('pointerenter', () => {
      this.overlayHovered = true;
      this.showOverlay();
      if (this.overlayTimer !== null) clearTimeout(this.overlayTimer);
    });
    this.progressRow.addEventListener('pointerleave', () => {
      this.overlayHovered = false;
      this.scheduleOverlayHide();
    });
    this.jumpDuration.addEventListener('change', () => this.renderState());
    this.jumpButton.addEventListener('click', () => this.jumpBySeconds(Number(this.jumpDuration.value)));
    this.progress.addEventListener('input', () => this.previewProgress());
    this.progress.addEventListener('change', () => { void this.commitProgress(); });
    this.progress.addEventListener('pointerdown', () => {
      this.progressInteractionActive = true;
      this.interruptJumps();
    });
    this.progress.addEventListener('pointercancel', () => {
      this.cancelProgressPreview();
      this.progressInteractionActive = false;
      if (this.isMovieFullScreen()) { this.root.focus(); this.scheduleOverlayHide(); }
    });
    this.progress.addEventListener('pointerup', () => {
      if (this.isMovieFullScreen()) { this.root.focus(); this.scheduleOverlayHide(); }
    });
    this.bindStepButton(this.stepLeft, -1);
    this.bindStepButton(this.stepRight, 1);
  }

  private bindStepButton(button: HTMLButtonElement, direction: AdjacentDirection): void {
    button.addEventListener('pointerdown', event => {
      button.setPointerCapture?.(event.pointerId);
      this.pressStep(direction);
    });
    button.addEventListener('pointerup', () => this.releaseStep(direction));
    button.addEventListener('pointercancel', () => this.releaseStep(direction));
    button.addEventListener('lostpointercapture', () => this.releaseStep(direction));
  }

  private async changePlayback(): Promise<void> {
    const session = this.session;
    if (!session) return;
    if (this.previewPhase === 'running') {
      try { await this.pauseExactPreview(); }
      catch (error) { this.showError(error); }
      return;
    }
    if (this.previewPhase === 'paused') {
      const frameIndex = this.displayedFrame?.kind === 'exact-frame'
        ? this.displayedFrame.identity.frameIndex : null;
      if (frameIndex !== null && this.inPreviewRange(frameIndex)) {
        try { await this.resumeExactPreview(frameIndex); }
        catch (error) { this.showError(error); }
        return;
      }
      this.previewRange = null;
      this.previewPhase = 'inactive';
    }
    this.busy = true;
    this.busyMessage = this.playing ? 'Pausing playback' : 'Starting playback';
    this.clearError();
    if (!this.playing) {
      this.playing = true;
      this.scrubbingExact = false;
      this.invalidateDisplayedExactFrame();
      this.renderState();
      try {
        await session.play();
      } catch (error) {
        this.playing = false;
        this.showError(error);
      }
    } else {
      this.playing = false;
      this.scrubbingExact = this.reviewState?.captureEnabled === true;
      this.renderState();
      try {
        if (this.reviewState?.captureEnabled) await this.requestDisplay(await session.enterFrameScrub());
        else await session.pause();
      } catch (error) {
        this.showError(error);
      }
    }
    if (this.session === session) {
      this.busy = false;
      this.busyMessage = '';
      this.renderState();
    }
  }

  private async enterExactScrubForHeldStep(direction: AdjacentDirection): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.busy = true;
    this.busyMessage = 'Resolving exact frame';
    this.playing = false;
    this.scrubbingExact = true;
    this.clearError();
    this.renderState();
    try {
      await this.requestDisplay(await session.enterFrameScrub());
      if (this.displayedFrame?.kind === 'exact-frame') this.retainPreviewAt(this.displayedFrame.identity.frameIndex);
      if (this.session === session && !this.destroyed) {
        if (this.heldStepDirections.has(direction)) await session.pressAdjacent(direction);
      }
    } catch (error) {
      if (!this.isSuperseded(error)) this.showError(error);
    } finally {
      if (this.session === session && !this.destroyed) {
        this.busy = false;
        this.busyMessage = '';
        this.renderState();
      }
    }
  }

  private previewProgress(): void {
    if (!this.session) return;
    this.interruptJumps();
    this.progressInteractionActive = true;
    this.rememberSliderDirection();
    this.updateCurrentTimeFromProgress();
    if (!this.playing && this.reviewState?.captureEnabled) void this.scrubToProgressFrame();
    else {
      this.cancelProgressPreview();
      const session = this.session;
      const timestampUs = this.progressTimestampUs();
      this.progressPreviewTimer = setTimeout(() => {
        this.progressPreviewTimer = null;
        if (this.session !== session || !this.progressInteractionActive || this.destroyed) return;
        if (this.previewPhase === 'running') {
          this.previewOperationRevision += 1;
          this.previewRange = null;
          this.previewPhase = 'inactive';
          this.renderState();
        }
        void session.seekPlayback(timestampUs).catch(error => {
          if (this.session === session && !this.destroyed) this.showError(error);
        });
      }, 100);
    }
  }

  private async commitProgress(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const barrier = this.interruptJumps();
    const revision = this.jumpRevision;
    await barrier;
    if (revision !== this.jumpRevision || this.session !== session) return;
    this.cancelProgressPreview();
    try {
      if (!this.playing && this.reviewState?.captureEnabled) {
        await this.scrubToProgressFrame();
      } else {
        this.scrubbingExact = false;
        await session.seekPlayback(this.progressTimestampUs());
        this.previewRange = null;
        this.previewPhase = 'inactive';
        this.clearError();
      }
    } catch (error) {
      this.showError(error);
    } finally {
      if (this.session === session) {
        this.progressInteractionActive = false;
        if (this.isMovieFullScreen()) { this.root.focus(); this.scheduleOverlayHide(); }
      }
    }
  }

  private cancelProgressPreview(): void {
    if (this.progressPreviewTimer !== null) clearTimeout(this.progressPreviewTimer);
    this.progressPreviewTimer = null;
  }

  private async scrubToProgressFrame(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const barrier = this.jumpTask;
    if (barrier) await barrier;
    if (this.session !== session || this.destroyed) return;
    const frameIndex = Math.round(Number(this.progress.value));
    this.scrubbingExact = true;
    try {
      await this.requestDisplay(await session.scrubToFrame(frameIndex));
      this.retainPreviewAt(frameIndex);
      this.clearError();
    } catch (error) {
      if (!this.isSuperseded(error)) this.showError(error);
    }
  }

  private rememberSliderDirection(): void {
    if (this.playing || !this.reviewState?.captureEnabled || this.displayedFrame?.kind !== 'exact-frame') return;
    const target = Number(this.progress.value);
    const current = this.displayedFrame.identity.frameIndex;
    if (target > current) this.lastScrubDirection = 1;
    else if (target < current) this.lastScrubDirection = -1;
  }

  private onSessionEvent(event: FrameReviewEvent): void {
    if (this.destroyed) return;
    if (event.type === 'state') {
      if (this.reviewState && event.state.sourceGeneration !== this.reviewState.sourceGeneration) {
        this.displayedFrame = null;
        this.invalidatePendingDisplay();
      }
      this.reviewState = event.state;
      if (this.isMovieFullScreen() && (!event.state.captureEnabled || event.state.phase !== 'exact-ready')) {
        void this.exitMovieFullScreen();
      }
      this.renderState();
      if (event.state.captureEnabled && this.session) void this.showInitialFrame(this.session);
      return;
    }
    if (event.type === 'display-frame') {
      (window as FrameReviewProbeWindow).__clipSandboxFrameReviewPaintProbe?.received?.(event.frame, performance.now());
      if (event.frame.kind === 'playback-frame' && this.scrubbingExact) return;
      if (event.frame.kind === 'exact-frame' && this.previewPhase === 'running') return;
      if (event.frame.sourceGeneration === this.reviewState?.sourceGeneration) void this.requestDisplay(event.frame);
      return;
    }
    if (event.type === 'playback-ended') {
      if (this.previewPhase === 'inactive') {
        this.playing = false;
        this.renderState();
      }
      return;
    }
    this.showError(event.message);
  }

  private async requestDisplay(frame: FrameReviewDisplayFrame): Promise<void> {
    if (frame.kind === 'exact-frame') this.scrubbingExact = true;
    const key = `${frame.kind}:${frame.sourceGeneration}:${frame.frameGeneration}`;
    if (key === this.requestedFrameKey) {
      await this.pendingDisplay?.promise;
      return;
    }
    this.requestedFrameKey = key;
    if (this.pendingDisplay) (window as FrameReviewProbeWindow).__clipSandboxFrameReviewPaintProbe?.replaced?.();
    const revision = ++this.renderRevision;
    const session = this.session;
    const promise = (async () => {
      if (this.replacementBarrier) await this.replacementBarrier;
      if (this.destroyed || this.session !== session || revision !== this.renderRevision) return;
      await this.frameRenderer.render(this.canvas, frame, () => (
        !this.destroyed && this.session === session && revision === this.renderRevision
      ));
      if (this.destroyed || this.session !== session || revision !== this.renderRevision) return;
      this.displayedFrame = frame;
      if (frame.kind === 'exact-frame') this.retainPreviewAt(frame.identity.frameIndex);
      this.emptyState.hidden = true;
      this.updateProgressFromFrame(frame);
      this.renderState();
    })().catch(error => {
      if (revision === this.renderRevision) this.showError(error);
    }).finally(() => {
      if (this.pendingDisplay?.promise === promise) this.pendingDisplay = null;
    });
    this.pendingDisplay = Object.freeze({ key, promise });
    await promise;
  }

  private async showInitialFrame(session: IFrameReviewSession): Promise<void> {
    if (this.initialFrameRequested || !this.reviewState?.captureEnabled || this.playing || this.busy
      || this.scrubbingExact || this.progressInteractionActive || this.displayedFrame || this.pendingDisplay) return;
    this.initialFrameRequested = true;
    try {
      const frame = await session.thumbnailFrame(0);
      if (this.session !== session || this.destroyed || this.playing || this.busy || this.scrubbingExact
        || this.progressInteractionActive || this.displayedFrame || this.pendingDisplay) return;
      await this.requestDisplay(frame);
    } catch (error) {
      if (this.session === session && !this.destroyed && !this.displayedFrame) this.showError(error);
    }
  }

  private invalidatePendingDisplay(): void {
    this.pendingDisplay = null;
    this.renderRevision += 1;
    this.requestedFrameKey = null;
  }

  private invalidateDisplayedExactFrame(): void {
    if (this.displayedFrame?.kind === 'exact-frame') this.displayedFrame = null;
    this.invalidatePendingDisplay();
  }

  private inPreviewRange(frameIndex: number): boolean {
    return this.previewRange !== null && frameIndex >= this.previewRange.startFrameIndex
      && frameIndex <= this.previewRange.endFrameIndex;
  }

  private retainPreviewAt(frameIndex: number): void {
    if (this.previewPhase === 'inactive') return;
    if (this.inPreviewRange(frameIndex)) this.previewPhase = 'paused';
    else {
      this.previewRange = null;
      this.previewPhase = 'inactive';
    }
  }

  private updateProgressFromFrame(frame: FrameReviewDisplayFrame): void {
    if (frame.kind === 'exact-frame') {
      this.progress.value = String(frame.identity.frameIndex);
      this.currentTime.textContent = this.formatTime(frame.reviewTimeUs);
    } else {
      const duration = this.effectiveDuration();
      const ratio = duration > 0n ? Number(frame.playbackTimestampUs) / Number(duration) : 0;
      if (!this.progressInteractionActive) {
        this.progress.value = String(Math.round(Number(this.progress.max) * this.clampRatio(ratio)));
      }
      this.currentTime.textContent = this.formatTime(frame.playbackTimestampUs);
    }
  }

  private updateCurrentTimeFromProgress(): void {
    const prepared = this.reviewState?.preparedReview;
    if (!this.playing && this.reviewState?.captureEnabled && prepared && prepared.frameCount > 1) {
      const ratio = Number(this.progress.value) / (prepared.frameCount - 1);
      this.currentTime.textContent = this.formatTime(BigInt(Math.round(Number(prepared.durationUs) * ratio)));
      return;
    }
    this.currentTime.textContent = this.formatTime(this.progressTimestampUs());
  }

  private progressTimestampUs(): bigint {
    const duration = this.effectiveDuration();
    const maximum = Math.max(1, Number(this.progress.max));
    return BigInt(Math.round(Number(duration) * this.clampRatio(Number(this.progress.value) / maximum)));
  }

  private renderState(): void {
    const transportKey = `${this.playing}:${this.scrubbingExact}:${this.previewPhase}:${this.busy}`;
    if (transportKey !== this.lastTransportKey) {
      this.lastTransportKey = transportKey;
      queueMicrotask(() => { if (!this.destroyed) for (const listener of this.transportListeners) listener(); });
    }
    const attached = this.session !== null;
    const exactReady = this.reviewState?.captureEnabled === true;
    const duration = this.effectiveDuration();
    const frameCount = this.reviewState?.preparedReview?.frameCount ?? 0;
    this.progress.max = exactReady && frameCount > 0 ? String(Math.max(0, frameCount - 1)) : '100000';
    this.progress.disabled = !attached || duration <= 0n || this.busy;
    this.playPause.disabled = !attached || this.busy;
    this.stepLeft.disabled = !exactReady || this.playing || this.busy;
    this.stepRight.disabled = !exactReady || this.playing || this.busy;
    const jumpSeconds = Number(this.jumpDuration.value);
    const jumpDirection = this.scrubbingExact && !this.playing ? this.lastScrubDirection : 1;
    this.jumpButton.textContent = `Jump ${jumpDirection === 1 ? '+' : '−'}${jumpSeconds}s`;
    this.jumpButton.setAttribute('aria-label', `Jump ${jumpDirection === 1 ? 'forward' : 'backward'} ${jumpSeconds} ${jumpSeconds === 1 ? 'second' : 'seconds'}`);
    this.jumpButton.disabled = !attached || this.jumpUnavailable
      || (this.scrubbingExact && !this.playing && !exactReady);
    this.fullScreenButton.disabled = !this.canEnterMovieFullScreen();
    this.duration.textContent = this.formatTime(duration);
    this.playPause.dataset.playing = String(this.playing);
    this.playPause.title = this.playing ? 'Pause' : 'Play';
    this.playPause.setAttribute('aria-label', this.playPause.title);
    this.playIcon.toggleAttribute('hidden', this.playing);
    this.pauseIcon.toggleAttribute('hidden', !this.playing);
    const preparing = this.isPreparing();
    this.readiness.hidden = !preparing;
    this.readiness.classList.toggle('is-preparing', preparing);
    this.readiness.setAttribute('aria-busy', String(preparing));
    const readinessText = this.required(this.readiness.querySelector('[data-readiness-text]'), HTMLElement, 'readiness text');
    readinessText.textContent = this.readinessText();
    const progressPercent = this.reviewState?.progressPercent ?? null;
    this.preparationProgress.hidden = !preparing;
    if (progressPercent === null) this.preparationProgress.removeAttribute('value');
    else this.preparationProgress.value = progressPercent;
    this.frameIdentity.textContent = this.displayedFrame?.kind === 'exact-frame'
      ? `Frame ${this.displayedFrame.identity.frameIndex.toLocaleString()}`
      : attached ? 'Playback time' : 'Frame unavailable';
    this.emptyState.hidden = this.displayedFrame !== null;
    if (attached) this.emptyState.textContent = 'Preparing Movie...';
    this.busyState.hidden = !this.busy;
    this.busyState.textContent = this.busy ? this.busyMessage : '';
  }

  private readinessText(): string {
    const state = this.reviewState;
    if (!state) return 'No movie open';
    if (state.phase === 'exact-ready') return state.preparedReview?.cacheHit ? 'Exact review ready from cache' : 'Exact review ready';
    if (state.phase === 'failed') return 'Playback available; exact review unavailable';
    const description = state.phase === 'playback-ready'
      ? 'Playback ready; preparing exact review'
      : state.message ?? this.phaseLabel(state.phase);
    return state.progressPercent === null ? description : `${description} · ${Math.round(state.progressPercent)}%`;
  }

  private isPreparing(): boolean {
    const phase = this.reviewState?.phase;
    return phase !== undefined && phase !== 'exact-ready' && phase !== 'failed' && phase !== 'closed';
  }

  private phaseLabel(phase: IFrameReviewState['phase']): string {
    const labels: Record<IFrameReviewState['phase'], string> = {
      opening: 'Opening movie',
      'playback-ready': 'Playback ready',
      inspecting: 'Inspecting source',
      'cache-validation': 'Checking prepared review',
      normalizing: 'Normalizing timestamps',
      indexing: 'Building exact frame index',
      'proxy-encoding': 'Creating review proxy',
      'proxy-ready': 'Review proxy ready',
      'proxy-indexing': 'Indexing review proxy',
      validating: 'Validating exact frames',
      'exact-ready': 'Exact review ready',
      failed: 'Exact review unavailable',
      closed: 'Movie review closed',
    };
    return labels[phase];
  }

  private clearError(): void { this.error.textContent = ''; }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error.textContent = message.split(/\r?\n/, 1)[0].slice(0, 500);
  }

  private isSuperseded(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { category?: unknown }).category === 'stale-response';
  }

  private formatTime(timeUs: bigint): string {
    const totalMs = Number(timeUs / 1_000n);
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    const milliseconds = totalMs % 1_000;
    return `${this.two(hours)}:${this.two(minutes)}:${this.two(seconds)}.${String(milliseconds).padStart(3, '0')}`;
  }

  private two(value: number): string { return String(value).padStart(2, '0'); }
  private clampRatio(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  private effectiveDuration(): bigint {
    const playbackDuration = this.reviewState?.playbackDurationUs ?? 0n;
    return playbackDuration > 0n ? playbackDuration : this.reviewState?.preparedReview?.durationUs ?? 0n;
  }

  private required<T extends Element>(value: Element | null, constructor: { new (...args: never[]): T }, label: string): T {
    if (!(value instanceof constructor)) throw new Error(`Frame-review ${label} is missing.`);
    return value;
  }
}

class CanvasFrameRenderer implements IFrameReviewFrameRenderer {
  async render(canvas: HTMLCanvasElement, frame: FrameReviewDisplayFrame, stillCurrent = () => true): Promise<void> {
    const bytes = new Uint8ClampedArray(await frame.pixels.arrayBuffer());
    if (!stillCurrent()) return;
    if (bytes.byteLength !== frame.width * frame.height * 4) throw new Error('Frame-review pixel payload has an unexpected size.');
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('Frame-review canvas is unavailable.');
    canvas.width = frame.width;
    canvas.height = frame.height;
    context.putImageData(new ImageData(bytes, frame.width, frame.height), 0, 0);
    (window as FrameReviewProbeWindow).__clipSandboxFrameReviewPaintProbe?.painted(frame, bytes, performance.now());
  }

  clear(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }
}
