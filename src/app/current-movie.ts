import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import type { ActivityReporter } from './activity-reporter.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { GifSessionStatus } from './gif-session-status.js';
import type { RuntimeFailureReporter } from './runtime-failure-reporter.js';

export type CurrentMovieLifecycle = 'empty' | 'choosing' | 'opening' | 'open' | 'failed' | 'disposed';

export interface ICurrentMovieEvents {
  exactCaptureReady: void;
  reviewEnded: void;
}

type CurrentMovieDependencies = Readonly<{
  frameReview: IFrameReviewService;
  previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  status: Pick<GifSessionStatus, 'show' | 'changed'>;
  reporter?: Pick<ActivityReporter, 'progress' | 'success'>;
  failures: Pick<RuntimeFailureReporter, 'report'>;
}>;

// The movie currently open for frame review, including the states before one is open. The owning
// session drives a change of movie: it opens a candidate, resets its other parts, then switches.
export class CurrentMovie implements IEventSource<ICurrentMovieEvents> {
  private readonly events = new EventSource<ICurrentMovieEvents>();
  private state: CurrentMovieLifecycle = 'empty';
  private changing = false;
  private selected: IFrameReviewSourceSelection | null = null;
  private activeReview: IFrameReviewSession | null = null;
  private latestReviewState: IFrameReviewState | null = null;
  private generation = 0;
  private unsubscribeReview: (() => void) | null = null;

  constructor(private readonly deps: CurrentMovieDependencies) {}

  get lifecycle(): CurrentMovieLifecycle { return this.state; }
  get opening(): boolean { return this.changing; }
  get source(): IFrameReviewSourceSelection | null { return this.selected; }
  get review(): IFrameReviewSession | null { return this.activeReview; }
  get reviewState(): IFrameReviewState | null { return this.latestReviewState; }
  get sourceGeneration(): number { return this.generation; }

  on<TName extends keyof ICurrentMovieEvents>(name: TName, handler: EventHandler<ICurrentMovieEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  // Returns false while another movie is still being chosen or opened.
  beginChange(): boolean {
    if (this.changing || this.state === 'disposed') return false;
    this.changing = true;
    return true;
  }

  endChange(): void { this.changing = false; }

  async chooseSource(): Promise<IFrameReviewSourceSelection | null> {
    this.state = 'choosing';
    this.deps.status.show('Choose a movie');
    this.deps.status.changed();
    const selected = await this.deps.frameReview.chooseSource();
    if (!selected) this.restoreLifecycle();
    return selected;
  }

  openCandidate(selected: IFrameReviewSourceSelection): Promise<IFrameReviewSession> {
    this.state = 'opening';
    this.deps.status.show(`Opening ${selected.name}`);
    this.deps.status.changed();
    return this.deps.frameReview.open({ sourceHandle: selected.sourceHandle, previewBounds: this.deps.previewBounds });
  }

  // Stops reacting to the current movie's review events while the session prepares a replacement.
  stopFollowingReview(): void {
    this.unsubscribeReview?.();
    this.unsubscribeReview = null;
  }

  // Makes the candidate the current movie and returns the previous review for the session to dispose.
  switchTo(selected: IFrameReviewSourceSelection, candidate: IFrameReviewSession): IFrameReviewSession | null {
    const previous = this.activeReview;
    this.stopFollowingReview();
    this.generation += 1;
    this.selected = selected;
    this.activeReview = candidate;
    this.latestReviewState = candidate.state();
    return previous;
  }

  // Marks the switched movie open and starts following its preparation.
  followReview(): void {
    const candidate = this.activeReview;
    if (!candidate) return;
    this.state = 'open';
    this.deps.status.show(this.latestReviewState?.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames');
    let exactReadinessAnnounced = false;
    this.unsubscribeReview = candidate.subscribe(event => {
      if (this.state === 'disposed' || this.activeReview !== candidate) return;
      if (event.type === 'state') {
        const becameReady = !this.latestReviewState?.captureEnabled && event.state.captureEnabled;
        this.latestReviewState = event.state;
        if (event.state.phase === 'failed' || event.state.phase === 'closed') this.events.emit('reviewEnded');
        this.deps.status.show(event.state.captureEnabled ? 'Exact capture ready' : event.state.message);
        const preparationMessage = this.preparationProgressMessage(event.state);
        if (preparationMessage) this.deps.reporter?.progress(preparationMessage);
        if (becameReady && !exactReadinessAnnounced) {
          exactReadinessAnnounced = true;
          this.announceExactReadiness(event.state);
        }
        if (becameReady) this.events.emit('exactCaptureReady');
        this.deps.status.changed();
      } else if (event.type === 'error') {
        this.deps.failures.report(event.message);
      }
    });
    const currentState = this.latestReviewState;
    if (currentState?.captureEnabled && !exactReadinessAnnounced) {
      exactReadinessAnnounced = true;
      this.announceExactReadiness(currentState);
    }
    if (currentState?.captureEnabled) this.events.emit('exactCaptureReady');
  }

  reportOpening(selected: IFrameReviewSourceSelection): void {
    this.deps.reporter?.progress(`Opening ${selected.name}`);
  }

  reportOpened(selected: IFrameReviewSourceSelection): void {
    this.deps.reporter?.success(`Opened ${selected.name}.`);
  }

  failOpening(error: unknown): void {
    this.state = this.selected ? 'open' : 'failed';
    this.deps.status.show(error instanceof Error ? error.message : 'The movie could not be opened.');
    this.deps.failures.report('The movie could not be opened.', error);
  }

  restoreLifecycle(): void {
    this.state = this.selected ? 'open' : 'empty';
    this.deps.status.show(this.selected
      ? (this.latestReviewState?.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames')
      : null);
    this.deps.status.changed();
  }

  // Ends the current movie's life and returns its review for the session to dispose.
  close(): IFrameReviewSession | null {
    this.state = 'disposed';
    this.stopFollowingReview();
    const review = this.activeReview;
    this.activeReview = null;
    return review;
  }

  private preparationProgressMessage(state: IFrameReviewState): string | null {
    if (!this.selected) return null;
    let action: string;
    switch (state.phase) {
      case 'playback-ready': action = 'Playback is ready; preparing exact frames for'; break;
      case 'inspecting': action = 'Inspecting source media for'; break;
      case 'cache-validation': action = 'Checking the prepared review cache for'; break;
      case 'normalizing': action = 'Repairing source timestamps for'; break;
      case 'indexing': action = 'Indexing source frames for'; break;
      case 'proxy-encoding': action = 'Creating the exact-review proxy for'; break;
      case 'proxy-indexing': action = 'Indexing the exact-review proxy for'; break;
      case 'validating': action = 'Validating the exact frame map for'; break;
      default: return null;
    }
    const progress = state.progressPercent === null ? '' : ` (${Math.round(state.progressPercent)}%)`;
    return `${action} ${this.selected.name}${progress}.`;
  }

  private announceExactReadiness(state: IFrameReviewState): void {
    if (!this.selected) return;
    this.deps.reporter?.success(state.preparedReview?.cacheHit
      ? `Reused the prepared review cache for ${this.selected.name}.`
      : `Exact capture is ready for ${this.selected.name}.`);
  }
}
