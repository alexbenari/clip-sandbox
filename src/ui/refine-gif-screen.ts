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
  { description: 'Set or review exact start', sequences: [['Q']] },
  { description: 'Set or review exact end', sequences: [['W']] },
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
  private readonly setStart: HTMLButtonElement;
  private readonly setEnd: HTMLButtonElement;
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
      <span class="gif-workflow-command-status" role="status">Waiting for an inexact range</span>`;

    this.root = doc.createElement('section');
    this.root.id = 'refineGifScreen';
    this.root.className = 'gif-workflow-screen refine-gif-screen';
    this.root.setAttribute('aria-label', 'Refine Gif workspace');
    this.root.innerHTML = `
      <div class="gif-workflow-player-host"></div>
      <section class="gif-refinement-workbench" aria-label="Exact endpoint refinement" hidden>
        <div class="gif-refinement-heading">
          <div><h1>Resolve exact frames</h1><p data-refine-range-title></p></div>
          <span class="gif-refinement-mode">Frame-by-frame</span>
        </div>
        <div class="gif-refinement-endpoints">
          <button type="button" class="gif-refinement-endpoint" data-command="set-start">
            <span class="gif-refinement-endpoint-label">Set exact start <kbd>Q</kbd></span>
            <strong data-refine-start-value>Needs exact frame</strong>
            <small data-refine-start-approximation></small>
          </button>
          <button type="button" class="gif-refinement-endpoint" data-command="set-end">
            <span class="gif-refinement-endpoint-label">Set exact end <kbd>W</kbd></span>
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
        <p>Choose an inexact range from GIF Extraction to replace its timestamps with exact frames.</p>
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
    this.setStart = this.required(this.root.querySelector('[data-command="set-start"]'), HTMLButtonElement, 'set-start command');
    this.setEnd = this.required(this.root.querySelector('[data-command="set-end"]'), HTMLButtonElement, 'set-end command');
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
      ? Object.freeze([Object.freeze({ panelId: 'clips', content: options.rangesPanel, entryBehavior: 'expand-once' as const })])
      : Object.freeze([]);
  }

  onActivate(): void {
    this.active = true;
    this.lastSeekKey = null;
    this.options.player.mount(this.playerHost, 'Select an inexact range to refine');
    this.options.player.attachSession(this.options.session?.reviewSession ?? null);
    this.options.keyboard.activate(this.keyboardTarget);
    const refinement = this.snapshot?.refinement;
    if (refinement) {
      this.options.rangesPanel?.showNeedsRefinement(refinement.rangeId);
      this.requestExactPosition(refinement);
    }
  }

  onDeactivate(): void {
    this.active = false;
    this.seekGeneration += 1;
    this.options.keyboard.deactivate();
    this.options.session?.abandonRefinement();
    this.options.rangesPanel?.showAll();
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
    this.setStart.addEventListener('click', () => this.markEndpoint('start'));
    this.setEnd.addEventListener('click', () => this.markEndpoint('end'));
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
    const result = this.options.session?.beginRefinement(nextRangeId);
    if (result?.kind === 'started') this.options.rangesPanel?.showNeedsRefinement(nextRangeId);
  }

  private backToExtraction(): void {
    const rangeId = this.snapshot?.refinement?.rangeId ?? null;
    this.options.session?.abandonRefinement();
    this.options.rangesPanel?.showAll();
    this.options.onBack(rangeId);
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.snapshot = snapshot;
    const refinement = snapshot.refinement;
    this.sourceName.textContent = snapshot.source?.name ?? 'No movie open';
    this.workbench.hidden = refinement === null;
    this.emptyCopy.hidden = refinement !== null;
    if (!refinement) {
      this.commandTitle.textContent = 'Refine Gif';
      this.commandStatus.textContent = 'Waiting for an inexact range';
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
    this.setStart.disabled = !editing;
    this.setEnd.disabled = !editing;
    this.lock.disabled = !editing || !refinement.canCommit;
    this.extract.disabled = !this.canExtractCurrent();
    this.extract.title = this.extract.disabled
      ? refinement.status === 'committed' ? 'This range is already complete or extraction is unavailable.' : 'Lock an exact range before extracting.'
      : 'Extract this exact range';
    this.next.disabled = refinement.status !== 'committed' || refinement.nextInexactRangeId === null;
    this.localStatus.textContent = refinement.message ?? this.instruction(refinement);
    if (this.active) {
      this.options.rangesPanel?.showNeedsRefinement(refinement.rangeId);
      this.requestExactPosition(refinement);
    }
  }

  private renderEndpoint(endpoint: RefineGifEndpoint, refinement: IRefineGifSessionSnapshot): void {
    const value = endpoint === 'start' ? refinement.start : refinement.end;
    const original = endpoint === 'start' ? refinement.original.start : refinement.original.end;
    const button = endpoint === 'start' ? this.setStart : this.setEnd;
    const output = endpoint === 'start' ? this.startValue : this.endValue;
    const approximation = endpoint === 'start' ? this.startApproximation : this.endApproximation;
    button.classList.toggle('is-active', refinement.status === 'editing' && refinement.focusedEndpoint === endpoint);
    button.setAttribute('aria-pressed', String(refinement.status === 'editing' && refinement.focusedEndpoint === endpoint));
    output.textContent = value.kind === 'exact-frame'
      ? `Frame ${value.identity.frameIndex.toLocaleString()}`
      : 'Needs exact frame';
    approximation.textContent = original.kind === 'playback-timestamp'
      ? `Approx. ${this.timeText(original.timestampUs)}`
      : `Captured at frame ${original.identity.frameIndex.toLocaleString()}`;
  }

  private requestExactPosition(refinement: IRefineGifSessionSnapshot): void {
    if (refinement.status !== 'editing') return;
    const key = `${refinement.rangeId}:${refinement.seekRevision}`;
    if (this.lastSeekKey === key) return;
    this.lastSeekKey = key;
    const generation = ++this.seekGeneration;
    void this.options.player.enterExactScrubAt(refinement.seekTimeUs).then(capture => {
      if (!this.active || generation !== this.seekGeneration || capture !== null) return;
      this.localStatus.textContent = 'The exact frame could not be displayed. Try the progress bar or arrow keys.';
    });
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
