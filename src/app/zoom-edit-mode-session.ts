import { RefineRange, type RefineRangeRefusal } from '../domain/refine-range.js';
import type {
  FrameReviewSessionId,
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import { CurrentMovie } from './current-movie.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { FolderAccess } from './folder-access.js';
import type { IFrameReviewDisplayedCapture } from './frame-review-displayed-capture.js';
import type { RuntimeFailureReporter } from './runtime-failure-reporter.js';
import { ZoomEditMovieWindow, type ZoomEditMovieWindowState, type ZoomEditWindowAnchor } from './zoom-edit-movie-window.js';
import type { IZoomEditSourceService } from './zoom-edit-source-service.js';

export interface IZoomEditPlayer {
  attachSession(session: IFrameReviewSession | null): void;
  displayedCapture(): IFrameReviewDisplayedCapture | null;
  ordinaryPlaybackRunning(): boolean;
  exactPreviewPhase(): 'inactive' | 'running' | 'paused';
  togglePlayback(): Promise<void>;
  jumpBySeconds(seconds: number): void;
  enterExactScrubAtFrame(frameIndex: number): Promise<IFrameReviewDisplayedCapture | null>;
  startExactPreview(range: Readonly<{ startFrameIndex: number; endFrameIndex: number }>): Promise<void>;
  stopExactPreview(): Promise<IFrameReviewDisplayedCapture | null>;
}

export type ZoomEditPictureReadiness = 'preparing' | 'ready' | 'failed';

export type ZoomEditExtension = Exclude<ZoomEditMovieWindowState, 'anchored'> | 'ready';

export type ZoomEditRefusal =
  | Readonly<{ reason: 'clip-preparing' | 'source-failed' | 'start-after-end' | 'end-before-start' | 'beyond-extension'
    | 'loop-needs-two-frames' | 'ended' }>
  | Readonly<{ reason: 'extension-unavailable'; extension: Exclude<ZoomEditExtension, 'ready'> }>;

export type ZoomEditCommandAnswer =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'refused'; refusal: ZoomEditRefusal }>
  | Readonly<{ kind: 'failed' }>;

export type ZoomEditJumpSeconds = 1 | 2 | 5 | 7 | 10;

export type ZoomEditShownSource = Readonly<{ kind: 'clip' }> | Readonly<{ kind: 'window'; windowId: string }>;

export interface IZoomEditStagedSelection {
  readonly source: ZoomEditShownSource;
  readonly sessionId: FrameReviewSessionId;
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface IZoomEditModeSnapshot {
  readonly picture: ZoomEditPictureReadiness;
  readonly extension: ZoomEditExtension;
  readonly range: RefineRange | null;
}

export interface IZoomEditModeSessionEvents {
  changed: IZoomEditModeSnapshot;
}

export interface IZoomEditModeRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly hasSourceInfo: boolean;
  readonly muted: boolean;
}

type ZoomEditModeDependencies = Readonly<{
  frameReview: IFrameReviewService;
  sources: IZoomEditSourceService;
  player: IZoomEditPlayer;
  failures: Pick<RuntimeFailureReporter, 'report'>;
  previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
}>;

type ShownSource = Readonly<{ source: ZoomEditShownSource; review: IFrameReviewSession; offset: number }>;

class ZoomEditSessionEnded extends Error {}

const DONE: ZoomEditCommandAnswer = Object.freeze({ kind: 'done' });
const COMMAND_FAILED: ZoomEditCommandAnswer = Object.freeze({ kind: 'failed' });

// Staged frames are clip-relative, so they survive the switch from the clip to its movie window.
// While the mode is active this session decides which review the shared player shows.
export class ZoomEditModeSession implements IEventSource<IZoomEditModeSessionEvents> {
  private readonly events = new EventSource<IZoomEditModeSessionEvents>();
  private readonly clipMovie: CurrentMovie;
  private readonly movieWindow: ZoomEditMovieWindow | null;
  private picture: ZoomEditPictureReadiness = 'preparing';
  private range: RefineRange | null = null;
  private shown: ShownSource | null = null;
  private pendingAnchor: ZoomEditWindowAnchor | null = null;
  private lastStepDirection: -1 | 1 = 1;
  private commands: Promise<unknown> = Promise.resolve();
  private disposed = false;

