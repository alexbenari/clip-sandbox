import type { GifExtractionSession, IGifExtractionSessionSnapshot } from '../app/gif-extraction-session.js';
import type { IAppPanelContent, IAppScreen, IAppScreenPanelContribution, IShortcutDescriptor } from './app-screen.js';
import { FrameReviewPlayerControl } from './frame-review-player-control.js';
import { GifWorkflowKeyboardController } from './gif-workflow-keyboard-controller.js';

export const GIF_EXTRACTION_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
  { description: 'Play or pause', sequences: [['Space']] },
  { description: 'Step backward one frame; hold to accelerate', sequences: [['Left']] },
  { description: 'Step forward one frame; hold to accelerate', sequences: [['Right']] },
  { description: 'Set or replace range start', sequences: [['Q']] },
  { description: 'Set or replace range end', sequences: [['W']] },
  { description: 'Lock the current range', sequences: [['A']] },
  { description: 'Extract the selected exact range', sequences: [['E']] },
]);

type GifExtractionScreenOptions = {
  readonly player: FrameReviewPlayerControl;
  readonly keyboard: GifWorkflowKeyboardController;
  readonly session?: GifExtractionSession;
  readonly rangesPanel?: IAppPanelContent;
  readonly document?: Document;
};

export class GifExtractionScreen implements IAppScreen {
  readonly id = 'gif-extraction';
  readonly label = 'GIF Extraction';
  readonly selectorStatus = 'fixed' as const;
  readonly root: HTMLElement;
  readonly commands: HTMLElement;
  readonly shortcuts = GIF_EXTRACTION_SHORTCUTS;
  readonly panelContributions: readonly IAppScreenPanelContribution[];
  readonly initiallyFoldedPanelIds = ['pipelines'] as const;
  private readonly playerHost: HTMLElement;
  private readonly openMovie: HTMLButtonElement;
  private readonly sourceName: HTMLElement;
  private readonly commandStatus: HTMLElement;
  private readonly emptyCopy: HTMLElement;
  private readonly markStartButton: HTMLButtonElement;
  private readonly markEndButton: HTMLButtonElement;
  private readonly lockButton: HTMLButtonElement;
  private readonly unsubscribeSession: (() => void) | null;
  private active = false;
  private destroyed = false;

  constructor(private readonly options: GifExtractionScreenOptions) {
    const doc = options.document ?? document;
    this.commands = doc.createElement('header');
    this.commands.className = 'gif-workflow-command-bar';
    this.commands.setAttribute('aria-label', 'GIF Extraction commands');
    this.commands.innerHTML = `
      <button type="button" class="btn-primary" data-command="open-movie">Open movie...</button>
      <div class="gif-workflow-source">
        <strong>GIF Extraction</strong>
        <span>No movie open</span>
      </div>
      <span class="gif-workflow-command-status" role="status" aria-live="polite">Waiting for a movie</span>`;

    this.root = doc.createElement('section');
    this.root.id = 'gifExtractionScreen';
    this.root.className = 'gif-workflow-screen';
    this.root.setAttribute('aria-label', 'GIF Extraction workspace');
    this.root.innerHTML = `
      <div class="gif-workflow-player-host"></div>
      <div class="gif-capture-controls" aria-label="Range capture controls">
        <button type="button" data-command="mark-start" disabled><span>Start</span><kbd>Q</kbd></button>
        <button type="button" data-command="mark-end" disabled><span>End</span><kbd>W</kbd></button>
        <button type="button" class="gif-lock-range" data-command="lock-range" disabled><span>Lock range</span><kbd>A</kbd></button>
      </div>
      <div class="gif-workflow-empty-copy">
        <h1>Choose a movie to begin</h1>
        <p>Review one source, mark several moments, then extract the exact ranges together.</p>
      </div>`;

    this.openMovie = this.required(this.commands.querySelector('[data-command="open-movie"]'), HTMLButtonElement, 'open-movie command');
    this.sourceName = this.required(this.commands.querySelector('.gif-workflow-source span'), HTMLElement, 'source name');
    this.commandStatus = this.required(this.commands.querySelector('.gif-workflow-command-status'), HTMLElement, 'command status');
    this.playerHost = this.required(this.root.querySelector('.gif-workflow-player-host'), HTMLElement, 'player host');
    this.emptyCopy = this.required(this.root.querySelector('.gif-workflow-empty-copy'), HTMLElement, 'empty copy');
    this.markStartButton = this.required(this.root.querySelector('[data-command="mark-start"]'), HTMLButtonElement, 'mark-start command');
    this.markEndButton = this.required(this.root.querySelector('[data-command="mark-end"]'), HTMLButtonElement, 'mark-end command');
    this.lockButton = this.required(this.root.querySelector('[data-command="lock-range"]'), HTMLButtonElement, 'lock-range command');
    this.bind();
    this.unsubscribeSession = options.session?.subscribe(snapshot => this.render(snapshot)) ?? null;
    this.panelContributions = options.rangesPanel
      ? Object.freeze([Object.freeze({ panelId: 'clips', content: options.rangesPanel })])
      : Object.freeze([]);
  }

