import { CaptureEndpointValue, type CaptureEndpoint, type IExactFrameEndpoint, type ISavedExactFrameEndpoint } from '../domain/capture-endpoint.js';
import type { CapturedRange, CapturedRangeId } from '../domain/captured-range.js';
import { RangeCaptureModel, type IRangeCaptureSnapshot, type RangeCaptureTransition } from '../domain/range-capture-model.js';
import type { FrameReviewDisplayFrame, IFrameReviewSession } from '../frame-review/frame-review-api.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { ICaptureStorage } from './capture-storage.js';
import type { CurrentMovie } from './current-movie.js';
import { EventSource, type EventHandler, type IEventSource } from './event-source.js';
import type { IFrameReviewDisplayedCapture } from './frame-review-displayed-capture.js';
import { GifCaptureThumbnailSession, type GifThumbnailState } from './gif-capture-thumbnail-session.js';
import type { GifSessionStatus } from './gif-session-status.js';
import type { IExtractionProgressQuery } from './range-extraction.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';

// Awaited: a failure to position the player is reported by the queue.
export interface ICapturePositioning {
  showFrameAfterCapture(review: IFrameReviewSession, endpoint: CaptureEndpoint): Promise<void>;
}

export interface ICaptureQueueEvents {
  // Sent before the change is published, so a refinement of that range can be ended first.
  rangeRemoved: CapturedRangeId;
}

