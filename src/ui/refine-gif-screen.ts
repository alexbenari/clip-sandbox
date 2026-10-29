import type { IGifExtractionSessionSnapshot } from '../app/gif-extraction-session.js';
import type { MovieRangeSession } from '../app/movie-range-session.js';

// What the Refine screen asks of the GIF Extraction session.
export type RefineScreenSession = Pick<MovieRangeSession, 'subscribe' | 'snapshot' | 'reviewSession' | 'refinementDraft'
  | 'beginRefinement' | 'abandonRefinement' | 'canExtractRange' | 'extractRange' | 'cancelExtraction'>;
import type { IRangeRefinementDraftSnapshot, RefineGifEndpoint } from '../app/range-refinement-draft.js';
import { CaptureEndpoints } from '../domain/capture-endpoint.js';
import type { CapturedRangeId } from '../domain/captured-range.js';
import type { IAppScreen, IAppScreenPanelContribution } from './app-screen.js';
import type { IShortcutDescriptor } from '../app/shortcut-descriptor.js';
import { FrameReviewPlayerControl } from './frame-review-player-control.js';
import type { GifRangesPanelControl } from './gif-ranges-panel-control.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import {
  GIF_CAPTURE_KEYS,
  GifWorkflowKeyboard,
  type IGifWorkflowKeyboardTarget,
} from './gif-workflow-keyboard.js';

const REFINE_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Enter or exit movie full screen', sequences: [['F']] },
  { description: 'Exit movie full screen', sequences: [['Escape']] },
  { description: 'Play or pause', sequences: [['Space']] },
  { description: 'Step backward one frame; hold to accelerate', sequences: [['Left']] },
  { description: 'Step forward one frame; hold to accelerate', sequences: [['Right']] },
  { description: 'Jump 1 second; scrub follows the last step direction', sequences: [['1']] },
  { description: 'Jump 2 seconds', sequences: [['2']] },
  { description: 'Jump 5 seconds', sequences: [['3']] },
  { description: 'Jump 7 seconds', sequences: [['4']] },
  { description: 'Jump 10 seconds', sequences: [['5']] },
  { description: 'Set exact start at the displayed frame', sequences: [[GIF_CAPTURE_KEYS.markStart]] },
  { description: 'Set exact end at the displayed frame', sequences: [[GIF_CAPTURE_KEYS.markEnd]] },
  { description: 'Jump to exact start', sequences: [[GIF_CAPTURE_KEYS.jumpStart]] },
  { description: 'Jump to exact end', sequences: [[GIF_CAPTURE_KEYS.jumpEnd]] },
  { description: 'Loop the exact range', sequences: [[GIF_CAPTURE_KEYS.loop]] },
  { description: 'Lock the exact replacement', sequences: [[GIF_CAPTURE_KEYS.lock]] },
  { description: 'Extract the current exact range', sequences: [[GIF_CAPTURE_KEYS.extract]] },
]);

type RefineGifScreenOptions = {
  readonly player: FrameReviewPlayerControl;
  readonly keyboard: GifWorkflowKeyboard;
  readonly session?: RefineScreenSession;
  readonly rangesPanel?: GifRangesPanelControl;
  readonly onExtractCurrent?: (rangeId: CapturedRangeId) => void;
  readonly document?: Document;
};

export interface IRefineGifScreenEvents {
  backRequested: CapturedRangeId | null;
}