  private constructor(private readonly deps: ZoomEditModeDependencies, private readonly request: IZoomEditModeRequest) {
    this.clipMovie = new CurrentMovie({
      frameReview: deps.frameReview, previewBounds: deps.previewBounds, muted: request.muted, failures: deps.failures,
    });
    this.clipMovie.on('exactCaptureReady', () => this.onClipReady());
    this.clipMovie.on('reviewEnded', () => this.onShownReviewEnded('clip'));
    this.movieWindow = request.hasSourceInfo ? this.openMovieWindow() : null;
  }

  static begin(deps: ZoomEditModeDependencies, request: IZoomEditModeRequest): ZoomEditModeSession {
    const session = new ZoomEditModeSession(deps, request);
    void session.openClip();
    return session;
  }

  get snapshot(): IZoomEditModeSnapshot {
    return Object.freeze({ picture: this.picture, extension: this.extension, range: this.range });
  }

  on<TName extends keyof IZoomEditModeSessionEvents>(name: TName, handler: EventHandler<IZoomEditModeSessionEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  stagedSelection(): IZoomEditStagedSelection | null {
    const { range, shown } = this;
    if (!range || !shown) return null;
    return Object.freeze({
      source: shown.source,
      sessionId: shown.review.id,
      startFrame: range.start + shown.offset,
      endFrame: range.end + shown.offset,
    });
  }

  togglePlayback(): Promise<ZoomEditCommandAnswer> {
    return this.enqueue(async () => {
      if (!this.shown) return this.refused(this.picture === 'failed' ? 'source-failed' : 'clip-preparing');
      await this.whileOpen(this.deps.player.togglePlayback());
      return DONE;
    });
  }

  step(direction: -1 | 1): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      const current = await this.pauseOnExactFrame();
      if (current === null) return this.refused('clip-preparing');
      this.lastStepDirection = direction;
      return this.moveToward(range, current, current + direction);
    });
  }

  jump(seconds: ZoomEditJumpSeconds): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      const { player } = this.deps;
      if (player.ordinaryPlaybackRunning() || player.exactPreviewPhase() === 'running') return this.jumpPlayback(range, seconds);
      const current = this.displayedClipFrame();
      if (current === null) return this.refused('clip-preparing');
      return this.moveToward(range, current, current + this.lastStepDirection * this.framesIn(seconds));
    });
  }

  markStart(): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      const current = await this.pauseOnExactFrame();
      if (current === null) return this.refused('clip-preparing');
      const change = range.withStart(current);
      if (change.kind === 'refused') return this.refusedBy(change.reason);
      await this.stage(change.range);
      return DONE;
    });
  }

  markEnd(): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      const current = await this.pauseOnExactFrame();
      if (current === null) return this.refused('clip-preparing');
      const change = range.withEnd(current);
      if (change.kind === 'refused') return this.refusedBy(change.reason);
      await this.stage(change.range);
      return DONE;
    });
  }

  jumpToStart(): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      await this.pauseOnExactFrame();
      await this.showClipFrame(range.start);
      return DONE;
    });
  }

  jumpToEnd(): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      await this.pauseOnExactFrame();
      await this.showClipFrame(range.end);
      return DONE;
    });
  }

  toggleLoop(): Promise<ZoomEditCommandAnswer> {
    return this.enqueueEdit(async range => {
      if (this.deps.player.exactPreviewPhase() === 'running') {
        await this.whileOpen(this.deps.player.stopExactPreview());
        return DONE;
      }
      if (range.start === range.end) return this.refused('loop-needs-two-frames');
      await this.startLoop(range);
      return DONE;
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingAnchor = null;
    if (this.shown) this.deps.player.attachSession(null);
    await Promise.allSettled([this.clipMovie.close()?.dispose(), this.movieWindow?.dispose()]);
  }

  private get extension(): ZoomEditExtension {
    if (!this.movieWindow) return 'none';
    if (this.shown?.source.kind === 'window') return 'ready';
    const state = this.movieWindow.state;
    return state === 'anchored' ? 'preparing-window' : state;
  }

  private openMovieWindow(): ZoomEditMovieWindow {
    const { frameReview, sources, failures, previewBounds } = this.deps;
    const { folder, filename, muted } = this.request;
    const movieWindow = ZoomEditMovieWindow.open({ frameReview, sources, failures, previewBounds }, { folder, filename, muted });
    movieWindow.on('stateChanged', () => this.publish());
    movieWindow.on('anchored', anchor => {
      this.pendingAnchor = anchor;
      this.switchWhenAnchoredAndReady();
    });
    movieWindow.on('anchoredReviewEnded', () => this.onShownReviewEnded('window'));
    return movieWindow;
  }

  private async openClip(): Promise<void> {
    const { folder, filename } = this.request;
    try {
      const sourceHandle = await this.deps.sources.openClip({ folder, filename });
      if (this.disposed) return;
      const selection: IFrameReviewSourceSelection = Object.freeze({ name: filename, sourceHandle });
      const review = await this.clipMovie.openCandidate(selection);
      if (this.disposed) {
        await review.dispose();
        return;
      }
      this.clipMovie.switchTo(selection, review);
      this.show({ source: Object.freeze({ kind: 'clip' }), review, offset: 0 });
      this.clipMovie.followReview();
      this.publish();
    } catch (error) {
      if (this.disposed) return;
      this.clipMovie.failOpening(error);
      this.failPicture();
    }
  }

  private onClipReady(): void {
    const frameCount = this.clipMovie.reviewState?.preparedReview?.frameCount ?? 0;
    if (this.disposed || this.range || frameCount < 1) return;
    this.range = RefineRange.ofClip(frameCount);
    this.picture = 'ready';
    this.publish();
    this.switchWhenAnchoredAndReady();
  }

  private onShownReviewEnded(source: ZoomEditShownSource['kind']): void {
    if (this.disposed || this.shown?.source.kind !== source) return;
    this.failPicture();
  }

  // Without a working clip the window can never be switched to, so it is stopped too.
  private failPicture(): void {
    this.picture = 'failed';
    if (this.shown?.source.kind !== 'window') {
      this.pendingAnchor = null;
      void this.movieWindow?.stop();
    }
    this.publish();
  }

  private switchWhenAnchoredAndReady(): void {
    const anchor = this.pendingAnchor;
    if (!anchor || !this.range || this.picture === 'failed') return;
    this.pendingAnchor = null;
    void this.run(async () => {
      try {
        await this.switchToWindow(anchor);
      } catch (error) {
        if (!(error instanceof ZoomEditSessionEnded)) {
          this.deps.failures.report('Zoom edit mode could not show the movie around this clip.', error);
        }
      }
      return DONE;
    });
  }

  private async switchToWindow(anchor: ZoomEditWindowAnchor): Promise<void> {
    const range = this.range;
    if (this.movieWindow?.state !== 'anchored' || !range) return;
    let extended: RefineRange;
    try {
      extended = range.withExtension(anchor.earliestFrame - anchor.clipStartFrame, anchor.latestFrame - anchor.clipStartFrame);
    } catch (error) {
      this.movieWindow.abandon(error);
      return;
    }
    const { player } = this.deps;
    const wasLooping = player.exactPreviewPhase() === 'running';
    const wasPlaying = player.ordinaryPlaybackRunning();
    const shownFrame = await this.pauseOnExactFrame();
    if (shownFrame === null) {
      // The next command tries again, once an exact frame is on screen.
      this.pendingAnchor = anchor;
      return;
    }
    const clipReview = this.clipMovie.close();
    try {
      this.range = extended;
      this.show({ source: Object.freeze({ kind: 'window', windowId: anchor.windowId }), review: anchor.review, offset: anchor.clipStartFrame });
      await this.whileOpen(player.enterExactScrubAtFrame(anchor.clipStartFrame + shownFrame));
      this.publish();
      if (wasLooping) await this.startLoop(extended);
      else if (wasPlaying) await this.whileOpen(player.togglePlayback());
    } finally {
      await clipReview?.dispose().catch(error => this.deps.failures.report('The clip review could not be closed.', error));
    }
  }

  private show(shown: ShownSource): void {
    this.shown = shown;
    this.deps.player.attachSession(shown.review);
  }

  private async pauseOnExactFrame(): Promise<number | null> {
    const { player } = this.deps;
    if (player.exactPreviewPhase() === 'running' || player.ordinaryPlaybackRunning()) await this.whileOpen(player.togglePlayback());
    return this.displayedClipFrame();
  }

  private displayedClipFrame(): number | null {
    const point = this.deps.player.displayedCapture()?.point;
    if (point?.kind !== 'exact-frame' || !this.shown) return null;
    return point.identity.frameIndex - this.shown.offset;
  }

  private playbackClipFrame(): number | null {
    const capture = this.deps.player.displayedCapture();
    const prepared = this.shown?.review.state().preparedReview;
    if (capture?.point.kind !== 'playback-timestamp' || !prepared || !this.shown || prepared.durationUs <= 0n) return null;
    return Math.round(Number(capture.positionUs) * prepared.frameCount / Number(prepared.durationUs)) - this.shown.offset;
  }

  // Playback jumps forward; one that would pass the reachable frames pauses at their edge instead.
  private async jumpPlayback(range: RefineRange, seconds: ZoomEditJumpSeconds): Promise<ZoomEditCommandAnswer> {
    const position = this.playbackClipFrame();
    const target = position === null ? null : position + this.framesIn(seconds);
    if (target === null || range.nearestReachable(target) === target) {
      this.deps.player.jumpBySeconds(seconds);
      return DONE;
    }
    await this.pauseOnExactFrame();
    await this.showClipFrame(range.nearestReachable(target));
    return DONE;
  }

  // A move that would leave the reachable frames stops at their edge; it is refused only when it cannot move at all.
  private async moveToward(range: RefineRange, current: number, target: number): Promise<ZoomEditCommandAnswer> {
    const landing = range.nearestReachable(target);
    if ((landing - current) * Math.sign(target - current) <= 0) {
      const refusal = range.unreachableReason(target);
      return refusal ? this.refusedBy(refusal) : DONE;
    }
    await this.showClipFrame(landing);
    return DONE;
  }

  private framesIn(seconds: ZoomEditJumpSeconds): number {
    const prepared = this.shown?.review.state().preparedReview;
    if (!prepared || prepared.durationUs <= 0n) return 1;
    return Math.max(1, Math.round(seconds * prepared.frameCount * 1_000_000 / Number(prepared.durationUs)));
  }

  private async stage(range: RefineRange): Promise<void> {
    if (this.deps.player.exactPreviewPhase() !== 'inactive') await this.whileOpen(this.deps.player.stopExactPreview());
    this.range = range;
    this.publish();
  }

  private async showClipFrame(frame: number): Promise<void> {
    if (this.shown) await this.whileOpen(this.deps.player.enterExactScrubAtFrame(frame + this.shown.offset));
  }

  private async startLoop(range: RefineRange): Promise<void> {
    const offset = this.shown?.offset ?? 0;
    await this.whileOpen(this.deps.player.startExactPreview({ startFrameIndex: range.start + offset, endFrameIndex: range.end + offset }));
  }

  // Ends a command that was waiting on the player when the session was disposed, before it touches the player again.
  private async whileOpen<T>(work: Promise<T>): Promise<T> {
    const result = await work;
    if (this.disposed) throw new ZoomEditSessionEnded();
    return result;
  }

  private enqueueEdit(command: (range: RefineRange) => Promise<ZoomEditCommandAnswer>): Promise<ZoomEditCommandAnswer> {
    return this.enqueue(() => {
      const range = this.range;
      if (this.picture === 'failed') return Promise.resolve(this.refused('source-failed'));
      if (!range || !this.shown) return Promise.resolve(this.refused('clip-preparing'));
      return command(range);
    });
  }

  private enqueue(command: () => Promise<ZoomEditCommandAnswer>): Promise<ZoomEditCommandAnswer> {
    const answer = this.run(async () => {
      try {
        return await command();
      } catch (error) {
        if (error instanceof ZoomEditSessionEnded) return this.refused('ended');
        this.deps.failures.report('Zoom edit mode could not carry out that command. Try the key again.', error);
        return COMMAND_FAILED;
      }
    });
    void answer.then(() => this.switchWhenAnchoredAndReady());
    return answer;
  }

  // Work runs one step after another, so each key acts on the frame and range the previous key left.
  private run(work: () => Promise<ZoomEditCommandAnswer>): Promise<ZoomEditCommandAnswer> {
    const answer = this.commands.then(() => (this.disposed ? this.refused('ended') : work()));
    this.commands = answer;
    return answer;
  }

  private refusedBy(reason: RefineRangeRefusal): ZoomEditCommandAnswer {
    if (reason !== 'outside-clip') return this.refused(reason);
    const extension = this.extension;
    if (extension === 'ready') throw new Error('An anchored window extends the clip.');
    return Object.freeze({ kind: 'refused', refusal: Object.freeze({ reason: 'extension-unavailable', extension }) });
  }

  private refused(reason: Exclude<ZoomEditRefusal['reason'], 'extension-unavailable'>): ZoomEditCommandAnswer {
    return Object.freeze({ kind: 'refused', refusal: Object.freeze({ reason }) });
  }

  private publish(): void {
    if (!this.disposed) this.events.emit('changed', this.snapshot);
  }
}