type CaptureQueueDependencies = Readonly<{
  movie: Pick<CurrentMovie, 'review' | 'reviewState' | 'sourceGeneration' | 'lifecycle' | 'opening'>;
  status: Pick<GifSessionStatus, 'message' | 'show' | 'advancePreview' | 'changed'>;
  thumbnails: IThumbnailCacheService;
  storage: ICaptureStorage;
  extraction: IExtractionProgressQuery;
  capturePositioning?: ICapturePositioning;
  reporter?: Pick<ActivityReporter, 'failure'>;
  diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

// The draft and locked ranges of the current movie, their start thumbnails, and their saved copy.
export class CaptureQueue implements IEventSource<ICaptureQueueEvents> {
  private readonly events = new EventSource<ICaptureQueueEvents>();
  private readonly captureThumbnails: GifCaptureThumbnailSession;
  private model: RangeCaptureModel | null = null;
  private selected: CapturedRangeId | null = null;
  private restoreStarted = false;
  private disposed = false;

  constructor(private readonly deps: CaptureQueueDependencies) {
    this.captureThumbnails = new GifCaptureThumbnailSession(deps.thumbnails, {
      onChanged: () => deps.status.changed(),
      onError: (message, error) => this.reportError(message, error),
    });
  }

  get hasModel(): boolean { return this.model !== null; }
  get capture(): IRangeCaptureSnapshot | null { return this.model?.snapshot ?? null; }
  get ranges(): readonly CapturedRange[] { return this.model?.snapshot.ranges ?? []; }
  get selectedRangeId(): CapturedRangeId | null { return this.selected; }
  get draftThumbnail(): GifThumbnailState { return this.captureThumbnails.draftState; }
  get restoring(): boolean { return this.deps.storage.restoring; }
  get loading(): boolean { return this.deps.storage.loading; }

  on<TName extends keyof ICaptureQueueEvents>(name: TName, handler: EventHandler<ICaptureQueueEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  range(rangeId: CapturedRangeId): CapturedRange | undefined {
    return this.ranges.find(range => range.id === rangeId);
  }

  thumbnailFor(rangeId: CapturedRangeId): GifThumbnailState { return this.captureThumbnails.stateForRange(rangeId); }
  isStale(rangeId: CapturedRangeId): boolean { return this.deps.storage.isStale(rangeId); }

  // Saves the queue and lets go of the current movie's thumbnails before another movie is switched in.
  async clearForReplacement(): Promise<void> {
    await this.captureThumbnails.clear();
    this.deps.storage.invalidate();
  }

  startForMovie(): void {
    const { movie, storage } = this.deps;
    this.model = new RangeCaptureModel(movie.sourceGeneration);
    storage.startForMovie(movie.sourceGeneration);
    const phase = movie.reviewState?.phase;
    if (phase === 'failed' || phase === 'closed') storage.endRestore();
    this.restoreStarted = false;
    this.selected = null;
  }

  // Replaces the queue with a model built elsewhere, such as the one range of a collection clip.
  useModel(model: RangeCaptureModel): void { this.model = model; }

  endRestore(): void { this.deps.storage.endRestore(); }
  stopShowingLoading(): void { this.deps.storage.stopShowingLoading(); }

  markStart(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.deps.storage.restoring || this.deps.movie.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !capture || !this.model) return this.captureUnavailable();
    const transition = this.model.markStart(endpoint);
    if (transition.kind === 'marked-start') {
      this.deps.status.advancePreview();
      this.captureThumbnails.replaceDraft(capture.thumbnail);
      this.save();
    }
    this.deps.status.show(transition.kind === 'rejected' ? transition.message : 'Start marked');
    this.deps.status.changed();
    return transition;
  }

  markEnd(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.deps.storage.restoring || this.deps.movie.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !this.model) return this.captureUnavailable();
    const transition = this.model.markEnd(endpoint);
    if (transition.kind === 'marked-end') {
      this.deps.status.advancePreview();
      this.save();
    }
    this.deps.status.show(transition.kind === 'rejected' ? transition.message : 'End marked');
    this.deps.status.changed();
    return transition;
  }

  // A draft with saved endpoints is first checked against the movie, so no caller has to remember to do it.
  async lockRange(): Promise<RangeCaptureTransition> {
    const draft = this.model?.snapshot.capture;
    if (draft?.kind === 'draft' && (draft.start?.kind === 'saved-exact-frame' || draft.end?.kind === 'saved-exact-frame')
      && !await this.prepareSavedDraft()) {
      return Object.freeze({ kind: 'rejected', message: this.deps.status.message ?? 'Saved draft frames could not be checked.' });
    }
    return this.lockDraft();
  }

  private lockDraft(): RangeCaptureTransition {
    if (!this.model || this.deps.storage.restoring || this.deps.movie.lifecycle !== 'open') return this.captureUnavailable();
    const transition = this.model.lockRange();
    if (transition.kind === 'locked') {
      this.deps.status.advancePreview();
      this.captureThumbnails.commitDraftToRange(transition.range.id);
      this.selected = transition.range.id;
      this.save();
    }
    this.deps.status.show(transition.kind === 'rejected' ? transition.message : 'Range locked');
    this.deps.status.changed();
    return transition;
  }

  async prepareSavedDraft(): Promise<boolean> {
    const draft = this.model?.snapshot.capture;
    const review = this.deps.movie.review;
    const generation = this.deps.movie.sourceGeneration;
    if (!draft || draft.kind !== 'draft') return true;
    const savedStart = draft.start?.kind === 'saved-exact-frame' ? draft.start : null;
    const savedEnd = draft.end?.kind === 'saved-exact-frame' ? draft.end : null;
    if (!savedStart && !savedEnd) return true;
    if (!review?.state().captureEnabled || this.deps.storage.restoring) return false;
    try {
      const identities = await this.indexedIdentities(review, savedStart, savedEnd);
      const current = this.model?.snapshot.capture;
      if (this.deps.movie.review !== review || this.deps.movie.sourceGeneration !== generation || current?.kind !== 'draft'
        || current.start !== draft.start || current.end !== draft.end) return false;
      if (!this.model?.hydrateSavedDraft(identities)) {
        throw new Error('Saved draft frames no longer match this movie. Mark new endpoints before locking.');
      }
      this.deps.status.changed();
      return true;
    } catch (error) {
      this.reportCheckFailure(error, 'Saved draft frames could not be checked.');
      return false;
    }
  }

  async prepareSavedRange(rangeId: CapturedRangeId): Promise<boolean> {
    const range = this.range(rangeId);
    const review = this.deps.movie.review;
    const generation = this.deps.movie.sourceGeneration;
    if (!range || !review?.state().captureEnabled || this.deps.storage.isStale(rangeId)) return false;
    const savedStart = range.start.kind === 'saved-exact-frame' ? range.start : null;
    const savedEnd = range.end.kind === 'saved-exact-frame' ? range.end : null;
    if (!savedStart && !savedEnd) return true;
    try {
      const identities = await this.indexedIdentities(review, savedStart, savedEnd);
      if (this.deps.movie.review !== review || this.deps.movie.sourceGeneration !== generation) return false;
      if (!this.model?.hydrateSavedRange(rangeId, identities)) {
        this.deps.storage.markStale(rangeId);
        throw new Error('Saved frames no longer match this movie. Reopen the original movie.');
      }
      this.deps.storage.forgetRange(rangeId);
      this.deps.status.changed();
      return true;
    } catch (error) {
      this.reportCheckFailure(error, 'Saved frames could not be checked.');
      return false;
    }
  }

  async retryThumbnail(rangeId: CapturedRangeId): Promise<void> {
    if (this.deps.storage.isStale(rangeId)) return;
    const range = this.range(rangeId);
    const review = this.deps.movie.review;
    const generation = this.deps.movie.sourceGeneration;
    if (range && range.start.kind !== 'playback-timestamp' && review?.state().captureEnabled
      && this.captureThumbnails.stateForRange(rangeId).kind === 'missing') {
      const frameIndex = range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex;
      const frame = await review.thumbnailFrame(frameIndex);
      if (this.deps.movie.review !== review || this.deps.movie.sourceGeneration !== generation) return;
      const savedHash = range.start.kind === 'saved-exact-frame' ? range.start.frameInfoHash : range.start.identity.frameInfoHash;
      if (frame.identity.frameInfoHash !== savedHash) return;
      this.captureThumbnails.replaceRange(rangeId, frame);
      return;
    }
    await this.captureThumbnails.retryRange(rangeId);
  }

  selectRange(rangeId: CapturedRangeId): void {
    if (!this.range(rangeId) || this.selected === rangeId) return;
    this.selected = rangeId;
    this.deps.status.advancePreview();
    this.deps.status.changed();
  }

  // Selects without announcing it; the caller publishes as part of a larger step.
  markSelected(rangeId: CapturedRangeId): void { this.selected = rangeId; }

  removeRange(rangeId: CapturedRangeId): boolean {
    if (!this.canRemoveRange(rangeId)) return false;
    if (!this.model?.removeRange(rangeId)) return false;
    this.deps.storage.forgetRange(rangeId);
    this.save();
    this.captureThumbnails.removeRange(rangeId);
    if (this.selected === rangeId) this.selected = null;
    this.deps.status.advancePreview();
    this.events.emit('rangeRemoved', rangeId);
    this.deps.status.changed();
    return true;
  }

  canRemoveRange(rangeId: CapturedRangeId): boolean {
    return this.canRemoveCaptures()
      && this.range(rangeId) !== undefined
      && !this.deps.extraction.revisionBlock(rangeId);
  }

  removeDraft(): boolean {
    if (!this.canRemoveDraft() || !this.model?.discardDraft()) return false;
    this.deps.status.advancePreview();
    this.save();
    this.captureThumbnails.removeDraft();
    this.deps.status.changed();
    return true;
  }

  canRemoveDraft(): boolean {
    const capture = this.model?.snapshot.capture;
    return this.canRemoveCaptures() && capture?.kind === 'draft' && (capture.start !== null || capture.end !== null);
  }

  replaceRangeWithExactEndpoints(rangeId: CapturedRangeId, start: IExactFrameEndpoint, end: IExactFrameEndpoint): CapturedRange | null {
    return this.model?.replaceRangeWithExactEndpoints(rangeId, start, end) ?? null;
  }

  replaceThumbnail(rangeId: CapturedRangeId, frame: FrameReviewDisplayFrame): void {
    this.captureThumbnails.replaceRange(rangeId, frame);
  }

  // Fully extracted ranges leave the saved queue.
  save(): void {
    if (!this.model) return;
    const completed = new Set(this.model.snapshot.ranges
      .filter(range => this.deps.extraction.isCompleted(range.id)).map(range => range.id));
    this.deps.storage.save(this.model, completed);
  }

  captureUnavailable(): RangeCaptureTransition {
    const message = this.deps.storage.hasStaleRanges
      ? 'Open movie to find the original source before capturing.'
      : this.deps.movie.lifecycle === 'opening' ? 'Wait for the movie to finish opening.'
        : this.deps.storage.restoring ? 'Saved captures are still loading.'
        : 'Capture becomes available after exact frame preparation.';
    this.deps.status.show(message);
    this.deps.status.changed();
    return Object.freeze({ kind: 'rejected', message });
  }

  async restore(review: IFrameReviewSession): Promise<void> {
    const { movie, storage, status } = this.deps;
    if (movie.review !== review || !storage.restoring || this.restoreStarted) return;
    const generation = movie.sourceGeneration;
    this.restoreStarted = true;
    try {
      const restored = await storage.attach(review.id);
      if (!restored || this.disposed || movie.review !== review || movie.sourceGeneration !== generation) return;
      this.model = restored;
      for (const range of restored.snapshot.ranges) this.captureThumbnails.markRestoredMissing(range.id);
      void this.restoreThumbnails(review, generation);
      const continuation = restored.continuationEndpoint();
      if (continuation) {
        try {
          await this.deps.capturePositioning?.showFrameAfterCapture(review, continuation);
        } catch (error) {
          this.reportError('Saved captures loaded, but the movie could not be positioned after them.', error);
        }
      }
      if (this.disposed || movie.review !== review || movie.sourceGeneration !== generation) return;
      const savedDraft = restored.snapshot.capture;
      const hasDraft = savedDraft.kind === 'draft' && (savedDraft.start !== null || savedDraft.end !== null);
      const count = restored.snapshot.ranges.length;
      status.show(count > 0
        ? `Restored ${count} saved ranges${hasDraft ? ' and a draft' : ''}.`
        : hasDraft ? 'Restored saved range draft.' : 'Exact capture ready');
      storage.endRestore();
      status.changed();
    } catch (error) {
      if (movie.review !== review || movie.sourceGeneration !== generation) return;
      const message = 'Saved captures could not be loaded. The stored file was kept for recovery.';
      status.show(message);
      storage.endRestore();
      this.reportError(message, error);
      status.changed();
    }
  }

  // Saves one last time and stops saving, before the session cancels extraction during shutdown.
  stopSaving(): void {
    if (this.disposed) return;
    this.save();
    this.disposed = true;
    this.deps.storage.invalidate();
  }

  async dispose(): Promise<void> {
    this.stopSaving();
    await this.captureThumbnails.dispose();
  }

  private canRemoveCaptures(): boolean {
    const { storage, movie } = this.deps;
    return storage.canRemoveCaptures(movie.lifecycle === 'open') && !movie.opening && !storage.loading;
  }

  private endpointFromCapture(capture: IFrameReviewDisplayedCapture | null): CaptureEndpoint | null {
    const { movie } = this.deps;
    if (!capture || !this.model || !movie.reviewState?.captureEnabled
      || capture.sourceGeneration !== movie.reviewState.sourceGeneration) return null;
    return capture.point.kind === 'exact-frame'
      ? CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, movie.sourceGeneration)
      : CaptureEndpointValue.timestamp(capture.point.timestampUs, movie.sourceGeneration);
  }

  private async indexedIdentities(
    review: IFrameReviewSession,
    savedStart: ISavedExactFrameEndpoint | null,
    savedEnd: ISavedExactFrameEndpoint | null,
  ) {
    const [start, end] = await Promise.all([
      savedStart ? review.frameIdentity(savedStart.frameIndex) : Promise.resolve(undefined),
      savedEnd ? review.frameIdentity(savedEnd.frameIndex) : Promise.resolve(undefined),
    ]);
    return { start, end };
  }

  private async restoreThumbnails(review: IFrameReviewSession, generation: number): Promise<void> {
    const { movie } = this.deps;
    const current = () => !this.disposed && movie.review === review && movie.sourceGeneration === generation;
    let failures = 0;
    const draft = this.model?.snapshot.capture;
    if (draft?.kind === 'draft' && draft.start?.kind === 'saved-exact-frame') {
      try {
        const frame = await review.thumbnailFrame(draft.start.frameIndex);
        const latest = this.model?.snapshot.capture;
        if (!current()) return;
        if (latest?.kind === 'draft' && latest.start === draft.start
          && frame.identity.frameInfoHash === draft.start.frameInfoHash) this.captureThumbnails.replaceDraft(frame);
      } catch {
        failures += 1;
      }
    }
    for (const range of this.model?.snapshot.ranges ?? []) {
      if (!current()) return;
      if (range.start.kind !== 'saved-exact-frame') continue;
      try {
        const frame = await review.thumbnailFrame(range.start.frameIndex);
        if (!current()) return;
        if (frame.identity.frameInfoHash === range.start.frameInfoHash) this.captureThumbnails.replaceRange(range.id, frame);
      } catch {
        failures += 1;
      }
    }
    if (failures > 0 && movie.review === review && movie.sourceGeneration === generation) {
      this.reportError(`${failures} saved start thumbnails could not be recreated. Retry them from Clips.`);
    }
  }

  private reportCheckFailure(error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message : fallback;
    this.deps.status.show(message);
    this.reportError(message, error);
    this.deps.status.changed();
  }

  private reportError(message: string, error?: unknown): void {
    this.deps.reporter?.failure(message);
    if (error !== undefined) void this.deps.diagnostics?.logRuntimeError(message, error);
  }
}
