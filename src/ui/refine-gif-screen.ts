import type { GifExtractionSession, IGifExtractionSessionSnapshot } from '../app/gif-extraction-session.js';
import type { IRefineGifSessionSnapshot, RefineGifEndpoint } from '../app/refine-gif-session.js';
import type { CapturedRangeId } from '../domain/captured-range.js';
import type { IAppScreen, IAppScreenPanelContribution, IShortcutDescriptor } from './app-screen.js';
import { FrameReviewPlayerControl } from './frame-review-player-control.js';
import type { GifRangesPanelControl } from './gif-ranges-panel-control.js';
import {
  GifWorkflowKeyboardController,
  type IGifWorkflowKeyboardTarget,
} from './gif-workflow-keyboard-controller.js';

const REFINE_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Play or pause', sequences: [['Space']] },
  { description: 'Step backward one frame; hold to accelerate', sequences: [['Left']] },
  { description: 'Step forward one frame; hold to accelerate', sequences: [['Right']] },
  { description: 'Set exact start at the displayed frame', sequences: [['Q']] },
  { description: 'Set exact end at the displayed frame', sequences: [['W']] },
  { description: 'Lock the exact replacement', sequences: [['A']] },
  { description: 'Extract the current exact range', sequences: [['E']] },
]);

type RefineGifScreenOptions = {
  readonly player: FrameReviewPlayerControl;
  readonly keyboard: GifWorkflowKeyboardController;
  readonly session?: GifExtractionSession;
  readonly rangesPanel?: GifRangesPanelControl;
  readonly onBack: (rangeId: CapturedRangeId | null) => void;
  readonly onExtractCurrent?: (rangeId: CapturedRangeId) => void;
  readonly document?: Document;
};

export class RefineGifScreen implements IAppScreen {
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
  private readonly commandStatus: HTMLElement;
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
  private readonly extract: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly localStatus: HTMLElement;
  private readonly unsubscribeSession: (() => void) | null;
  private readonly keyboardTarget: IGifWorkflowKeyboardTarget;
  private snapshot: IGifExtractionSessionSnapshot | null = null;
  private active = false;
  private destroyed = false;
  private lastSeekKey: string | null = null;
  private seekGeneration = 0;
  private pendingSeek: IRefineGifSessionSnapshot | null = null;
  private seeking = false;

  constructor(private readonly options: RefineGifScreenOptions) {
    const doc = options.document ?? document;
    this.commands = doc.createElement('header');
    this.commands.className = 'gif-workflow-command-bar';
    this.commands.setAttribute('aria-label', 'Refine Gif commands');
    this.commands.innerHTML = `
      <button type="button" data-command="back">Back to GIF Extraction</button>
      <div class="gif-workflow-source">
        <strong data-refine-command-title>Refine Gif</strong>
        <span>No range selected</span>
      </div>
      <span class="gif-workflow-command-status" role="status">Waiting for a captured range</span>`;

    this.root = doc.createElement('section');
    this.root.id = 'refineGifScreen';
    this.root.className = 'gif-workflow-screen refine-gif-screen';
    this.root.setAttribute('aria-label', 'Refine Gif workspace');
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
          <button type="button" class="btn-primary" data-command="lock-refinement" disabled><span>Lock exact range</span><kbd>A</kbd></button>
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
    this.commandStatus = this.required(this.commands.querySelector('.gif-workflow-command-status'), HTMLElement, 'command status');
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
    this.extract = this.required(this.root.querySelector('[data-command="extract-current"]'), HTMLButtonElement, 'extract command');
    this.next = this.required(this.root.querySelector('[data-command="next-inexact"]'), HTMLButtonElement, 'next command');
    this.localStatus = this.required(this.root.querySelector('.gif-workflow-local-status'), HTMLElement, 'local status');
    this.keyboardTarget = Object.freeze({
      player: options.player,
      capture: Object.freeze({
        markStart: () => this.markEndpoint('start'),
        markEnd: () => this.markEndpoint('end'),
        lockRange: () => this.commit(),
        extractCurrent: () => this.extractCurrent(),
        canExtractCurrent: () => this.canExtractCurrent(),
      }),
    });
    this.bind();
    this.unsubscribeSession = options.session?.subscribe(snapshot => this.render(snapshot)) ?? null;
    this.panelContributions = options.rangesPanel
      ? Object.freeze([Object.freeze({ panelId: 'clips', content: options.rangesPanel })])
      : Object.freeze([]);
    this.openPanelIdsOnEntry = options.rangesPanel ? Object.freeze(['clips']) : Object.freeze([]);
  }

  onActivate(): void {
    this.active = true;
    this.lastSeekKey = null;
    this.options.player.mount(this.playerHost, 'Select a captured range to refine');
    this.options.player.attachSession(this.options.session?.reviewSession ?? null);
    this.options.keyboard.activate(this.keyboardTarget);
    const refinement = this.snapshot?.refinement;
    if (refinement) this.requestExactPosition(refinement);
  }

