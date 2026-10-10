import type { GifExtractionSession, IGifExtractionSessionSnapshot } from '../app/gif-extraction-session.js';
import type { IAppPanelContent, IAppScreen, IAppScreenPanelContribution, IShortcutDescriptor } from './app-screen.js';
import { FrameReviewPlayerControl } from './frame-review-player-control.js';
import { GifWorkflowKeyboardController } from './gif-workflow-keyboard-controller.js';

export const GIF_EXTRACTION_SHORTCUTS: readonly IShortcutDescriptor[] = Object.freeze([
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
  { description: 'Set or replace range start', sequences: [['Q']] },
  { description: 'Set or replace range end', sequences: [['W']] },
  { description: 'Jump to exact start', sequences: [['A']] },
  { description: 'Jump to exact end', sequences: [['S']] },
  { description: 'Loop the exact range', sequences: [['Z']] },
  { description: 'Lock the current range', sequences: [['X']] },
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
  private readonly jumpStartButton: HTMLButtonElement;
  private readonly jumpEndButton: HTMLButtonElement;
  private readonly loopButton: HTMLButtonElement;
  private readonly unsubscribeSession: (() => void) | null;
  private readonly unsubscribeTransport: () => void;
  private snapshot: IGifExtractionSessionSnapshot | null = null;
  private previewRevision: number | null = null;
  private pendingPreviewStop: Promise<unknown> = Promise.resolve();
  private previewOperation = 0;
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
        <button type="button" data-command="jump-start" disabled><span>Jump to Start</span><kbd>A</kbd></button>
        <button type="button" data-command="jump-end" disabled><span>Jump to End</span><kbd>S</kbd></button>
        <button type="button" data-command="loop-range" disabled><span>Loop preview</span><kbd>Z</kbd></button>
        <button type="button" class="gif-lock-range" data-command="lock-range" disabled><span>Lock range</span><kbd>X</kbd></button>
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
    this.jumpStartButton = this.required(this.root.querySelector('[data-command="jump-start"]'), HTMLButtonElement, 'jump-start command');
    this.jumpEndButton = this.required(this.root.querySelector('[data-command="jump-end"]'), HTMLButtonElement, 'jump-end command');
    this.loopButton = this.required(this.root.querySelector('[data-command="loop-range"]'), HTMLButtonElement, 'loop-range command');
    this.bind();
    this.unsubscribeSession = options.session?.subscribe(snapshot => this.render(snapshot)) ?? null;
    this.unsubscribeTransport = options.player.subscribeTransport(() => { if (this.snapshot) this.render(this.snapshot); });
    this.panelContributions = options.rangesPanel
      ? Object.freeze([Object.freeze({ panelId: 'clips', content: options.rangesPanel })])
      : Object.freeze([]);
  }

  onActivate(): void {
    this.active = true;
    this.options.player.mount(this.playerHost);
    this.attachCurrentSession();
    this.options.keyboard.activate({
      player: this.options.player,
      capture: {
        markStart: () => this.markStart(),
        markEnd: () => this.markEnd(),
        jumpStart: () => this.jump('start'),
        jumpEnd: () => this.jump('end'),
        startLoop: () => { void this.startLoop(); },
        lockRange: () => this.lockRange(),
        canMark: () => this.options.player.exactPreviewPhase() !== 'running',
        canJump: () => this.canJump(),
        canLoop: () => this.canLoop(),
        canLock: () => this.canLock(),
        extractCurrent: () => this.extractCurrent(),
        canExtractCurrent: () => this.canExtractCurrent(),
      },
    });
  }

  onDeactivate(): void {
    this.active = false;
    this.options.player.interruptJumps();
    this.options.keyboard.deactivate();
    this.previewOperation += 1;
    if (this.options.player.exactPreviewPhase() !== 'inactive') {
      this.pendingPreviewStop = this.options.player.stopExactPreview().catch(() => null);
    }
  }

  focusInitial(): void {
    if (!this.options.player.focusInitial()) this.openMovie.focus();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!event.defaultPrevented) this.options.keyboard.handleKeyDown(event);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeSession?.();
    this.unsubscribeTransport();
  }

  private bind(): void {
    this.openMovie.addEventListener('click', () => { void this.requestOpenMovie(); });
    this.markStartButton.addEventListener('click', () => this.markStart());
    this.markEndButton.addEventListener('click', () => this.markEnd());
    this.lockButton.addEventListener('click', () => this.lockRange());
    this.jumpStartButton.addEventListener('click', () => this.jump('start'));
    this.jumpEndButton.addEventListener('click', () => this.jump('end'));
    this.loopButton.addEventListener('click', () => { void this.startLoop(); });
  }

  private async requestOpenMovie(): Promise<void> {
    this.options.player.interruptJumps();
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
    if (this.options.player.exactPreviewPhase() === 'running') return;
    this.options.player.interruptJumps();
    this.options.session?.markStart(this.options.player.displayedCapture());
  }

  private markEnd(): void {
    if (this.options.player.exactPreviewPhase() === 'running') return;
    this.options.player.interruptJumps();
    this.options.session?.markEnd(this.options.player.displayedCapture());
  }

  private lockRange(): void {
    void this.lockRangeAsync();
  }

  private async lockRangeAsync(): Promise<void> {
    const session = this.options.session;
    if (!session || !this.canLock()) return;
    const revision = session.snapshot.previewRevision;
    const generation = session.snapshot.capture?.sourceGeneration;
    if (this.options.player.exactPreviewPhase() !== 'inactive') {
      try { await this.options.player.stopExactPreview(); }
      catch (error) {
        this.commandStatus.textContent = error instanceof Error ? error.message : 'Playback recovery failed.';
      }
    }
    if (session.snapshot.previewRevision !== revision || session.snapshot.capture?.sourceGeneration !== generation) return;
    const draft = session.snapshot.capture?.capture;
    if (draft?.kind === 'draft'
      && (draft.start?.kind === 'saved-exact-frame' || draft.end?.kind === 'saved-exact-frame')) {
      try { if (!await session.prepareSavedDraft()) return; }
      catch (error) {
        this.commandStatus.textContent = error instanceof Error ? error.message : 'Saved frames could not be checked.';
        return;
      }
    }
    if (session.snapshot.previewRevision !== revision || session.snapshot.capture?.sourceGeneration !== generation
      || session.snapshot.capture?.capture.kind !== 'draft') return;
    session.lockRange();
  }

  private canLock(): boolean {
    const snapshot = this.snapshot;
    const draft = snapshot?.capture?.capture;
    return snapshot?.captureAvailable === true && draft?.kind === 'draft' && !!draft.start && !!draft.end;
  }

  private canJump(): boolean { return this.snapshot?.previewTarget !== null && this.snapshot?.previewTarget !== undefined; }

  private canLoop(): boolean {
    const target = this.snapshot?.previewTarget;
    return !!target && target.startFrameIndex < target.endFrameIndex
      && !this.options.player.ordinaryPlaybackRunning()
      && (this.options.player.exactScrubActive() || this.options.player.exactPreviewPhase() === 'running');
  }

  private jump(endpoint: 'start' | 'end'): void {
    const target = this.snapshot?.previewTarget;
    if (!target) return;
    void this.options.player.enterExactScrubAtFrame(endpoint === 'start' ? target.startFrameIndex : target.endFrameIndex);
  }

  private async startLoop(): Promise<void> {
    const target = this.snapshot?.previewTarget;
    if (!target || !this.canLoop()) return;
    const operation = ++this.previewOperation;
    await this.pendingPreviewStop;
    if (operation !== this.previewOperation || this.options.session?.snapshot.previewRevision !== target.revision) return;
    try {
      await this.options.player.startExactPreview(target);
    } catch (error) {
      this.commandStatus.textContent = error instanceof Error ? error.message : 'Loop preview could not start.';
    }
  }

  private extractCurrent(): void {
    const rangeId = this.options.session?.snapshot.selectedRangeId;
    if (rangeId) void this.options.session?.extractRange(rangeId);
  }

  private canExtractCurrent(): boolean {
    if (this.options.player.exactPreviewPhase() === 'running') return false;
    const session = this.options.session;
    const rangeId = session?.snapshot.selectedRangeId;
    return !!rangeId && session?.canExtractRange(rangeId) === true;
  }

  private attachCurrentSession(): void {
    if (this.active) this.options.player.attachSession(this.options.session?.reviewSession ?? null);
  }

  private render(snapshot: IGifExtractionSessionSnapshot): void {
    this.snapshot = snapshot;
    if (this.previewRevision !== null && snapshot.previewRevision !== this.previewRevision) {
      this.previewOperation += 1;
      if (this.options.player.exactPreviewPhase() !== 'inactive') {
        this.pendingPreviewStop = this.options.player.stopExactPreview().catch(() => null);
      }
    }
    this.previewRevision = snapshot.previewRevision;
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
    this.markStartButton.disabled = !captureReady || this.options.player.exactPreviewPhase() === 'running';
    this.markEndButton.disabled = !captureReady || this.options.player.exactPreviewPhase() === 'running';
    const markTitle = this.options.player.exactPreviewPhase() === 'running'
      ? 'Pause the loop with Space before changing a capture endpoint.' : 'Capture the displayed frame';
    this.markStartButton.title = markTitle;
    this.markEndButton.title = markTitle;
    const draft = snapshot.capture?.capture;
    this.lockButton.disabled = !captureReady || draft?.kind !== 'draft' || !draft.start || !draft.end;
    this.lockButton.title = this.lockButton.disabled
      ? 'Set both endpoints of an unlocked draft to lock it.' : 'Lock the current draft';
    this.jumpStartButton.disabled = !this.canJump();
    this.jumpEndButton.disabled = !this.canJump();
    this.loopButton.disabled = !this.canLoop();
    this.loopButton.title = this.loopButton.disabled
      ? 'Select a two-frame or longer exact range and enter frame scrub to loop.' : 'Loop the exact range';
    this.openMovie.disabled = snapshot.lifecycle === 'choosing' || snapshot.lifecycle === 'opening';
    this.options.player.setJumpUnavailable(this.openMovie.disabled);
    this.attachCurrentSession();
  }

  private statusText(snapshot: IGifExtractionSessionSnapshot): string {
    if (snapshot.lifecycle === 'choosing') return 'Choose a movie';
    if (snapshot.lifecycle === 'opening') return 'Opening movie';
    if (!snapshot.source) return 'Waiting for a movie';
    const target = snapshot.previewTarget;
    if (target && this.options.player.exactPreviewPhase() !== 'inactive') {
      const label = target.kind === 'draft' ? 'draft' : target.kind === 'refinement' ? 'staged range' : 'locked range';
      return `${this.options.player.exactPreviewPhase() === 'running' ? 'Looping' : 'Paused'} ${label} · frames ${target.startFrameIndex}–${target.endFrameIndex}`;
    }
    if (snapshot.reviewState?.captureEnabled) return 'Exact capture ready';
    return snapshot.reviewState?.message ?? 'Preparing exact frames';
  }

  private required<T extends Element>(value: Element | null, constructor: { new (...args: never[]): T }, label: string): T {
    if (!(value instanceof constructor)) throw new Error(`GIF Extraction ${label} is missing.`);
    return value;
  }
}