export class RefineGifScreen implements IAppScreen, IEventSource<IRefineGifScreenEvents> {
  private readonly events = new EventSource<IRefineGifScreenEvents>();
  readonly id = 'refine-gif';
  readonly label = 'Refine Gif';
  readonly selectorStatus = 'contextual' as const;
  readonly root: HTMLElement;
  readonly commands: HTMLElement;
  readonly shortcuts = REFINE_SHORTCUTS;
  readonly panelContributions: readonly IAppScreenPanelContribution[];
  readonly initiallyFoldedPanelIds = ['pipelines'] as const;
  readonly openPanelIdsOnEntry: readonly string[];
  private readonly playerHost: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly sourceName: HTMLElement;
  private readonly commandTitle: HTMLElement;
  private readonly cancelExtraction: HTMLButtonElement;
  private readonly workbench: HTMLElement;
  private readonly emptyCopy: HTMLElement;
  private readonly rangeTitle: HTMLElement;
  private readonly startValue: HTMLElement;
  private readonly endValue: HTMLElement;
  private readonly startApproximation: HTMLElement;
  private readonly endApproximation: HTMLElement;
  private readonly jumpStart: HTMLButtonElement;
  private readonly jumpEnd: HTMLButtonElement;
  private readonly lock: HTMLButtonElement;
  private readonly loop: HTMLButtonElement;
  private readonly extract: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly localStatus: HTMLElement;
  private readonly unsubscribeSession: (() => void) | null;
  private readonly unsubscribeTransport: () => void;
  private readonly keyboardTarget: IGifWorkflowKeyboardTarget;
  private snapshot: IGifExtractionSessionSnapshot | null = null;
  private active = false;
  private destroyed = false;
  private lastSeekKey: string | null = null;
  private seekGeneration = 0;
  private pendingSeek: IRangeRefinementDraftSnapshot | null = null;
  private seeking = false;
  private previewRevision: number | null = null;
  private previewOperation = 0;
  private pendingPreviewStop: Promise<unknown> = Promise.resolve();

  static forGifExtraction(options: RefineGifScreenOptions): RefineGifScreen {
    return new RefineGifScreen(options);
  }