  onDeactivate(): void {
    this.active = false;
    this.seekGeneration += 1;
    this.pendingSeek = null;
    this.options.keyboard.deactivate();
    this.options.session?.abandonRefinement();
  }

  focusInitial(): void {
    if (!this.options.player.focusInitial()) this.back.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeSession?.();
  }

  private bind(): void {
    this.back.addEventListener('click', () => this.backToExtraction());
    this.jumpStart.addEventListener('click', () => this.focusEndpoint('start'));
    this.jumpEnd.addEventListener('click', () => this.focusEndpoint('end'));
    this.lock.addEventListener('click', () => this.commit());
    this.extract.addEventListener('click', () => this.extractCurrent());
    this.next.addEventListener('click', () => this.openNext());
  }

  private markEndpoint(endpoint: RefineGifEndpoint): void {
    const refinement = this.options.session?.refinementSession;
    if (!refinement) return;
    const capture = this.options.player.displayedCapture();
    if (endpoint === 'start') refinement.markStart(capture);
    else refinement.markEnd(capture);
  }

  private focusEndpoint(endpoint: RefineGifEndpoint): void {
    this.options.session?.refinementSession?.focus(endpoint);
  }

  private commit(): void {
    this.options.session?.refinementSession?.commit();
  }

  private extractCurrent(): void {
    const refinement = this.snapshot?.refinement;
    if (!refinement || !this.canExtractCurrent()) return;
    if (this.options.onExtractCurrent) this.options.onExtractCurrent(refinement.rangeId);
    else void this.options.session?.extractRange(refinement.rangeId);
  }

  private canExtractCurrent(): boolean {
    const refinement = this.snapshot?.refinement;
    return refinement?.status === 'committed'
      && (this.options.onExtractCurrent !== undefined
        || this.options.session?.canExtractRange(refinement.rangeId) === true);
  }

  private openNext(): void {
    const nextRangeId = this.snapshot?.refinement?.nextInexactRangeId ?? null;
    if (!nextRangeId) return;
    this.lastSeekKey = null;
    this.options.session?.beginRefinement(nextRangeId);
  }

  private backToExtraction(): void {
    const rangeId = this.snapshot?.refinement?.rangeId ?? null;
    this.options.session?.abandonRefinement();
    this.options.onBack(rangeId);
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.snapshot = snapshot;
    const refinement = snapshot.refinement;
    this.sourceName.textContent = snapshot.source?.name ?? 'No movie open';
    this.workbench.hidden = refinement === null;
    this.emptyCopy.hidden = refinement !== null;
    if (!refinement) {
      this.pendingSeek = null;
      this.seekGeneration += 1;
      this.lastSeekKey = null;
      this.commandTitle.textContent = 'Refine Gif';
      this.commandStatus.textContent = 'Waiting for a captured range';
      return;
    }
    this.commandTitle.textContent = `Refine Gif · Range ${this.rangeNumber(refinement.rangeId)}`;
    this.commandStatus.textContent = refinement.status === 'committed'
      ? 'Exact range locked'
      : refinement.status === 'invalidated' ? 'Refinement unavailable' : `Resolving ${refinement.focusedEndpoint}`;
    this.rangeTitle.textContent = `Range ${this.rangeNumber(refinement.rangeId)}`;
    this.renderEndpoint('start', refinement);
    this.renderEndpoint('end', refinement);
    const editing = refinement.status === 'editing';
    this.jumpStart.disabled = !editing;
    this.jumpEnd.disabled = !editing;
    this.lock.disabled = !editing || !refinement.canCommit;
    this.extract.disabled = !this.canExtractCurrent();
    this.extract.title = this.extract.disabled
      ? refinement.status === 'committed' ? 'This range is already complete or extraction is unavailable.' : 'Lock an exact range before extracting.'
      : 'Extract this exact range';
    this.next.disabled = refinement.status !== 'committed' || refinement.nextInexactRangeId === null;
    this.localStatus.textContent = refinement.message ?? this.instruction(refinement);
    if (this.active) this.requestExactPosition(refinement);
  }

  private renderEndpoint(endpoint: RefineGifEndpoint, refinement: IRefineGifSessionSnapshot): void {
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
      : `Captured at frame ${(original.kind === 'exact-frame'
        ? original.identity.frameIndex : original.frameIndex).toLocaleString()}`;
  }

  private requestExactPosition(refinement: IRefineGifSessionSnapshot): void {
    if (refinement.status !== 'editing') return;
    const key = `${refinement.rangeId}:${refinement.seekRevision}`;
    if (this.lastSeekKey === key) return;
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
    }
  }

  private instruction(refinement: IRefineGifSessionSnapshot): string {
    if (refinement.status === 'committed') return 'Exact range locked. Continue to the next inexact clip or return.';
    if (refinement.status === 'invalidated') return 'Return to GIF Extraction and choose a current range.';
    const label = refinement.focusedEndpoint === 'start' ? 'start' : 'end';
    return `Scrub to the exact ${label} frame, then set it with ${label === 'start' ? 'Q' : 'W'}.`;
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
