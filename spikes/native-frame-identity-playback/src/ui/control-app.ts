import { AdjacentStepScheduler } from '../adapter/adjacent-step-scheduler.js';
import { RangeCaptureModel } from '../model/range-capture-model.js';
import { sourceFrameIdentityFromWire, sourceFrameTimeUs, type ISourceFrameIdentity } from '../model/source-frame-identity.js';
import type { IFrameIdentityControlWindow, IPlaybackWireFrame, IWireFrame } from './control-api.js';
import { KeyboardController } from './keyboard-controller.js';

class ExactFrameReviewControl {
  readonly api = required(
    (window as IFrameIdentityControlWindow).frameIdentityControl ?? null,
    'Frame identity control API is unavailable.',
  );
  readonly ranges = new RangeCaptureModel();
  readonly canvas = element<HTMLCanvasElement>('video-canvas');
  readonly context = required(this.canvas.getContext('2d', { alpha: false, desynchronized: true }), 'Canvas is unavailable.');
  readonly keyboard: KeyboardController;
  readonly heldSteps: AdjacentStepScheduler<IWireFrame>;
  #generation = 0;
  #loaded = false;
  #playing = false;
  #exactReady = false;
  #numFrames = 0;
  #stepAmount = 1;
  #currentIdentity: ISourceFrameIdentity | null = null;
  #currentTimeUs = 0n;
  #lengthUs = 0n;
  #scrubRevision = 0;
  #busy = false;
  #timelineDragging = false;
  #previewLoading = false;
  #scrubRequestsInFlight = 0;
  #lastScrubFrameGeneration = 0;