  private constructor(private readonly options: RefineGifScreenOptions) {
    const doc = options.document ?? document;
    this.commands = doc.createElement('header');
    this.commands.className = 'gif-workflow-command-bar';
    this.commands.setAttribute('aria-label', 'Refine Gif commands');
    this.commands.innerHTML = `
      <button type="button" data-command="back">Back to GIF Extraction</button>
      <div class="gif-workflow-source">
        <strong data-refine-command-title>${this.label}</strong>
        <span>No range selected</span>
      </div>
      <button type="button" data-command="cancel-extraction" hidden>Cancel extraction</button>`;

    this.root = doc.createElement('section');
    this.root.id = 'refineGifScreen';
    this.root.className = 'gif-workflow-screen refine-gif-screen';
    this.root.setAttribute('aria-label', `${this.label} workspace`);
    this.root.innerHTML = `
      <div class="gif-workflow-player-host"></div>
      <section class="gif-refinement-workbench" aria-label="Exact endpoint refinement" hidden>
        <div class="gif-refinement-heading">
          <div><h1>Refine captured range</h1><p data-refine-range-title></p></div>
          <span class="gif-refinement-mode">Frame-by-frame</span>
        </div>
        <div class="gif-refinement-endpoints">
          <button type="button" class="gif-refinement-endpoint" data-command="jump-start">
            <span class="gif-refinement-endpoint-label">Jump to start</span>
            <strong data-refine-start-value>Needs exact frame</strong>
            <small data-refine-start-approximation></small>
          </button>
          <button type="button" class="gif-refinement-endpoint" data-command="jump-end">
            <span class="gif-refinement-endpoint-label">Jump to end</span>
            <strong data-refine-end-value>Needs exact frame</strong>
            <small data-refine-end-approximation></small>
          </button>
        </div>
        <div class="gif-refinement-actions">
          <button type="button" data-command="loop-range" disabled><span>Loop preview</span><kbd>Z</kbd></button>
          <button type="button" class="btn-primary" data-command="lock-refinement" disabled><span>Lock exact range</span><kbd>X</kbd></button>
          <button type="button" data-command="extract-current" disabled><span>Extract</span><kbd>E</kbd></button>
          <button type="button" data-command="next-inexact" disabled>Next inexact clip</button>
        </div>
        <p class="gif-workflow-local-status" role="status" aria-live="polite"></p>
      </section>
      <div class="gif-workflow-empty-copy">
        <h1>No range selected</h1>
        <p>Choose a captured range from GIF Extraction to review its start and end against exact frames.</p>
      </div>`;

    this.back = this.required(this.commands.querySelector('[data-command="back"]'), HTMLButtonElement, 'back command');
    this.commandTitle = this.required(this.commands.querySelector('[data-refine-command-title]'), HTMLElement, 'command title');
    this.sourceName = this.required(this.commands.querySelector('.gif-workflow-source span'), HTMLElement, 'source name');
    this.cancelExtraction = this.required(this.commands.querySelector('[data-command="cancel-extraction"]'), HTMLButtonElement, 'cancel extraction command');
    this.playerHost = this.required(this.root.querySelector('.gif-workflow-player-host'), HTMLElement, 'player host');
    this.workbench = this.required(this.root.querySelector('.gif-refinement-workbench'), HTMLElement, 'refinement workbench');
    this.emptyCopy = this.required(this.root.querySelector('.gif-workflow-empty-copy'), HTMLElement, 'empty copy');
    this.rangeTitle = this.required(this.root.querySelector('[data-refine-range-title]'), HTMLElement, 'range title');
    this.startValue = this.required(this.root.querySelector('[data-refine-start-value]'), HTMLElement, 'start value');
    this.endValue = this.required(this.root.querySelector('[data-refine-end-value]'), HTMLElement, 'end value');
    this.startApproximation = this.required(this.root.querySelector('[data-refine-start-approximation]'), HTMLElement, 'start approximation');
    this.endApproximation = this.required(this.root.querySelector('[data-refine-end-approximation]'), HTMLElement, 'end approximation');
    this.jumpStart = this.required(this.root.querySelector('[data-command="jump-start"]'), HTMLButtonElement, 'jump-start command');
    this.jumpEnd = this.required(this.root.querySelector('[data-command="jump-end"]'), HTMLButtonElement, 'jump-end command');
    this.lock = this.required(this.root.querySelector('[data-command="lock-refinement"]'), HTMLButtonElement, 'lock command');
    this.loop = this.required(this.root.querySelector('[data-command="loop-range"]'), HTMLButtonElement, 'loop command');
    this.extract = this.required(this.root.querySelector('[data-command="extract-current"]'), HTMLButtonElement, 'extract command');
    this.next = this.required(this.root.querySelector('[data-command="next-inexact"]'), HTMLButtonElement, 'next command');
    this.localStatus = this.required(this.root.querySelector('.gif-workflow-local-status'), HTMLElement, 'local status');
    this.keyboardTarget = Object.freeze({
      player: options.player,
      capture: Object.freeze({
        markStart: () => this.markEndpoint('start'),
        markEnd: () => this.markEndpoint('end'),
        jumpStart: () => this.jump('start'),
        jumpEnd: () => this.jump('end'),
        startLoop: () => { void this.startLoop(); },
        lockRange: () => this.commit(),
        canMark: () => this.options.player.exactPreviewPhase() !== 'running',
        canJump: () => this.canJump(),
        canLoop: () => this.canLoop(),
        canLock: () => this.snapshot?.refinement?.canCommit === true,
        extractCurrent: () => this.extractCurrent(),
        canExtractCurrent: () => this.canExtractCurrent(),
      }),
    });
    this.bind();
    this.unsubscribeSession = options.session?.subscribe(snapshot => this.render(snapshot)) ?? null;
    this.unsubscribeTransport = options.player.subscribeTransport(() => { if (this.snapshot) this.render(this.snapshot); });
    this.panelContributions = options.rangesPanel
      ? Object.freeze([Object.freeze({ panelId: 'clips', content: options.rangesPanel })])
      : Object.freeze([]);
    this.openPanelIdsOnEntry = options.rangesPanel ? Object.freeze(['clips']) : Object.freeze([]);
  }

  onActivate(): void {
    this.active = true;
    this.lastSeekKey = null;
    this.options.player.mountInGifScreen(this.playerHost, 'Select a captured range to refine');
    this.options.player.attachSession(this.options.session?.reviewSession ?? null);
    this.options.keyboard.activate(this.keyboardTarget);
    const refinement = this.snapshot?.refinement;
    if (refinement) this.requestExactPosition(refinement);
    if (this.snapshot) this.render(this.snapshot);
  }

