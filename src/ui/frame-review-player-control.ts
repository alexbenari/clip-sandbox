import type { AdjacentDirection } from '../frame-review/adjacent-step-scheduler.js';
import type {
  FrameReviewCapturePoint,
  FrameReviewDisplayFrame,
  FrameReviewEvent,
  IFrameReviewSession,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';

export interface IFrameReviewFrameRenderer {
  render(canvas: HTMLCanvasElement, frame: FrameReviewDisplayFrame, stillCurrent?: () => boolean): Promise<void>;
  clear(canvas: HTMLCanvasElement): void;
}

export interface IFrameReviewDisplayedCapture {
  readonly point: FrameReviewCapturePoint;
  readonly positionUs: bigint;
  readonly sourceGeneration: number;
  readonly thumbnail: FrameReviewDisplayFrame;
}

type FrameReviewPlayerControlOptions = {
  readonly document?: Document;
  readonly frameRenderer?: IFrameReviewFrameRenderer;
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
  private readonly playbackRate: HTMLSelectElement;
  private readonly frameIdentity: HTMLElement;
  private readonly error: HTMLElement;
  private readonly frameRenderer: IFrameReviewFrameRenderer;
  private session: IFrameReviewSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private reviewState: IFrameReviewState | null = null;
  private displayedFrame: FrameReviewDisplayFrame | null = null;
  private requestedFrameKey: string | null = null;
  private pendingDisplay: Readonly<{ key: string; promise: Promise<void> }> | null = null;
  private renderRevision = 0;
  private playing = false;
  private scrubbingExact = false;
  private progressInteractionActive = false;
  private busy = false;
  private busyMessage = '';
  private destroyed = false;

  constructor(options: FrameReviewPlayerControlOptions = {}) {
    const doc = options.document ?? document;
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
        <label>Speed
          <select aria-label="Playback speed" disabled>
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </label>
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
    this.playbackRate = this.required(this.root.querySelector('select'), HTMLSelectElement, 'playback rate');
    this.frameIdentity = this.required(this.root.querySelector('.frame-review-identity'), HTMLElement, 'frame identity');
    this.error = this.required(this.root.querySelector('.frame-review-error'), HTMLElement, 'player error');
    this.bind();
    this.renderState();
  }

  mount(host: HTMLElement, emptyMessage = 'Open a movie to begin'): void {
    if (this.destroyed) throw new Error('Frame-review player is destroyed.');
    this.emptyState.textContent = emptyMessage;
    host.replaceChildren(this.root);
  }

  attachSession(session: IFrameReviewSession | null): void {
    if (this.destroyed) throw new Error('Frame-review player is destroyed.');
    if (session === this.session) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.invalidatePendingDisplay();
    this.displayedFrame = null;
    this.playing = false;
    this.scrubbingExact = false;
    this.progressInteractionActive = false;
    this.busy = false;
    this.busyMessage = '';
    this.frameRenderer.clear(this.canvas);
    this.session = session;
    this.reviewState = session?.state() ?? null;
    if (session) this.unsubscribe = session.subscribe(event => this.onSessionEvent(event));
    this.renderState();
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

  focusInitial(): boolean {
    if (!this.session || this.destroyed) return false;
    this.root.focus();
    return true;
  }

  async togglePlayback(): Promise<void> {
    if (!this.session || this.busy || this.destroyed) return;
    await this.changePlayback();
  }

  async enterExactScrubAt(timestampUs: bigint): Promise<IFrameReviewDisplayedCapture | null> {
    const session = this.session;
    if (!session || !this.reviewState?.captureEnabled || this.busy || this.destroyed) return null;
    this.busy = true;
    this.busyMessage = 'Resolving exact frame';
    this.scrubbingExact = true;
    this.clearError();
    this.renderState();
    try {
      await session.seekPlayback(timestampUs);
      if (this.session !== session || this.destroyed) return null;
      const frame = await session.enterFrameScrub();
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
    if (!this.session || !this.reviewState?.captureEnabled || this.playing || this.busy || this.destroyed) return;
    this.scrubbingExact = true;
    void this.session.pressAdjacent(direction).catch(error => this.showError(error));
  }

  releaseStep(direction?: AdjacentDirection): void {
    if (!this.session || this.destroyed) return;
    void this.session.releaseAdjacent(direction).catch(error => this.showError(error));
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.session) void this.session.releaseAdjacent().catch(error => this.showError(error));
    this.destroyed = true;
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
    this.playbackRate.addEventListener('change', () => { void this.setPlaybackRate(); });
    this.progress.addEventListener('input', () => this.previewProgress());
    this.progress.addEventListener('change', () => { void this.commitProgress(); });
    this.progress.addEventListener('pointerdown', () => { this.progressInteractionActive = true; });
    this.progress.addEventListener('pointercancel', () => { this.progressInteractionActive = false; });
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

  private async setPlaybackRate(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      await session.setRate(Number(this.playbackRate.value));
      this.clearError();
    } catch (error) {
      this.showError(error);
    }
  }

  private previewProgress(): void {
    if (!this.session) return;
    this.progressInteractionActive = true;
    this.updateCurrentTimeFromProgress();
    if (!this.playing && this.reviewState?.captureEnabled) void this.scrubToProgressFrame();
  }

  private async commitProgress(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      if (!this.playing && this.reviewState?.captureEnabled) {
        await this.scrubToProgressFrame();
      } else {
        this.scrubbingExact = false;
        await session.seekPlayback(this.progressTimestampUs());
        this.clearError();
      }
    } catch (error) {
      this.showError(error);
    } finally {
      if (this.session === session) this.progressInteractionActive = false;
    }
  }

  private async scrubToProgressFrame(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const frameIndex = Math.round(Number(this.progress.value));
    this.scrubbingExact = true;
    try {
      await this.requestDisplay(await session.scrubToFrame(frameIndex));
      this.clearError();
    } catch (error) {
      if (!this.isSuperseded(error)) this.showError(error);
    }
  }

  private onSessionEvent(event: FrameReviewEvent): void {
    if (this.destroyed) return;
    if (event.type === 'state') {
      if (this.reviewState && event.state.sourceGeneration !== this.reviewState.sourceGeneration) {
        this.displayedFrame = null;
        this.invalidatePendingDisplay();
      }
      this.reviewState = event.state;
      this.renderState();
      return;
    }
    if (event.type === 'display-frame') {
      if (event.frame.kind === 'playback-frame' && (this.scrubbingExact || this.progressInteractionActive)) return;
      if (event.frame.sourceGeneration === this.reviewState?.sourceGeneration) void this.requestDisplay(event.frame);
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
    const revision = ++this.renderRevision;
    const session = this.session;
    const promise = this.frameRenderer.render(this.canvas, frame, () => (
        !this.destroyed && this.session === session && revision === this.renderRevision
      )).then(() => {
      if (this.destroyed || this.session !== session || revision !== this.renderRevision) return;
      this.displayedFrame = frame;
      this.emptyState.hidden = true;
      this.updateProgressFromFrame(frame);
      this.renderState();
    }).catch(error => {
      if (revision === this.renderRevision) this.showError(error);
    }).finally(() => {
      if (this.pendingDisplay?.promise === promise) this.pendingDisplay = null;
    });
    this.pendingDisplay = Object.freeze({ key, promise });
    await promise;
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

  private updateProgressFromFrame(frame: FrameReviewDisplayFrame): void {
    if (frame.kind === 'exact-frame') {
      this.progress.value = String(frame.identity.frameIndex);
      this.currentTime.textContent = this.formatTime(frame.reviewTimeUs);
    } else {
      const duration = this.effectiveDuration();
      const ratio = duration > 0n ? Number(frame.playbackTimestampUs) / Number(duration) : 0;
      this.progress.value = String(Math.round(Number(this.progress.max) * this.clampRatio(ratio)));
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
    const attached = this.session !== null;
    const exactReady = this.reviewState?.captureEnabled === true;
    const duration = this.effectiveDuration();
    const frameCount = this.reviewState?.preparedReview?.frameCount ?? 0;
    this.progress.max = exactReady && frameCount > 0 ? String(Math.max(0, frameCount - 1)) : '100000';
    this.progress.disabled = !attached || duration <= 0n || this.busy;
    this.playPause.disabled = !attached || this.busy;
    this.playbackRate.disabled = !attached || this.busy;
    this.stepLeft.disabled = !exactReady || this.playing || this.busy;
    this.stepRight.disabled = !exactReady || this.playing || this.busy;
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
  }

  clear(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }
}