  constructor() {
    this.keyboard = new KeyboardController({
      togglePlayback: () => void this.togglePlayback(),
      markStart: () => void this.mark('start'),
      markEnd: () => void this.mark('end'),
      toggleRangeLock: () => this.toggleRangeLock(),
      pressStep: (direction) => this.heldSteps.press(direction),
      releaseStep: (direction) => this.heldSteps.release(direction),
    });
    this.heldSteps = new AdjacentStepScheduler({
      stepAdjacent: (direction) => this.api.step(direction, this.#stepAmount),
    }, (frame) => void this.showExactFrame(frame), (error) => this.showError(error));
    this.bind();
    this.renderRanges();
    window.setInterval(() => void this.refreshStatus(), 500);
  }

  bind(): void {
    element('open-movie').addEventListener('click', () => void this.openMovie());
    element('play-pause').addEventListener('click', () => void this.togglePlayback());
    element('step-back').addEventListener('click', () => void this.stepOnce(-1));
    element('step-forward').addEventListener('click', () => void this.stepOnce(1));
    element('lock-range').addEventListener('click', () => this.toggleRangeLock());
    element<HTMLSelectElement>('playback-rate').addEventListener('change', (event) => {
      void this.setRate(Number((event.target as HTMLSelectElement).value));
    });
    for (const button of document.querySelectorAll<HTMLButtonElement>('.step-amount')) {
      button.addEventListener('click', () => this.selectStep(Number(button.dataset.step)));
    }
    element<HTMLInputElement>('timeline').addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      this.previewTimelinePosition(Number(input.value) / Number(input.max));
    });
    element<HTMLInputElement>('timeline').addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      void this.commitTimelinePosition(Number(input.value) / Number(input.max));
    });
    element('legend-toggle').addEventListener('click', () => {
      const legend = element<HTMLElement>('keyboard-legend');
      legend.hidden = !legend.hidden;
    });
    window.addEventListener('keydown', (event) => this.keyboard.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.keyboard.handleKeyUp(event));
    window.addEventListener('blur', () => {
      this.heldSteps.release();
      this.#timelineDragging = false;
      this.setScrubProcessing(false);
    });
    this.api.onPlaybackFrame((frame) => void this.showPlaybackFrame(frame));
    this.api.onPreparation((event) => this.onPreparation(event));
  }

  async openMovie(): Promise<void> {
    this.clearError();
    const viewport = element<HTMLElement>('viewport');
    const result = await this.withFailure(() => this.api.chooseSource({
      maxWidth: Math.max(1, Math.floor(viewport.clientWidth)),
      maxHeight: Math.max(1, Math.floor(viewport.clientHeight)),
    }));
    if (!result || result.cancelled) return;
    this.#generation = result.generation ?? this.#generation + 1;
    this.#loaded = true;
    this.#playing = false;
    this.#exactReady = false;
    this.#numFrames = 0;
    this.#currentIdentity = null;
    this.#currentTimeUs = 0n;
    this.#lengthUs = decimal(result.playbackStatus?.lengthUs);
    this.#timelineDragging = false;
    this.#scrubRequestsInFlight = 0;
    this.#lastScrubFrameGeneration = 0;
    this.#previewLoading = true;
    this.setScrubProcessing(false);
    this.ranges.clear();
    this.heldSteps.setSourceGeneration(this.#generation);
    this.canvas.classList.remove('visible');
    element('empty-state').textContent = 'Loading first frame';
    element('empty-state').removeAttribute('hidden');
    element('source-name').textContent = result.sourceName ?? 'Movie';
    this.setPreparation('Preparing exact review', 0, null, true);
    this.setBusy(true, 'Loading first frame');
    const preview = await this.withFailure(() => this.api.primePreview());
    if (!preview) {
      this.#previewLoading = false;
      this.setBusy(false);
      return;
    }
    this.#lengthUs = decimal(preview.playbackStatus?.lengthUs, this.#lengthUs);
    this.renderTimeline();
  }

  async togglePlayback(): Promise<void> {
    if (!this.#loaded || this.#busy) return;
    if (this.#playing) {
      if (this.#exactReady) {
        this.setBusy(true, 'Resolving exact frame');
        const frame = await this.withFailure(() => this.api.pauseExact());
        if (frame) await this.showExactFrame(frame);
        this.setBusy(false);
      } else {
        await this.withFailure(() => this.api.pause());
      }
      this.#playing = false;
    } else {
      const result = await this.withFailure(() => this.api.play());
      if (!result) return;
      this.#playing = true;
      this.#currentIdentity = null;
    }
    this.renderTransport();
  }

  async setRate(rate: number): Promise<void> {
    await this.withFailure(() => this.api.setRate(rate));
  }

  previewTimelinePosition(ratio: number): void {
    if (!this.#loaded || this.#busy) return;
    const targetRatio = clampRatio(ratio);
    this.#timelineDragging = true;
    this.#currentIdentity = null;
    this.#currentTimeUs = BigInt(Math.round(Number(this.#lengthUs) * targetRatio));
    this.renderTimeline();
    this.renderTransport();
    if (this.#exactReady) void this.requestFullPlayerScrub(targetRatio);
  }

  async commitTimelinePosition(ratio: number): Promise<void> {
    if (!this.#loaded || this.#busy) return;
    const targetRatio = clampRatio(ratio);
    const revision = ++this.#scrubRevision;
    this.#timelineDragging = false;
    this.setScrubProcessing(false);
    this.#playing = false;
    this.#currentIdentity = null;
    this.#currentTimeUs = BigInt(Math.round(Number(this.#lengthUs) * targetRatio));
    this.setBusy(true, 'Seeking');
    try {
      const result = await this.api.scrub(targetRatio);
      if (revision !== this.#scrubRevision || result.stale) return;
      if (result.frame) await this.showExactFrame(result.frame);
      else this.#currentTimeUs = decimal(result.status?.timeUs, this.#currentTimeUs);
      this.#currentIdentity = null;
      this.#playing = true;
      await this.api.play();
      this.clearError();
    } catch (error) {
      if (revision === this.#scrubRevision) {
        this.#playing = false;
        this.showError(error);
      }
    } finally {
      if (revision === this.#scrubRevision) this.setBusy(false);
    }
  }

  async stepOnce(direction: -1 | 1): Promise<void> {
    if (!this.#exactReady || this.#busy) return;
    this.setBusy(true, `Stepping ${this.#stepAmount} frame${this.#stepAmount === 1 ? '' : 's'}`);
    const frame = await this.withFailure(() => this.api.step(direction, this.#stepAmount));
    if (frame) await this.showExactFrame(frame);
    this.setBusy(false);
  }

  async mark(endpoint: 'start' | 'end'): Promise<void> {
    if (!this.#exactReady) {
      this.showError('Exact frame review is still being prepared.');
      return;
    }
    let identity = this.#currentIdentity;
    if (this.#playing || !identity) {
      const frame = await this.withFailure(() => this.api.captureCurrentFrame());
      if (!frame) return;
      identity = sourceFrameIdentityFromWire(frame.identity);
    }
    if (endpoint === 'start') this.ranges.markStart(identity);
    else this.ranges.markEnd(identity);
    this.renderRanges();
  }

  toggleRangeLock(): void {
    if (!this.#exactReady) return;
    this.ranges.toggleLock();
    this.renderRanges();
  }

  selectStep(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000) return;
    this.#stepAmount = amount;
    for (const button of document.querySelectorAll<HTMLButtonElement>('.step-amount')) {
      button.classList.toggle('selected', Number(button.dataset.step) === amount);
    }
  }

  async showPlaybackFrame(frame: IPlaybackWireFrame): Promise<void> {
    try {
      if (!this.#playing && !this.#previewLoading) return;
      const updateTimeline = !this.#timelineDragging && !this.#busy;
      if (updateTimeline) this.#currentTimeUs = BigInt(frame.playbackTimestampUs);
      await this.draw(frame);
      if (updateTimeline) this.renderTimeline();
      if (this.#previewLoading) {
        this.#previewLoading = false;
        this.setBusy(false);
      }
    } finally {
      this.api.acknowledgePlaybackFrame(frame.sourceGeneration, frame.frameGeneration);
    }
  }

  async showExactFrame(frame: IWireFrame, updateTimeline = true): Promise<void> {
    this.#playing = false;
    this.#currentIdentity = sourceFrameIdentityFromWire(frame.identity);
    this.#currentTimeUs = sourceFrameTimeUs(this.#currentIdentity);
    await this.draw(frame);
    if (updateTimeline) this.renderAll();
    else this.renderTransport();
  }

  async draw(frame: IWireFrame | IPlaybackWireFrame): Promise<void> {
    await this.drawOnCanvas(frame, this.canvas, this.context);
    this.canvas.classList.add('visible');
    element('empty-state').setAttribute('hidden', '');
  }

  async drawOnCanvas(
    frame: IWireFrame | IPlaybackWireFrame,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
  ): Promise<void> {
    if (!frame.pixels) return;
    const source = frame.pixels instanceof Uint8Array ? frame.pixels : new Uint8Array(frame.pixels);
    let packed = source;
    if (frame.stride !== frame.width * 4) {
      packed = new Uint8Array(frame.width * frame.height * 4);
      for (let row = 0; row < frame.height; ++row) {
        packed.set(source.subarray(row * frame.stride, row * frame.stride + frame.width * 4), row * frame.width * 4);
      }
    }
    canvas.width = frame.width;
    canvas.height = frame.height;
    context.putImageData(new ImageData(new Uint8ClampedArray(packed), frame.width, frame.height), 0, 0);
    await new Promise(requestAnimationFrame);
  }

  async requestFullPlayerScrub(ratio: number): Promise<void> {
    if (!this.#timelineDragging || !this.#exactReady) return;
    const generation = this.#generation;
    ++this.#scrubRequestsInFlight;
    this.setScrubProcessing(true);
    try {
      const result = await this.api.scrub(ratio);
      if (generation !== this.#generation || !this.#timelineDragging || result.stale || !result.frame) return;
      if (result.frame.frameGeneration <= this.#lastScrubFrameGeneration) return;
      this.#lastScrubFrameGeneration = result.frame.frameGeneration;
      await this.showExactFrame(result.frame, false);
      this.clearError();
    } catch (error) {
      if (generation === this.#generation && this.#timelineDragging) this.showError(error);
    } finally {
      this.#scrubRequestsInFlight = Math.max(0, this.#scrubRequestsInFlight - 1);
      if (this.#scrubRequestsInFlight === 0 || !this.#timelineDragging) this.setScrubProcessing(false);
    }
  }

  setScrubProcessing(visible: boolean): void {
    element<HTMLElement>('scrub-state').hidden = !visible;
  }

  onPreparation(event: Record<string, unknown>): void {
    if (Number(event.generation) !== this.#generation) return;
    if (event.type === 'preparation-progress') {
      this.setPreparation(phaseLabel(String(event.phase)), Number(event.percent), nullableNumber(event.etaMs), true);
    } else if (event.type === 'exact-ready') {
      this.#exactReady = true;
      this.#numFrames = Number(event.numFrames);
      this.setPreparation(event.cacheHit ? 'Exact review ready from cache' : 'Exact review ready', 100, 0, false);
      element('readiness').textContent = 'Review-proxy playback and exact-frame review ready';
      this.renderAll();
    } else if (event.type === 'preparation-failed') {
      this.setPreparation('Exact review unavailable', 0, null, false);
      element('readiness').textContent = 'Playback available; exact review failed';
      this.showError(String(event.message));
    }
  }

  async refreshStatus(): Promise<void> {
    if (!this.#loaded) return;
    try {
      const state = await this.api.status();
      if (state.generation !== this.#generation) return;
      if (!this.#busy) this.#playing = state.playing;
      this.#exactReady = state.exactReady;
      this.#numFrames = state.numFrames;
      if (!this.#busy && !this.#timelineDragging && this.#currentIdentity === null) {
        this.#currentTimeUs = decimal(state.playbackStatus?.timeUs, this.#currentTimeUs);
      }
      this.#lengthUs = decimal(state.playbackStatus?.lengthUs, this.#lengthUs);
      this.renderTransport();
      if (!this.#timelineDragging) this.renderTimeline();
    } catch (error) {
      this.showError(error);
    }
  }

  renderAll(): void {
    this.renderTransport();
    this.renderTimeline();
    this.renderRanges();
  }

  renderTransport(): void {
    const play = element<HTMLButtonElement>('play-pause');
    play.disabled = !this.#loaded || this.#busy;
    play.innerHTML = this.#playing ? '&#10074;&#10074;' : '&#9654;';
    play.title = this.#playing ? 'Pause' : 'Play';
    play.setAttribute('aria-label', play.title);
    element<HTMLSelectElement>('playback-rate').disabled = !this.#loaded;
    element<HTMLInputElement>('timeline').disabled = !this.#loaded;
    for (const control of document.querySelectorAll<HTMLButtonElement>('.exact-control, .step-amount')) {
      control.disabled = !this.#exactReady || this.#busy;
    }
    element<HTMLButtonElement>('lock-range').disabled = !this.#exactReady;
    element('frame-identity').textContent = this.#currentIdentity
      ? `Frame ${this.#currentIdentity.frameIndex.toLocaleString()}`
      : this.#exactReady ? 'Playback time' : 'Preparing frame index';
  }

  renderTimeline(): void {
    element('current-time').textContent = formatTime(this.#currentTimeUs);
    element('duration').textContent = formatTime(this.#lengthUs);
    const ratio = this.#lengthUs > 0n ? Number(this.#currentTimeUs) / Number(this.#lengthUs) : 0;
    element<HTMLInputElement>('timeline').value = String(Math.round(Math.max(0, Math.min(1, ratio)) * 100_000));
  }

  renderRanges(): void {
    const snapshot = this.ranges.snapshot;
    element('draft-start').textContent = frameLabel(snapshot.draft.start);
    element('draft-end').textContent = frameLabel(snapshot.draft.end);
    const state = element('draft-state');
    state.textContent = snapshot.draft.locked ? 'Locked' : 'Draft';
    state.classList.toggle('locked', snapshot.draft.locked);
    element('range-error').textContent = snapshot.draft.error ?? '';
    element<HTMLButtonElement>('lock-range').textContent = snapshot.draft.locked ? 'Unlock clip (A)' : 'Lock clip (A)';
    const list = element<HTMLOListElement>('ranges-list');
    list.replaceChildren(...snapshot.ranges.map((range, index) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'range-name';
      name.textContent = `${String(range.start.frameIndex).padStart(6, '0')}-${String(range.end.frameIndex).padStart(6, '0')}`;
      const number = document.createElement('span');
      number.textContent = `#${index + 1}`;
      number.className = 'count-label';
      const detail = document.createElement('span');
      detail.className = 'range-detail';
      detail.textContent = `${formatTime(sourceFrameTimeUs(range.start))} - ${formatTime(sourceFrameTimeUs(range.end))}`;
      item.append(name, number, detail);
      return item;
    }));
    element('range-count').textContent = String(this.ranges.exportableRanges().length);
    element<HTMLElement>('ranges-empty').hidden = snapshot.ranges.length > 0;
  }

  setPreparation(label: string, percent: number, etaMs: number | null, visible: boolean): void {
    const status = element<HTMLElement>('preparation-status');
    status.hidden = !visible;
    element('preparation-phase').textContent = label;
    element<HTMLProgressElement>('preparation-progress').value = Math.max(0, Math.min(100, percent));
    element('preparation-eta').textContent = etaMs && etaMs > 0 ? `${formatDuration(etaMs)} remaining` : '';
    if (visible) element('readiness').textContent = label;
  }

  setBusy(busy: boolean, label = ''): void {
    this.#busy = busy;
    const state = element<HTMLElement>('busy-state');
    state.hidden = !busy;
    if (label) element('busy-label').textContent = label;
    this.renderTransport();
  }

  clearError(): void { element('player-error').textContent = ''; }
  showError(error: unknown): void { element('player-error').textContent = errorMessage(error); }

  async withFailure<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      const result = await operation();
      this.clearError();
      return result;
    } catch (error) {
      this.showError(error);
      return null;
    }
  }
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return required(document.getElementById(id) as T | null, `Missing control element: ${id}`);
}

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

function decimal(value: string | undefined, fallback = 0n): bigint {
  return value && /^\d+$/.test(value) ? BigInt(value) : fallback;
}

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function frameLabel(identity: ISourceFrameIdentity | null): string {
  return identity ? `Frame ${identity.frameIndex.toLocaleString()}\n${formatTime(sourceFrameTimeUs(identity))}` : 'Not marked';
}

function formatTime(timeUs: bigint): string {
  const totalMs = Number(timeUs / 1_000n);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor(totalMs % 3_600_000 / 60_000);
  const seconds = Math.floor(totalMs % 60_000 / 1_000);
  const milliseconds = totalMs % 1_000;
  return `${two(hours)}:${two(minutes)}:${two(seconds)}.${String(milliseconds).padStart(3, '0')}`;
}

function two(value: number): string { return String(value).padStart(2, '0'); }
function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1_000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}
function phaseLabel(phase: string): string {
  return ({
    preflight: 'Checking movie packets',
    'review-preflight': 'Verifying normalized review copy',
    normalization: 'Normalizing timestamps',
    indexing: 'Building exact frame index',
    'proxy-cache-validation': 'Checking review proxy cache',
    'proxy-encoding': 'Creating 960px review proxy',
    'proxy-indexing': 'Indexing review proxy',
    'proxy-validation': 'Validating proxy frame map',
  } as Record<string, string>)[phase] ?? 'Preparing exact review';
}
function errorMessage(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? error).split(/\r?\n/, 1)[0].slice(0, 500);
}

new ExactFrameReviewControl();