  onDeactivate(): void {
    this.active = false;
    this.options.player.interruptJumps();
    this.previewOperation += 1;
    if (this.options.player.exactPreviewPhase() !== 'inactive') {
      this.pendingPreviewStop = this.options.player.stopExactPreview().catch(() => null);
    }
    this.seekGeneration += 1;
    this.pendingSeek = null;
    this.options.keyboard.deactivate();
    this.options.session?.abandonRefinement();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!event.defaultPrevented) this.options.keyboard.handleKeyDown(event);
  }

  focusInitial(): void {
    if (!this.options.player.focusInitial()) this.back.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeSession?.();
    this.unsubscribeTransport();
  }

  private bind(): void {
    this.back.addEventListener('click', () => this.backToExtraction());
    this.cancelExtraction.addEventListener('click', () => { void this.options.session?.cancelExtraction(); });
    this.jumpStart.addEventListener('click', () => this.focusEndpoint('start'));
    this.jumpEnd.addEventListener('click', () => this.focusEndpoint('end'));
    this.lock.addEventListener('click', () => this.commit());
    this.loop.addEventListener('click', () => { void this.startLoop(); });
    this.extract.addEventListener('click', () => this.extractCurrent());
    this.next.addEventListener('click', () => this.openNext());
  }

  private markEndpoint(endpoint: RefineGifEndpoint): void {
    if (this.options.player.exactPreviewPhase() === 'running') return;
    this.options.player.interruptJumps();
    const refinement = this.options.session?.refinementDraft;
    if (!refinement) return;
    const capture = this.options.player.displayedCapture();
    if (endpoint === 'start') refinement.markStart(capture);
    else refinement.markEnd(capture);
  }

  private focusEndpoint(endpoint: RefineGifEndpoint): void {
    this.options.player.interruptJumps();
    if (this.snapshot?.refinement?.status === 'committed') {
      this.jump(endpoint);
      return;
    }
    this.options.session?.refinementDraft?.focus(endpoint);
  }

  private canJump(): boolean {
    return this.snapshot?.previewTarget?.kind === 'refinement';
  }

  private canLoop(): boolean {
    const target = this.snapshot?.previewTarget;
    return target?.kind === 'refinement' && target.startFrameIndex < target.endFrameIndex
      && !this.seeking && this.pendingSeek === null
      && !this.options.player.ordinaryPlaybackRunning()
      && (this.options.player.exactScrubActive() || this.options.player.exactPreviewPhase() === 'running');
  }

  private jump(endpoint: RefineGifEndpoint): void {
    const target = this.snapshot?.previewTarget;
    if (target?.kind !== 'refinement') return;
    void this.options.player.enterExactScrubAtFrame(endpoint === 'start' ? target.startFrameIndex : target.endFrameIndex);
  }

  private async startLoop(): Promise<void> {
    const target = this.snapshot?.previewTarget;
    if (target?.kind !== 'refinement' || !this.canLoop()) return;
    const operation = ++this.previewOperation;
    await this.pendingPreviewStop;
    if (operation !== this.previewOperation || this.options.session?.snapshot.previewRevision !== target.revision) return;
    try { await this.options.player.startExactPreview(target); }
    catch (error) { this.localStatus.textContent = error instanceof Error ? error.message : 'Loop preview could not start.'; }
  }

  private commit(): void {
    void this.commitAsync();
  }

  private async commitAsync(): Promise<void> {
    const session = this.options.session;
    const refinement = session?.refinementDraft;
    if (!session || !refinement || !refinement.snapshot.canCommit) return;
    const revision = session.snapshot.previewRevision;
    if (this.options.player.exactPreviewPhase() !== 'inactive') {
      try { await this.options.player.stopExactPreview(); }
      catch (error) {
        this.localStatus.textContent = error instanceof Error ? error.message : 'Playback recovery failed.';
      }
    }
    if (session.snapshot.previewRevision !== revision || session.refinementDraft !== refinement) return;
    refinement.commit();
  }

  private extractCurrent(): void {
    const refinement = this.snapshot?.refinement;
    if (!refinement || !this.canExtractCurrent()) return;
    if (this.options.onExtractCurrent) this.options.onExtractCurrent(refinement.rangeId);
    else void this.options.session?.extractRange(refinement.rangeId);
  }

  private canExtractCurrent(): boolean {
    if (this.options.player.exactPreviewPhase() === 'running') return false;
    const refinement = this.snapshot?.refinement;
    return refinement?.status === 'committed'
      && (this.options.onExtractCurrent !== undefined
        || this.options.session?.canExtractRange(refinement.rangeId) === true);
  }

  private openNext(): void {
    const nextRangeId = this.snapshot?.refinement?.nextInexactRangeId ?? null;
    if (!nextRangeId) return;
    this.lastSeekKey = null;
    void this.options.session?.beginRefinement(nextRangeId);
  }

  private backToExtraction(): void {
    this.events.emit('backRequested', this.snapshot?.refinement?.rangeId ?? null);
  }

  on<TName extends keyof IRefineGifScreenEvents>(name: TName, handler: EventHandler<IRefineGifScreenEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.snapshot = snapshot;
    if (this.active) this.options.player.setJumpUnavailable(snapshot.lifecycle === 'choosing' || snapshot.lifecycle === 'opening');
    this.cancelExtraction.hidden = !snapshot.extractionBatch;
    this.cancelExtraction.disabled = snapshot.extractionBatch?.cancelling === true;
    if (this.previewRevision !== null && snapshot.previewRevision !== this.previewRevision) {
      this.previewOperation += 1;
      if (this.active && this.options.player.exactPreviewPhase() !== 'inactive') {
        this.pendingPreviewStop = this.options.player.stopExactPreview().catch(() => null);
      }
    }
    this.previewRevision = snapshot.previewRevision;
    const refinement = snapshot.refinement;
    this.sourceName.textContent = snapshot.source?.name ?? 'No movie open';
    this.workbench.hidden = refinement === null;
    this.emptyCopy.hidden = refinement !== null;
    if (!refinement) {
      this.pendingSeek = null;
      this.seekGeneration += 1;
      this.lastSeekKey = null;
      this.commandTitle.textContent = this.label;
      return;
    }
    if (this.active) this.requestExactPosition(refinement);
    const rangeName = `Range ${this.rangeNumber(refinement.rangeId)}`;
    this.commandTitle.textContent = `${this.label} · ${rangeName}`;
    this.rangeTitle.textContent = rangeName;
    this.renderEndpoint('start', refinement);
    this.renderEndpoint('end', refinement);
    const editing = refinement.status === 'editing';
    this.jumpStart.disabled = !editing && !this.canJump();
    this.jumpEnd.disabled = !editing && !this.canJump();
    this.lock.disabled = !editing || !refinement.canCommit;
    this.lock.title = this.lock.disabled ? 'Set both exact endpoints before locking.' : 'Lock the staged range';
    this.loop.disabled = !this.canLoop();
    this.loop.title = this.loop.disabled
      ? 'Choose a two-frame or longer exact range and enter frame scrub to loop.' : 'Loop the exact range';
    this.extract.disabled = !this.canExtractCurrent();
    this.extract.title = this.extract.disabled
      ? refinement.status === 'committed' ? 'This range is already complete or extraction is unavailable.' : 'Lock an exact range before extracting.'
      : 'Extract this exact range';
    this.next.disabled = refinement.status !== 'committed' || refinement.nextInexactRangeId === null;
    this.localStatus.textContent = this.statusText(snapshot, refinement);
  }

  private statusText(snapshot: IGifExtractionSessionSnapshot, refinement: IRangeRefinementDraftSnapshot): string {
    const batch = snapshot.extractionBatch;
    if (batch) return batch.cancelling ? 'Cancelling extraction…' : `Extracting clip ${batch.currentPosition} of ${batch.total}`;
    if (refinement.status === 'editing' && this.options.player.exactPreviewPhase() === 'running') {
      return 'Looping the staged range. Press Space to pause and scrub.';
    }
    return refinement.message ?? this.instruction(refinement);
  }

  private renderEndpoint(endpoint: RefineGifEndpoint, refinement: IRangeRefinementDraftSnapshot): void {
    const value = endpoint === 'start' ? refinement.start : refinement.end;
    const original = endpoint === 'start' ? refinement.original.start : refinement.original.end;
    const button = endpoint === 'start' ? this.jumpStart : this.jumpEnd;
    const output = endpoint === 'start' ? this.startValue : this.endValue;
    const approximation = endpoint === 'start' ? this.startApproximation : this.endApproximation;
    button.classList.toggle('is-active', refinement.status === 'editing' && refinement.focusedEndpoint === endpoint);
    button.setAttribute('aria-pressed', String(refinement.status === 'editing' && refinement.focusedEndpoint === endpoint));
    output.textContent = value.kind === 'exact-frame'
      ? `Frame ${value.identity.frameIndex.toLocaleString()}`
      : 'Needs exact frame';
    approximation.textContent = original.kind === 'playback-timestamp'
      ? `Approx. ${this.timeText(original.timestampUs)}`
      : `Captured at frame ${CaptureEndpoints.frameIndexOf(original).toLocaleString()}`;
  }

  private requestExactPosition(refinement: IRangeRefinementDraftSnapshot): void {
    if (refinement.status !== 'editing') return;
    const key = `${refinement.rangeId}:${refinement.seekRevision}`;
    if (this.lastSeekKey === key) return;
    this.options.player.interruptJumps();
    this.lastSeekKey = key;
    this.seekGeneration += 1;
    this.pendingSeek = refinement;
    if (!this.seeking) void this.drainSeeks();
  }

  private async drainSeeks(): Promise<void> {
    this.seeking = true;
    try {
      while (this.active && this.pendingSeek) {
        const refinement = this.pendingSeek;
        this.pendingSeek = null;
        const generation = this.seekGeneration;
        const target = refinement.focusedEndpoint === 'start' ? refinement.start : refinement.end;
        const capture = target.kind === 'exact-frame'
          ? await this.options.player.enterExactScrubAtFrame(target.identity.frameIndex)
          : target.kind === 'saved-exact-frame'
            ? await this.options.player.enterExactScrubAtFrame(target.frameIndex)
            : await this.options.player.enterExactScrubAt(target.timestampUs);
        if (this.active && generation === this.seekGeneration && capture === null) {
          this.localStatus.textContent = 'The exact frame could not be displayed. Try the progress bar or arrow keys.';
        }
      }
    } finally {
      this.seeking = false;
      if (this.active && this.snapshot) this.render(this.snapshot);
    }
  }

  private instruction(refinement: IRangeRefinementDraftSnapshot): string {
    if (refinement.status === 'committed') return 'Exact range locked. Continue to the next inexact clip or return.';
    if (refinement.status === 'invalidated') return 'Return to GIF Extraction and choose a current range.';
    const label = refinement.focusedEndpoint === 'start' ? 'start' : 'end';
    return `Scrub to the exact ${label} frame, then set it with ${label === 'start' ? GIF_CAPTURE_KEYS.markStart : GIF_CAPTURE_KEYS.markEnd}.`;
  }

  private rangeNumber(rangeId: CapturedRangeId): string {
    const index = this.snapshot?.ranges.findIndex(range => range.id === rangeId) ?? -1;
    return index >= 0 ? String(index + 1) : rangeId;
  }

  private timeText(timeUs: bigint): string {
    const totalMs = Number(timeUs / 1_000n);
    const minutes = Math.floor(totalMs / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    const milliseconds = totalMs % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }

  private required<T extends Element>(value: Element | null, constructor: { new (...args: never[]): T }, label: string): T {
    if (!(value instanceof constructor)) throw new Error(`Refine Gif ${label} is missing.`);
    return value;
  }
}
