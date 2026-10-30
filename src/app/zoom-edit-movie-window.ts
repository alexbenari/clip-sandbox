import type { IFrameReviewService, IFrameReviewSession, IFrameReviewSourceSelection } from '../frame-review/frame-review-api.js';
import { CurrentMovie } from './current-movie.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { RuntimeFailureReporter } from './runtime-failure-reporter.js';
import type { IZoomEditSourceService } from './zoom-edit-source-service.js';

export type ZoomEditMovieWindowState =
  | 'finding-movie' | 'preparing-window' | 'anchored' | 'cancelled' | 'none' | 'movie-only' | 'not-found' | 'failed';

export type ZoomEditWindowAnchor = Readonly<{
  windowId: string;
  review: IFrameReviewSession;
  clipStartFrame: number;
  earliestFrame: number;
  latestFrame: number;
}>;

export interface IZoomEditMovieWindowEvents {
  stateChanged: ZoomEditMovieWindowState;
  anchored: ZoomEditWindowAnchor;
  anchoredReviewEnded: void;
}

export interface IZoomEditMovieWindowRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly muted: boolean;
}

type ZoomEditMovieWindowDependencies = Readonly<{
  frameReview: IFrameReviewService;
  sources: IZoomEditSourceService;
  failures: Pick<RuntimeFailureReporter, 'report'>;
  previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
}>;

const MAX_WIDEN_STEPS = 2;

export class ZoomEditMovieWindow implements IEventSource<IZoomEditMovieWindowEvents> {
  private readonly events = new EventSource<IZoomEditMovieWindowEvents>();
  private current: CurrentMovie | null = null;
  private windowState: ZoomEditMovieWindowState = 'finding-movie';
  private disposed = false;

  private constructor(private readonly deps: ZoomEditMovieWindowDependencies, private readonly request: IZoomEditMovieWindowRequest) {}

  static open(deps: ZoomEditMovieWindowDependencies, request: IZoomEditMovieWindowRequest): ZoomEditMovieWindow {
    const movieWindow = new ZoomEditMovieWindow(deps, request);
    void movieWindow.openWindow(0, undefined);
    return movieWindow;
  }

  get state(): ZoomEditMovieWindowState { return this.windowState; }

  on<TName extends keyof IZoomEditMovieWindowEvents>(name: TName, handler: EventHandler<IZoomEditMovieWindowEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  abandon(error: unknown): void {
    if (this.disposed) return;
    this.deps.failures.report('The source movie around this clip could not be prepared.', error);
    this.end('failed');
  }

  // Stops a window the clip can no longer use, without reporting a window failure.
  async stop(): Promise<void> {
    if (this.disposed) return;
    if (this.windowState === 'finding-movie' || this.windowState === 'preparing-window' || this.windowState === 'anchored') {
      this.changeState('failed');
    }
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.closeCurrent();
  }

  private async openWindow(widen: number, previousWindowId: string | undefined): Promise<void> {
    const { folder, filename } = this.request;
    try {
      const answer = await this.deps.sources.openWindow({ folder, filename, widen, previousWindowId });
      if (this.disposed) return;
      if (answer.kind !== 'ready') {
        this.end(answer.kind === 'no-source-info' ? 'none' : answer.kind);
        return;
      }
      this.changeState('preparing-window');
      const movie = this.newMovie();
      this.current = movie;
      const unsubscribeReady = movie.on('exactCaptureReady', () => {
        unsubscribeReady();
        void this.anchor(movie, answer.windowId, widen);
      });
      movie.on('reviewEnded', () => this.onReviewEnded(movie));
      const selection: IFrameReviewSourceSelection = Object.freeze({ name: filename, sourceHandle: answer.sourceHandle });
      const review = await movie.openCandidate(selection);
      if (this.disposed || this.current !== movie) {
        await review.dispose();
        return;
      }
      movie.switchTo(selection, review);
      movie.followReview();
    } catch (error) {
      this.abandon(error);
    }
  }

  private async anchor(movie: CurrentMovie, windowId: string, widen: number): Promise<void> {
    const review = movie.review;
    if (!review) return;
    try {
      const answer = await this.deps.sources.anchorWindow({ windowId, sessionId: review.id });
      if (this.disposed || this.current !== movie) return;
      if (answer.kind === 'not-found') {
        void this.closeCurrent();
        if (widen < MAX_WIDEN_STEPS) await this.openWindow(widen + 1, windowId);
        else this.end('not-found');
        return;
      }
      this.changeState('anchored');
      this.events.emit('anchored', Object.freeze({
        windowId, review, clipStartFrame: answer.clipStartFrame, earliestFrame: answer.earliestFrame, latestFrame: answer.latestFrame,
      }));
    } catch (error) {
      this.abandon(error);
    }
  }

  private onReviewEnded(movie: CurrentMovie): void {
    if (this.disposed || this.current !== movie) return;
    if (this.windowState === 'anchored') this.events.emit('anchoredReviewEnded');
    else this.end('failed');
  }

  private end(state: 'cancelled' | 'none' | 'movie-only' | 'not-found' | 'failed'): void {
    void this.closeCurrent();
    this.changeState(state);
  }

  private async closeCurrent(): Promise<void> {
    const review = this.current?.close();
    this.current = null;
    try {
      await review?.dispose();
    } catch (error) {
      this.deps.failures.report('The movie around this clip could not be closed.', error);
    }
  }

  private changeState(state: ZoomEditMovieWindowState): void {
    this.windowState = state;
    if (!this.disposed) this.events.emit('stateChanged', state);
  }

  private newMovie(): CurrentMovie {
    return new CurrentMovie({
      frameReview: this.deps.frameReview,
      previewBounds: this.deps.previewBounds,
      muted: this.request.muted,
      failures: this.deps.failures,
    });
  }
}
