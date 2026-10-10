import type {
  IFrameReviewService,
  IFrameReviewSession,
  IFrameReviewSourceSelection,
} from '../frame-review/frame-review-api.js';
import type { IFrameReviewState } from '../frame-review/model/frame-review-state.js';
import { CaptureEndpointValue, type CaptureEndpoint, type ISavedExactFrameEndpoint } from '../domain/capture-endpoint.js';
import { CapturedRangeValue, type CapturedRange, type CapturedRangeId } from '../domain/captured-range.js';
import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type { IClipExtractionService } from '../frame-review/clip-extraction-api.js';
import { ClipExtractor } from '../business-logic/clip-extractor.js';
import {
  RangeCaptureModel,
  type IRangeCaptureSnapshot,
  type RangeCaptureTransition,
} from '../domain/range-capture-model.js';
import type { IFrameReviewDisplayedCapture } from '../ui/frame-review-player-control.js';
import type { IThumbnailCacheService } from './thumbnail-cache-service.js';
import {
  RefineGifSession,
  type IRefineGifCommitRequest,
  type IRefineGifSessionOwner,
  type IRefineGifSessionSnapshot,
  type RefineGifCommitResult,
} from './refine-gif-session.js';
import { ClipExtractionWorkflow, type ClipExtractionEntryState, type IExtractionBatchProgress } from './clip-extraction-workflow.js';
import type { ActivityInput } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import { ExtractionDestinationSession, type IExtractionDestination, type IExtractionDestinationPublication } from './extraction-destination-session.js';
import { GifCaptureThumbnailSession, type GifThumbnailState } from './gif-capture-thumbnail-session.js';
import type { IClipCapturesStoreService } from './clip-captures-store-service.js';
import type { ISourceFingerprint } from '../frame-review/model/source-fingerprint.js';
import { SourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
import { SavedCaptureQueuePersistence } from './saved-capture-queue-persistence.js';

export type { IThumbnailCacheService } from './thumbnail-cache-service.js';
export type { GifThumbnailState } from './gif-capture-thumbnail-session.js';

export type GifRangeView = CapturedRange & Readonly<{
  thumbnail: GifThumbnailState;
  extraction?: ClipExtractionEntryState;
  validation?: 'stale';
}>;

export interface IGifPreviewTarget {
  readonly kind: 'draft' | 'locked' | 'refinement';
  readonly rangeId: CapturedRangeId | null;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly sourceGeneration: number;
  readonly revision: number;
}

export interface IGifExtractionSessionSnapshot {
  readonly lifecycle: 'empty' | 'choosing' | 'opening' | 'open' | 'failed' | 'disposed';
  readonly source: IFrameReviewSourceSelection | null;
  readonly reviewState: IFrameReviewState | null;
  readonly capture: IRangeCaptureSnapshot | null;
  readonly draftThumbnail: GifThumbnailState;
  readonly ranges: readonly GifRangeView[];
  readonly selectedRangeId: CapturedRangeId | null;
  readonly refinement: IRefineGifSessionSnapshot | null;
  readonly extractionAvailable?: boolean;
  readonly extractionBatch?: IExtractionBatchProgress | null;
  readonly captureAvailable?: boolean;
  readonly capturesLoading: boolean;
  readonly message: string | null;
  readonly previewTarget: IGifPreviewTarget | null;
  readonly previewRevision: number;
}

export type OpenMovieResult = 'opened' | 'cancelled' | 'failed' | 'busy';
export type BeginRefinementResult =
  | Readonly<{ kind: 'started'; session: RefineGifSession }>
  | Readonly<{ kind: 'rejected'; message: string }>;

// Awaited: extraction continues only after the open folder has reacted to the new clip.
export interface IExtractionPublicationListener {
  onFolderContentsPublished(folderPath: string): Promise<void> | void;
}

// Awaited: a failure to position the player is reported by the session.
export interface ICapturePositioning {
  showFrameAfterCapture(review: IFrameReviewSession, endpoint: CaptureEndpoint): Promise<void>;
}

type GifExtractionSessionOptions = {
  readonly previewBounds?: Readonly<{ maxWidth: number; maxHeight: number }>;
  readonly reporter?: Pick<ActivityReporter, 'progress' | 'success' | 'failure'>;
  readonly activityLog?: { log(entry: ActivityInput): unknown };
  readonly diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>;
  readonly capturePositioning?: ICapturePositioning;
  readonly extractionService?: IClipExtractionService;
  readonly captureStore?: IClipCapturesStoreService;
  readonly publications?: IExtractionPublicationListener;
  readonly destination?: IExtractionDestination;
};

export class GifExtractionSession implements IRefineGifSessionOwner {
  private readonly listeners = new Set<(snapshot: IGifExtractionSessionSnapshot) => void>();
  private readonly previewBounds: Readonly<{ maxWidth: number; maxHeight: number }>;
  private destination: GifExtractionSessionOptions['destination'];
  private readonly captureThumbnails: GifCaptureThumbnailSession;
  private lifecycle: IGifExtractionSessionSnapshot['lifecycle'] = 'empty';
  private source: IFrameReviewSourceSelection | null = null;
  private review: IFrameReviewSession | null = null;
  private unsubscribeReview: (() => void) | null = null;
  private reviewState: IFrameReviewState | null = null;
  private rangeModel: RangeCaptureModel | null = null;
  private sourceGeneration = 0;
  private message: string | null = null;
  private selectedRangeId: CapturedRangeId | null = null;
  private activeRefinement: RefineGifSession | null = null;
  private extractionWorkflow: ClipExtractionWorkflow | null = null;
  private disposed = false;
  private opening = false;
  private savedCaptureQueue: SavedCaptureQueuePersistence | null = null;
  private restoringCaptures = false;
  private capturesLoading = false;
  private restoreStarted = false;
  private readonly notifiedProvenanceWarnings = new Set<string>();
  private previewRevision = 0;
  private lastRefinementRevision: number | null = null;

  constructor(
    private readonly frameReview: IFrameReviewService,
    thumbnails: IThumbnailCacheService,
    private readonly options: GifExtractionSessionOptions = {},
  ) {
    this.previewBounds = options.previewBounds ?? Object.freeze({ maxWidth: 1280, maxHeight: 720 });
    this.destination = options.destination;
    this.captureThumbnails = new GifCaptureThumbnailSession(thumbnails, {
      onChanged: () => this.publish(),
      onError: (message, error) => this.reportError(message, error),
    });
  }

  private reportProgress(message: string): void { this.options.reporter?.progress(message); }

  private reportSuccess(message: string): void { this.options.reporter?.success(message); }

  private reportWarning(message: string): void { this.options.reporter?.success(message, 5000); }

  private reportError(message: string, error?: unknown): void {
    this.options.reporter?.failure(message);
    if (error !== undefined) void this.options.diagnostics?.logRuntimeError(message, error);
  }

  private recordActivity(entry: ActivityInput): void { this.options.activityLog?.log(entry); }

  get reviewSession(): IFrameReviewSession | null { return this.review; }
  get refinementSession(): RefineGifSession | null { return this.activeRefinement; }

  setExtractionDestination(destination: IExtractionDestination): void {
    if (this.extractionWorkflow?.batchProgress) throw new Error('Wait for the current extraction to finish.');
    this.destination = destination;
  }

  get snapshot(): IGifExtractionSessionSnapshot {
    const capture = this.rangeModel?.snapshot ?? null;
    const ranges = capture?.ranges.map(range => Object.freeze({
      ...range,
      thumbnail: this.captureThumbnails.stateForRange(range.id),
      extraction: this.extractionWorkflow?.state(range.id) ?? Object.freeze({ kind: 'pending' as const }),
      validation: this.savedCaptureQueue?.isStale(range.id) ? 'stale' as const : undefined,
    })) ?? [];
    return Object.freeze({
      lifecycle: this.lifecycle,
      source: this.source,
      reviewState: this.reviewState,
      capture,
      draftThumbnail: this.captureThumbnails.draftState,
      ranges: Object.freeze(ranges),
      selectedRangeId: this.selectedRangeId,
      refinement: this.activeRefinement?.snapshot ?? null,
      extractionAvailable: this.extractionWorkflow !== null,
      extractionBatch: this.extractionWorkflow?.batchProgress ?? null,
      captureAvailable: this.lifecycle === 'open' && this.reviewState?.captureEnabled === true
        && !this.restoringCaptures && !this.capturesLoading,
      capturesLoading: this.capturesLoading,
      message: this.message,
      previewTarget: this.previewTarget(),
      previewRevision: this.previewRevision,
    });
  }

  subscribe(listener: (snapshot: IGifExtractionSessionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async openMovie(): Promise<OpenMovieResult> {
    if (this.disposed || this.opening) return 'busy';
    this.opening = true;
    this.lifecycle = 'choosing';
    this.message = 'Choose a movie';
    this.publish();
    try {
      const selected = await this.frameReview.chooseSource();
      if (!selected) {
        this.restoreOpenLifecycle();
        return 'cancelled';
      }
      this.lifecycle = 'opening';
      this.message = `Opening ${selected.name}`;
      this.reportProgress(this.message);
      this.publish();
      const candidate = await this.frameReview.open({ sourceHandle: selected.sourceHandle, previewBounds: this.previewBounds });
      await this.replaceSource(selected, candidate);
      this.reportSuccess(`Opened ${selected.name}.`);
      return 'opened';
    } catch (error) {
      this.capturesLoading = false;
      this.lifecycle = this.source ? 'open' : 'failed';
      this.message = error instanceof Error ? error.message : 'The movie could not be opened.';
      this.reportError('The movie could not be opened.', error);
      this.publish();
      return 'failed';
    } finally {
      this.opening = false;
    }
  }

  async openCollectionSource(selected: IFrameReviewSourceSelection): Promise<void> {
    if (this.disposed || this.opening || this.extractionWorkflow?.batchProgress) {
      throw new Error('Wait for the current movie or extraction to finish.');
    }
    this.opening = true;
    this.lifecycle = 'opening';
    this.message = `Opening ${selected.name}`;
    this.publish();
    try {
      const candidate = await this.frameReview.open({ sourceHandle: selected.sourceHandle, previewBounds: this.previewBounds });
      await this.replaceSource(selected, candidate);
    } finally {
      this.opening = false;
      if (this.lifecycle === 'opening') this.restoreOpenLifecycle();
    }
  }

  async importCollectionRange(range: Readonly<{
    start: Readonly<{ frameIndex: number; frameInfoHash: string }>;
    end: Readonly<{ frameIndex: number; frameInfoHash: string }>;
  }>): Promise<BeginRefinementResult> {
    const review = this.review;
    const generation = this.sourceGeneration;
    if (!review || this.options.captureStore) return this.rejectRefinement('Collection refinement is unavailable.');
    await new Promise<void>((resolve, reject) => {
      const current = review.state();
      if (current.captureEnabled) { resolve(); return; }
      if (current.phase === 'failed' || current.phase === 'closed') {
        reject(new Error(current.message ?? 'Exact movie review could not be prepared.'));
        return;
      }
      const unsubscribe = review.subscribe(event => {
        if (event.type !== 'state') return;
        if (event.state.captureEnabled || event.state.phase === 'failed' || event.state.phase === 'closed') {
          unsubscribe();
          if (event.state.captureEnabled) resolve();
          else reject(new Error(event.state.message ?? 'Exact movie review could not be prepared.'));
        }
      });
    });
    if (this.disposed || this.review !== review || this.sourceGeneration !== generation) {
      return this.rejectRefinement('The source changed while opening the clip.');
    }
    const [start, end] = await Promise.all([
      review.frameIdentity(range.start.frameIndex),
      review.frameIdentity(range.end.frameIndex),
    ]);
    if (start.frameInfoHash !== range.start.frameInfoHash || end.frameInfoHash !== range.end.frameInfoHash) {
      return this.rejectRefinement('The source range no longer matches this clip.');
    }
    const model = RangeCaptureModel.fromSavedData({
      schemaVersion: 1,
      nextRangeSequence: 2,
      ranges: [{ id: 'range-1',
        start: { kind: 'exact-frame', frameIndex: start.frameIndex, frameInfoHash: start.frameInfoHash,
          reviewTimeUs: SourceFrameIdentity.timeUs(start).toString() },
        end: { kind: 'exact-frame', frameIndex: end.frameIndex, frameInfoHash: end.frameInfoHash,
          reviewTimeUs: SourceFrameIdentity.timeUs(end).toString() },
      }],
    }, generation);
    const rangeId = CapturedRangeValue.id(1);
    model.hydrateSavedRange(rangeId, { start, end });
    this.rangeModel = model;
    return this.beginRefinement(rangeId);
  }

  markStart(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.restoringCaptures || this.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !capture || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markStart(endpoint);
    if (transition.kind === 'marked-start') this.previewRevision += 1;
    if (transition.kind === 'marked-start') this.captureThumbnails.replaceDraft(capture.thumbnail);
    if (transition.kind === 'marked-start') this.persistQueue();
    this.message = transition.kind === 'rejected' ? transition.message : 'Start marked';
    this.publish();
    return transition;
  }

  markEnd(capture: IFrameReviewDisplayedCapture | null): RangeCaptureTransition {
    if (this.restoringCaptures || this.lifecycle !== 'open') return this.captureUnavailable();
    const endpoint = this.endpointFromCapture(capture);
    if (!endpoint || !this.rangeModel) return this.captureUnavailable();
    const transition = this.rangeModel.markEnd(endpoint);
    if (transition.kind === 'marked-end') this.previewRevision += 1;
    if (transition.kind === 'marked-end') this.persistQueue();
    this.message = transition.kind === 'rejected' ? transition.message : 'End marked';
    this.publish();
    return transition;
  }

  lockRange(): RangeCaptureTransition {
    if (!this.rangeModel || this.restoringCaptures || this.lifecycle !== 'open') return this.captureUnavailable();
    const transition = this.rangeModel.lockRange();
    if (transition.kind === 'locked') this.previewRevision += 1;
    if (transition.kind === 'locked') this.captureThumbnails.commitDraftToRange(transition.range.id);
    if (transition.kind === 'locked') this.selectedRangeId = transition.range.id;
    if (transition.kind === 'locked') this.persistQueue();
    this.message = transition.kind === 'rejected' ? transition.message : 'Range locked';
    this.publish();
    return transition;
  }

  async prepareSavedDraft(): Promise<boolean> {
    const draft = this.rangeModel?.snapshot.capture;
    const review = this.review;
    const generation = this.sourceGeneration;
    if (!draft || draft.kind !== 'draft') return true;
    const savedStart = draft.start?.kind === 'saved-exact-frame' ? draft.start : null;
    const savedEnd = draft.end?.kind === 'saved-exact-frame' ? draft.end : null;
    if (!savedStart && !savedEnd) return true;
    if (!review?.state().captureEnabled || this.restoringCaptures) return false;
    try {
      const identities = await this.indexedIdentitiesForSavedEndpoints(review, savedStart, savedEnd);
      const current = this.rangeModel?.snapshot.capture;
      if (this.review !== review || this.sourceGeneration !== generation || current?.kind !== 'draft'
        || current.start !== draft.start || current.end !== draft.end) return false;
      if (!this.rangeModel?.hydrateSavedDraft(identities)) {
        throw new Error('Saved draft frames no longer match this movie. Mark new endpoints before locking.');
      }
      this.publish();
      return true;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Saved draft frames could not be checked.';
      this.reportError(this.message, error);
      this.publish();
      return false;
    }
  }

  async retryThumbnail(rangeId: CapturedRangeId): Promise<void> {
    if (this.savedCaptureQueue?.isStale(rangeId)) return;
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === rangeId);
    const review = this.review;
    const generation = this.sourceGeneration;
    if (range && range.start.kind !== 'playback-timestamp' && review?.state().captureEnabled
      && this.captureThumbnails.stateForRange(rangeId).kind === 'missing') {
      const frameIndex = range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex;
      const frame = await review.thumbnailFrame(frameIndex);
      if (this.review !== review || this.sourceGeneration !== generation) return;
      const savedHash = range.start.kind === 'saved-exact-frame' ? range.start.frameInfoHash : range.start.identity.frameInfoHash;
      if (frame.identity.frameInfoHash !== savedHash) return;
      this.captureThumbnails.replaceRange(rangeId, frame);
      return;
    }
    await this.captureThumbnails.retryRange(rangeId);
  }

  selectRange(rangeId: CapturedRangeId): void {
    if (!this.rangeModel?.snapshot.ranges.some(range => range.id === rangeId)) return;
    if (this.selectedRangeId === rangeId) return;
    this.selectedRangeId = rangeId;
    this.previewRevision += 1;
    this.publish();
  }

  canExtractRange(rangeId: CapturedRangeId): boolean {
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (this.destination && this.activeRefinement?.snapshot.rangeId === rangeId
      && this.activeRefinement.snapshot.status !== 'committed') return false;
    if (!range || this.lifecycle !== 'open' || this.savedCaptureQueue?.isStale(rangeId)
      || (range.kind !== 'ready-to-extract' && range.kind !== 'saved-exact-range')
      || !this.extractionWorkflow || this.extractionWorkflow.batchProgress) return false;
    const state = this.extractionWorkflow.state(rangeId);
    return state.kind === 'pending' || state.kind === 'failed' || state.kind === 'cancelled';
  }

  async extractRange(rangeId: CapturedRangeId): Promise<void> {
    let range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range || !this.canExtractRange(rangeId)) return;
    if (range.kind === 'saved-exact-range') {
      if (!await this.prepareSavedRange(rangeId)) return;
      range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    }
    if (!range || range.kind !== 'ready-to-extract') return;
    await this.runExtraction(() => this.extractionWorkflow!.extractOne({
      sourceHandle: this.source!.sourceHandle,
      reviewSessionId: this.review?.id,
      sourceGeneration: this.sourceGeneration,
      range,
      movieName: this.source!.name,
    }));
  }

  async extractAll(): Promise<void> {
    for (const range of this.rangeModel?.snapshot.ranges ?? []) {
      if (range.kind === 'saved-exact-range' && this.canExtractRange(range.id)) await this.prepareSavedRange(range.id);
    }
    const ranges = (this.rangeModel?.snapshot.ranges ?? []).filter(
      (range): range is IReadyToExtractRange => range.kind === 'ready-to-extract' && this.canExtractRange(range.id));
    if (ranges.length === 0 || !this.extractionWorkflow || !this.source) return;
    await this.runExtraction(() => this.extractionWorkflow!.extractAll({
      sourceHandle: this.source!.sourceHandle,
      reviewSessionId: this.review?.id,
      sourceGeneration: this.sourceGeneration,
      ranges,
      movieName: this.source!.name,
    }));
  }

  async retryExtractionPublication(rangeId: CapturedRangeId): Promise<void> {
    if (this.extractionWorkflow?.state(rangeId).kind !== 'publication-failed') return;
    await this.runExtraction(() => this.extractionWorkflow!.retryPublication(rangeId));
  }

  async cancelExtraction(): Promise<void> {
    await this.extractionWorkflow?.cancel();
  }

  beginRefinement(rangeId: CapturedRangeId): BeginRefinementResult {
    if (this.lifecycle !== 'open') return this.rejectRefinement('Wait for the movie to finish opening.');
    const range = this.rangeModel?.snapshot.ranges.find(candidate => candidate.id === rangeId);
    if (!range) {
      return this.rejectRefinement('Choose a captured range to refine.');
    }
    if (this.savedCaptureQueue?.isStale(rangeId)) {
      return this.rejectRefinement('Saved frames no longer match this movie. Remove the range or reopen the original movie.');
    }
    if (range.kind === 'saved-exact-range') {
      return this.rejectRefinement('Check the saved range against the movie before refining it.');
    }
    if (!this.reviewState?.captureEnabled || range.sourceGeneration !== this.sourceGeneration) {
      return this.rejectRefinement('Exact frame review is not ready for this range.');
    }
    this.activeRefinement = new RefineGifSession(this, range);
    this.lastRefinementRevision = 0;
    this.previewRevision += 1;
    this.selectedRangeId = rangeId;
    this.message = range.kind === 'needs-exact-frames'
      ? 'Refine the approximate endpoint against exact frames.'
      : 'Review and adjust exact frames, then lock the range.';
    this.publish();
    return Object.freeze({ kind: 'started', session: this.activeRefinement });
  }

  async prepareSavedRange(rangeId: CapturedRangeId): Promise<boolean> {
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === rangeId);
    const review = this.review;
    const generation = this.sourceGeneration;
    if (!range || !review?.state().captureEnabled || this.savedCaptureQueue?.isStale(rangeId)) return false;
    const savedStart = range.start.kind === 'saved-exact-frame' ? range.start : null;
    const savedEnd = range.end.kind === 'saved-exact-frame' ? range.end : null;
    if (!savedStart && !savedEnd) return true;
    try {
      const identities = await this.indexedIdentitiesForSavedEndpoints(review, savedStart, savedEnd);
      if (this.review !== review || this.sourceGeneration !== generation) return false;
      const hydrated = this.rangeModel?.hydrateSavedRange(rangeId, identities);
      if (!hydrated) {
        this.savedCaptureQueue?.markStale(rangeId);
        throw new Error('Saved frames no longer match this movie. Reopen the original movie.');
      }
      this.savedCaptureQueue?.forgetRange(rangeId);
      this.publish();
      return true;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Saved frames could not be checked.';
      this.reportError(this.message, error);
      this.publish();
      return false;
    }
  }

  abandonRefinement(): CapturedRangeId | null {
    const rangeId = this.activeRefinement?.snapshot.rangeId ?? null;
    this.activeRefinement = null;
    this.lastRefinementRevision = null;
    this.previewRevision += 1;
    this.message = null;
    this.publish();
    return rangeId;
  }

  removeRange(rangeId: CapturedRangeId): boolean {
    if (!this.canRemoveRange(rangeId)) return false;
    const removed = this.rangeModel?.removeRange(rangeId) ?? null;
    if (!removed) return false;
    this.savedCaptureQueue?.forgetRange(rangeId);
    this.persistQueue();
    this.captureThumbnails.removeRange(rangeId);
    if (this.selectedRangeId === rangeId) this.selectedRangeId = null;
    this.previewRevision += 1;
    if (this.activeRefinement?.snapshot.rangeId === rangeId) {
      this.activeRefinement.invalidate('The range was removed before this refinement was locked.');
      this.activeRefinement = null;
    }
    this.publish();
    return true;
  }

  canRemoveRange(rangeId: CapturedRangeId): boolean {
    return (this.savedCaptureQueue?.hasMovieReference === true || (!this.options.captureStore && this.lifecycle === 'open'))
      && !this.opening && !this.capturesLoading
      && this.rangeModel?.snapshot.ranges.some(range => range.id === rangeId) === true
      && !this.extractionWorkflow?.revisionBlock(rangeId);
  }

  removeDraft(): boolean {
    if (!this.canRemoveDraft() || !this.rangeModel?.discardDraft()) return false;
    this.previewRevision += 1;
    this.persistQueue();
    this.captureThumbnails.removeDraft();
    this.publish();
    return true;
  }

  canRemoveDraft(): boolean {
    const capture = this.rangeModel?.snapshot.capture;
    return (this.savedCaptureQueue?.hasMovieReference === true || (!this.options.captureStore && this.lifecycle === 'open'))
      && !this.opening && !this.capturesLoading
      && capture?.kind === 'draft' && (capture.start !== null || capture.end !== null);
  }

  currentSourceGeneration(): number | null {
    return this.rangeModel ? this.sourceGeneration : null;
  }

  exactEndpointFromDisplayedCapture(capture: IFrameReviewDisplayedCapture | null) {
    if (!capture || capture.point.kind !== 'exact-frame' || !this.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.reviewState.sourceGeneration || !this.rangeModel) return null;
    return CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.sourceGeneration);
  }

  commitRefinement(request: IRefineGifCommitRequest): RefineGifCommitResult {
    if (this.activeRefinement !== request.session) {
      return Object.freeze({ kind: 'rejected', message: 'This refinement is no longer active.' });
    }
    if (request.sourceGeneration !== this.sourceGeneration) {
      return Object.freeze({ kind: 'rejected', message: 'The source changed before this refinement was locked.' });
    }
    const current = this.rangeModel?.snapshot.ranges.find(range => range.id === request.rangeId);
    if (!current) {
      return Object.freeze({ kind: 'rejected', message: 'The range was removed before this refinement was locked.' });
    }
    if (current !== request.session.snapshot.original) {
      return Object.freeze({ kind: 'rejected', message: 'This range changed before the refinement was locked.' });
    }
    const changed = !CapturedRangeValue.hasExactFrames(current, request.start, request.end);
    const block = changed ? this.extractionWorkflow?.revisionBlock(request.rangeId) : null;
    if (block) return Object.freeze({ kind: 'rejected', message: block });
    if (!changed && current.kind === 'ready-to-extract') {
      this.selectedRangeId = request.rangeId;
      this.message = 'Range unchanged; previous extraction status is preserved.';
      return Object.freeze({ kind: 'committed', range: current, message: this.message });
    }
    const previousExtraction = this.extractionWorkflow?.state(request.rangeId);
    const replacement = this.rangeModel?.replaceRangeWithExactEndpoints(request.rangeId, request.start, request.end);
    if (!replacement || replacement.kind !== 'ready-to-extract') {
      return Object.freeze({ kind: 'rejected', message: 'The exact range could not be locked.' });
    }
    this.extractionWorkflow?.resetForRevision(request.rangeId);
    this.persistQueue();
    if (request.startThumbnail && (current.start.kind !== 'exact-frame'
      || current.start.identity.frameIndex !== request.start.identity.frameIndex)) {
      this.captureThumbnails.replaceRange(request.rangeId, request.startThumbnail);
    }
    this.selectedRangeId = request.rangeId;
    this.message = previousExtraction?.kind === 'completed'
      ? 'Revised range locked. The earlier clip remains saved; extract again to create a new clip.'
      : 'Exact range locked';
    return Object.freeze({ kind: 'committed', range: replacement, message: this.message });
  }

  nextInexactRangeId(afterRangeId: CapturedRangeId): CapturedRangeId | null {
    const ranges = this.rangeModel?.snapshot.ranges ?? [];
    const currentIndex = ranges.findIndex(range => range.id === afterRangeId);
    if (currentIndex < 0) return null;
    return ranges.slice(currentIndex + 1).find(range => range.kind === 'needs-exact-frames')?.id ?? null;
  }

  refinementChanged(session: RefineGifSession): void {
    if (this.activeRefinement !== session) return;
    const current = session.snapshot.stagedRevision;
    if (current !== this.lastRefinementRevision || session.snapshot.status !== 'editing') {
      this.lastRefinementRevision = current;
      this.previewRevision += 1;
    }
    this.publish();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.persistQueue();
    this.disposed = true;
    this.savedCaptureQueue?.invalidate();
    this.lifecycle = 'disposed';
    this.listeners.clear();
    this.unsubscribeReview?.();
    this.unsubscribeReview = null;
    this.activeRefinement = null;
    await this.extractionWorkflow?.cancel();
    this.extractionWorkflow = null;
    const review = this.review;
    this.review = null;
    await Promise.allSettled([review?.dispose(), this.captureThumbnails.dispose()]);
  }

  private async replaceSource(
    selected: IFrameReviewSourceSelection,
    candidate: IFrameReviewSession,
    expectedFingerprint?: ISourceFingerprint,
  ): Promise<void> {
    this.persistQueue();
    const previous = this.review;
    await this.extractionWorkflow?.cancel();
    this.unsubscribeReview?.();
    this.unsubscribeReview = null;
    this.activeRefinement?.invalidate('The source changed before this refinement was locked.');
    await this.captureThumbnails.clear();
    this.savedCaptureQueue?.invalidate();
    this.sourceGeneration += 1;
    this.previewRevision += 1;
    this.source = selected;
    this.review = candidate;
    this.reviewState = candidate.state();
    this.rangeModel = new RangeCaptureModel(this.sourceGeneration);
    this.savedCaptureQueue = this.options.captureStore
      ? this.createSavedCaptureQueue(this.options.captureStore) : null;
    this.notifiedProvenanceWarnings.clear();
    this.restoringCaptures = !!this.options.captureStore;
    this.capturesLoading = !!this.options.captureStore;
    if (this.reviewState.phase === 'failed' || this.reviewState.phase === 'closed') {
      this.restoringCaptures = false;
      this.capturesLoading = false;
    }
    this.restoreStarted = false;
    this.selectedRangeId = null;
    this.activeRefinement = null;
    this.lastRefinementRevision = null;
    this.extractionWorkflow = this.options.extractionService
      ? new ClipExtractionWorkflow(
        new ClipExtractor(this.options.extractionService),
        new ExtractionDestinationSession(this.options.extractionService, {
          destination: this.destination,
          onPublished: publication => this.options.publications?.onFolderContentsPublished(publication.folderPath),
          onPublishError: error => this.reportError(
            'The clip was saved, but the Collection view could not refresh.',
            error,
          ),
        }),
        () => { this.persistQueue(); this.publish(); },
        event => {
          const sourceField = { label: 'Source movie', value: selected.name };
          if (event.kind === 'batch-started') {
            this.recordActivity({ kind: 'information',
              message: `Extraction started for ${event.total} clip${event.total === 1 ? '' : 's'}.`,
              fields: [sourceField] });
          } else if (event.kind === 'clip-extracted') {
            this.recordActivity({ kind: 'information',
              message: `Extracted ${event.filename} in ${event.durationMs} ms.`,
              fields: [{ label: 'Clip', value: event.filename },
                { label: 'Destination folder', value: event.folderPath }, sourceField] });
          } else {
            const outcome = event.cancelled ? 'cancelled' : 'finished';
            this.recordActivity({ kind: 'information',
              message: `Extraction ${outcome}: ${event.extracted} of ${event.total} clip${event.total === 1 ? '' : 's'} extracted.`,
              fields: [sourceField] });
          }
        },
      )
      : null;
    this.lifecycle = 'open';
    this.message = this.reviewState.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames';
    this.subscribeToReview(candidate, expectedFingerprint);
    this.publish();
    if (previous) await previous.dispose();
  }

  private subscribeToReview(candidate: IFrameReviewSession, expectedFingerprint?: ISourceFingerprint): void {
    let exactReadinessAnnounced = false;
    this.unsubscribeReview = candidate.subscribe(event => {
      if (this.disposed || this.review !== candidate) return;
      if (event.type === 'state') {
        const becameReady = !this.reviewState?.captureEnabled && event.state.captureEnabled;
        this.reviewState = event.state;
        if (event.state.phase === 'failed' || event.state.phase === 'closed') {
          this.restoringCaptures = false;
          this.capturesLoading = false;
        }
        this.message = event.state.captureEnabled ? 'Exact capture ready' : event.state.message;
        const preparationMessage = this.preparationProgressMessage(event.state);
        if (preparationMessage) this.reportProgress(preparationMessage);
        if (becameReady && !exactReadinessAnnounced) {
          exactReadinessAnnounced = true;
          this.announceExactReadiness(event.state);
        }
        if (becameReady) void this.restoreCaptures(candidate, expectedFingerprint);
        this.publish();
      } else if (event.type === 'error') {
        this.reportError(event.message);
      }
    });
    const currentState = this.reviewState;
    if (currentState?.captureEnabled && !exactReadinessAnnounced) {
      exactReadinessAnnounced = true;
      this.announceExactReadiness(currentState);
    }
    if (currentState?.captureEnabled) void this.restoreCaptures(candidate, expectedFingerprint);
  }

  private async indexedIdentitiesForSavedEndpoints(
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

  private endpointFromCapture(capture: IFrameReviewDisplayedCapture | null): CaptureEndpoint | null {
    if (!capture || !this.rangeModel || !this.reviewState?.captureEnabled
      || capture.sourceGeneration !== this.reviewState.sourceGeneration) return null;
    return capture.point.kind === 'exact-frame'
      ? CaptureEndpointValue.exact(capture.point.identity, capture.positionUs, this.sourceGeneration)
      : CaptureEndpointValue.timestamp(capture.point.timestampUs, this.sourceGeneration);
  }

  private preparationProgressMessage(state: IFrameReviewState): string | null {
    if (!this.source) return null;
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
    return `${action} ${this.source.name}${progress}.`;
  }

  private announceExactReadiness(state: IFrameReviewState): void {
    if (!this.source) return;
    this.reportSuccess(state.preparedReview?.cacheHit
      ? `Reused the prepared review cache for ${this.source.name}.`
      : `Exact capture is ready for ${this.source.name}.`);
  }

  private async runExtraction(operation: () => Promise<void>): Promise<void> {
    this.message = 'Extracting exact range';
    this.reportProgress(this.message);
    this.publish();
    try {
      await operation();
      const failed = (this.rangeModel?.snapshot.ranges ?? []).some(range => {
        const state = this.extractionWorkflow?.state(range.id);
        return state?.kind === 'failed' || state?.kind === 'publication-failed';
      });
      const cancelled = this.extractionWorkflow?.wasCancelled === true;
      this.message = failed ? 'Some clips need attention' : cancelled ? 'Extraction cancelled' : 'Extraction complete';
      if (failed) this.reportError('Some clips could not be completed. Retry them from Clips.');
      else if (cancelled) this.reportProgress('Extraction stopped. Completed clips were saved.');
      else this.reportSuccess(`Exact clips were added to ${this.destination?.kind === 'collection'
        ? this.destination.collectionFilename : this.destination?.folderPath ?? 'extraction-tmp'}.`);
      for (const range of this.rangeModel?.snapshot.ranges ?? []) {
        const state = this.extractionWorkflow?.state(range.id);
        if (state?.kind !== 'completed' || !state.media.warning) continue;
        const warningId = `${range.id}\n${state.media.filename}`;
        if (this.notifiedProvenanceWarnings.has(warningId)) continue;
        this.notifiedProvenanceWarnings.add(warningId);
        this.reportWarning(state.media.warning);
      }
      this.persistQueue();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Extraction could not start.';
      this.reportError(this.message, error);
    }
    this.publish();
  }

  private async restoreCaptures(review: IFrameReviewSession, expectedFingerprint?: ISourceFingerprint): Promise<void> {
    const savedCaptureQueue = this.savedCaptureQueue;
    if (!savedCaptureQueue || this.review !== review || !this.restoringCaptures || this.restoreStarted) return;
    const generation = this.sourceGeneration;
    this.restoreStarted = true;
    try {
      const attached = await savedCaptureQueue.attach(review.id, expectedFingerprint);
      if (!attached || this.disposed || this.review !== review || this.sourceGeneration !== generation
        || this.savedCaptureQueue !== savedCaptureQueue) return;
      if (attached.kind === 'stale') {
        if (attached.model) {
          const restoredModel = attached.model;
          this.rangeModel = restoredModel;
          for (const range of restoredModel.snapshot.ranges) {
            this.captureThumbnails.markRestoredMissing(range.id);
          }
        }
        this.message = 'The saved movie changed. Use Open movie to locate the original captures.';
        this.restoringCaptures = true;
        this.capturesLoading = false;
        this.reportError(this.message);
        this.publish();
        return;
      }
      this.rangeModel = attached.model;
      for (const range of this.rangeModel.snapshot.ranges) this.captureThumbnails.markRestoredMissing(range.id);
      void this.restoreThumbnails(review, generation);
      const continuation = this.rangeModel.continuationEndpoint();
      if (continuation) {
        try {
          await this.options.capturePositioning?.showFrameAfterCapture(review, continuation);
        } catch (error) {
          this.reportError('Saved captures loaded, but the movie could not be positioned after them.', error);
        }
      }
      if (this.disposed || this.review !== review || this.sourceGeneration !== generation) return;
      const savedDraft = this.rangeModel.snapshot.capture;
      const count = this.rangeModel.snapshot.ranges.length;
      this.message = count > 0
        ? `Restored ${count} saved ranges${savedDraft.kind === 'draft' && (savedDraft.start || savedDraft.end) ? ' and a draft' : ''}.`
        : savedDraft.kind === 'draft' && (savedDraft.start || savedDraft.end) ? 'Restored saved range draft.' : 'Exact capture ready';
      this.restoringCaptures = false;
      this.capturesLoading = false;
      this.publish();
    } catch (error) {
      if (this.review !== review || this.sourceGeneration !== generation) return;
      this.message = 'Saved captures could not be loaded. The stored file was kept for recovery.';
      this.restoringCaptures = false;
      this.capturesLoading = false;
      this.reportError(this.message, error);
      this.publish();
    }
  }

  private async restoreThumbnails(review: IFrameReviewSession, generation: number): Promise<void> {
    let failures = 0;
    const draft = this.rangeModel?.snapshot.capture;
    if (draft?.kind === 'draft' && draft.start?.kind === 'saved-exact-frame') {
      try {
        const frame = await review.thumbnailFrame(draft.start.frameIndex);
        const current = this.rangeModel?.snapshot.capture;
        if (this.disposed || this.review !== review || this.sourceGeneration !== generation) return;
        if (current?.kind === 'draft' && current.start === draft.start
          && frame.identity.frameInfoHash === draft.start.frameInfoHash) this.captureThumbnails.replaceDraft(frame);
      } catch {
        failures += 1;
      }
    }
    for (const range of this.rangeModel?.snapshot.ranges ?? []) {
      if (this.disposed || this.review !== review || this.sourceGeneration !== generation) return;
      if (range.start.kind !== 'saved-exact-frame') continue;
      try {
        const frame = await review.thumbnailFrame(range.start.frameIndex);
        if (this.disposed || this.review !== review || this.sourceGeneration !== generation) return;
        if (frame.identity.frameInfoHash === range.start.frameInfoHash) {
          this.captureThumbnails.replaceRange(range.id, frame);
        }
      } catch {
        failures += 1;
      }
    }
    if (failures > 0 && this.review === review && this.sourceGeneration === generation) {
      this.reportError(`${failures} saved start thumbnails could not be recreated. Retry them from Clips.`);
    }
  }

  private persistQueue(): void {
    if (!this.rangeModel) return;
    const completed = new Set(this.rangeModel.snapshot.ranges
      .filter(range => this.extractionWorkflow?.state(range.id).kind === 'completed').map(range => range.id));
    this.savedCaptureQueue?.save(this.rangeModel, completed);
  }

  private captureUnavailable(): RangeCaptureTransition {
    const message = this.savedCaptureQueue?.hasStaleRanges
      ? 'Open movie to find the original source before capturing.'
      : this.lifecycle === 'opening' ? 'Wait for the movie to finish opening.'
        : this.restoringCaptures ? 'Saved captures are still loading.'
        : 'Capture becomes available after exact frame preparation.';
    this.message = message;
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private rejectRefinement(message: string): BeginRefinementResult {
    this.message = message;
    this.publish();
    return Object.freeze({ kind: 'rejected', message });
  }

  private restoreOpenLifecycle(): void {
    this.lifecycle = this.source ? 'open' : 'empty';
    this.message = this.source ? (this.reviewState?.captureEnabled ? 'Exact capture ready' : 'Preparing exact frames') : null;
    this.publish();
  }

  private createSavedCaptureQueue(store: IClipCapturesStoreService): SavedCaptureQueuePersistence {
    return new SavedCaptureQueuePersistence(store, this.sourceGeneration, error => {
      this.reportError('Captures could not be saved. Current work remains available until the app closes.', error);
    });
  }

  private previewTarget(): IGifPreviewTarget | null {
    if (this.lifecycle !== 'open' || !this.reviewState?.captureEnabled || this.restoringCaptures) return null;
    const refinement = this.activeRefinement?.snapshot;
    if (refinement) {
      if (refinement.status === 'invalidated' || refinement.start.kind !== 'exact-frame'
        || refinement.end.kind !== 'exact-frame') return null;
      return Object.freeze({ kind: 'refinement', rangeId: refinement.rangeId,
        startFrameIndex: refinement.start.identity.frameIndex,
        endFrameIndex: refinement.end.identity.frameIndex,
        sourceGeneration: this.sourceGeneration, revision: this.previewRevision });
    }
    const capture = this.rangeModel?.snapshot.capture;
    if (capture?.kind === 'draft') {
      const start = capture.start;
      const end = capture.end;
      if ((start?.kind !== 'exact-frame' && start?.kind !== 'saved-exact-frame')
        || (end?.kind !== 'exact-frame' && end?.kind !== 'saved-exact-frame')) return null;
      return Object.freeze({ kind: 'draft', rangeId: null,
        startFrameIndex: start.kind === 'exact-frame' ? start.identity.frameIndex : start.frameIndex,
        endFrameIndex: end.kind === 'exact-frame' ? end.identity.frameIndex : end.frameIndex,
        sourceGeneration: this.sourceGeneration, revision: this.previewRevision });
    }
    const range = this.rangeModel?.snapshot.ranges.find(item => item.id === this.selectedRangeId);
    if ((range?.kind !== 'ready-to-extract' && range?.kind !== 'saved-exact-range')
      || this.savedCaptureQueue?.isStale(range.id)) return null;
    return Object.freeze({ kind: 'locked', rangeId: range.id,
      startFrameIndex: range.start.kind === 'exact-frame' ? range.start.identity.frameIndex : range.start.frameIndex,
      endFrameIndex: range.end.kind === 'exact-frame' ? range.end.identity.frameIndex : range.end.frameIndex,
      sourceGeneration: this.sourceGeneration, revision: this.previewRevision });
  }

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