  onActivate(): void {
    this.active = true;
    void this.options.session?.reopenLastMovie();
    this.options.player.mount(this.playerHost);
    this.attachCurrentSession();
    this.options.keyboard.activate({
      player: this.options.player,
      capture: {
        markStart: () => this.markStart(),
        markEnd: () => this.markEnd(),
        lockRange: () => this.lockRange(),
        extractCurrent: () => this.extractCurrent(),
        canExtractCurrent: () => this.canExtractCurrent(),
      },
    });
  }

  onDeactivate(): void {
    this.active = false;
    this.options.keyboard.deactivate();
  }

  focusInitial(): void {
    if (!this.options.player.focusInitial()) this.openMovie.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeSession?.();
  }

  private bind(): void {
    this.openMovie.addEventListener('click', () => { void this.requestOpenMovie(); });
    this.markStartButton.addEventListener('click', () => this.markStart());
    this.markEndButton.addEventListener('click', () => this.markEnd());
    this.lockButton.addEventListener('click', () => this.lockRange());
  }

  private async requestOpenMovie(): Promise<void> {
    const session = this.options.session;
    if (!session) {
      this.commandStatus.textContent = 'Movie opening is currently unavailable.';
      return;
    }
    this.openMovie.disabled = true;
    try {
      await session.openMovie();
      this.attachCurrentSession();
    } finally {
      this.openMovie.disabled = false;
    }
  }

  private markStart(): void {
    this.options.session?.markStart(this.options.player.displayedCapture());
  }

  private markEnd(): void {
    this.options.session?.markEnd(this.options.player.displayedCapture());
  }

  private lockRange(): void {
    const session = this.options.session;
    if (!session) return;
    const draft = session.snapshot.capture?.capture;
    if (draft?.kind === 'draft'
      && (draft.start?.kind === 'saved-exact-frame' || draft.end?.kind === 'saved-exact-frame')) {
      void session.prepareSavedDraft().then(ready => { if (ready) session.lockRange(); });
    } else {
      session.lockRange();
    }
  }

  private extractCurrent(): void {
    const rangeId = this.options.session?.snapshot.selectedRangeId;
    if (rangeId) void this.options.session?.extractRange(rangeId);
  }

  private canExtractCurrent(): boolean {
    const session = this.options.session;
    const rangeId = session?.snapshot.selectedRangeId;
    return !!rangeId && session?.canExtractRange(rangeId) === true;
  }

  private attachCurrentSession(): void {
    if (this.active) this.options.player.attachSession(this.options.session?.reviewSession ?? null);
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.sourceName.textContent = snapshot.source?.name ?? 'No movie open';
    this.commandStatus.textContent = this.statusText(snapshot);
    this.emptyCopy.hidden = snapshot.source !== null;
    const emptyHeading = this.emptyCopy.querySelector('h1');
    const emptyDescription = this.emptyCopy.querySelector('p');
    if (emptyHeading) emptyHeading.textContent = snapshot.lifecycle === 'opening' || snapshot.capturesLoading
      ? 'Opening movie' : 'Choose a movie to begin';
    if (emptyDescription) emptyDescription.textContent = snapshot.lifecycle === 'opening' || snapshot.capturesLoading
      ? 'Playback will be available when the movie opens. Saved captures will then appear in the Clips panel.'
      : 'Review one source, mark several moments, then extract the exact ranges together.';
    const captureReady = snapshot.captureAvailable ?? snapshot.reviewState?.captureEnabled === true;
    this.markStartButton.disabled = !captureReady;
    this.markEndButton.disabled = !captureReady;
    const draft = snapshot.capture?.capture;
    this.lockButton.disabled = !captureReady || draft?.kind !== 'draft' || !draft.start || !draft.end;
    this.openMovie.disabled = snapshot.lifecycle === 'choosing' || snapshot.lifecycle === 'opening';
    this.attachCurrentSession();
  }

  private statusText(snapshot: IGifExtractionSessionSnapshot): string {
    if (snapshot.lifecycle === 'choosing') return 'Choose a movie';
    if (snapshot.lifecycle === 'opening') return 'Opening movie';
    if (!snapshot.source) return 'Waiting for a movie';
    if (snapshot.reviewState?.captureEnabled) return 'Exact capture ready';
    return snapshot.reviewState?.message ?? 'Preparing exact frames';
  }

  private required<T extends Element>(value: Element | null, constructor: { new (...args: never[]): T }, label: string): T {
    if (!(value instanceof constructor)) throw new Error(`GIF Extraction ${label} is missing.`);
    return value;
  }
}
