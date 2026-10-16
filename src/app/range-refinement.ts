import { CaptureEndpoints, type IExactFrameEndpoint } from '../domain/capture-endpoint.js';
import { CapturedRanges, type CapturedRangeId } from '../domain/captured-range.js';
import type { CaptureQueue } from './capture-queue.js';
import type { CurrentMovie } from './current-movie.js';
import type { IFrameReviewDisplayedCapture } from './frame-review-displayed-capture.js';
import type { GifSessionStatus } from './gif-session-status.js';
import type { RangeExtraction } from './range-extraction.js';
import {
  RangeRefinementDraft,
  type IRefineGifCommitRequest,
  type IRangeRefinementDraftOwner,
  type RefineGifCommitResult,
} from './range-refinement-draft.js';

// 'stopped' means nothing more needs saying: the saved-frame check already reported its failure,
// or a newer request or a different movie replaced this one while the frames were being checked.
export type BeginRefinementResult =
  | Readonly<{ kind: 'started'; session: RangeRefinementDraft }>
  | Readonly<{ kind: 'rejected'; message: string }>
  | Readonly<{ kind: 'stopped' }>;

type RangeRefinementDependencies = Readonly<{
  queue: Pick<CaptureQueue, 'range' | 'ranges' | 'hasModel' | 'isStale' | 'markSelected' | 'prepareSavedRange'
    | 'replaceRangeWithExactEndpoints' | 'replaceThumbnail' | 'save'>;
  extraction: Pick<RangeExtraction, 'revisionBlock' | 'state' | 'resetForRevision'>;
  movie: Pick<CurrentMovie, 'lifecycle' | 'reviewState' | 'sourceGeneration'>;
  status: Pick<GifSessionStatus, 'show' | 'advancePreview' | 'changed'>;
}>;

const STOPPED: BeginRefinementResult = Object.freeze({ kind: 'stopped' });

// The refinement of one range against exact frames, and whether it may replace that range.
export class RangeRefinement implements IRangeRefinementDraftOwner {
  private refinement: RangeRefinementDraft | null = null;
  private lastSeenRevision: number | null = null;
  private latestRequest = 0;

  constructor(private readonly deps: RangeRefinementDependencies) {}

  get active(): RangeRefinementDraft | null { return this.refinement; }

  // A saved range is first checked against the movie, so no caller has to remember to do it.
  async beginRefinement(rangeId: CapturedRangeId): Promise<BeginRefinementResult> {
    const request = ++this.latestRequest;
    const { queue, movie } = this.deps;
    if (queue.range(rangeId)?.kind === 'saved-exact-range' && movie.lifecycle === 'open' && !queue.isStale(rangeId)
      && movie.reviewState?.captureEnabled) {
      const generation = movie.sourceGeneration;
      const checked = await queue.prepareSavedRange(rangeId);
      if (!checked || request !== this.latestRequest || movie.sourceGeneration !== generation) return STOPPED;
    }
    return this.begin(rangeId);
  }

  abandon(): CapturedRangeId | null {
    const rangeId = this.refinement?.snapshot.rangeId ?? null;
    this.refinement = null;
    this.lastSeenRevision = null;
    this.deps.status.advancePreview();
    this.deps.status.show(null);
    this.deps.status.changed();
    return rangeId;
  }

  // Marks the refinement unusable while the next movie opens; reset() lets go of it once it has.
  invalidateForNewMovie(): void {
    this.refinement?.invalidate('The source changed before this refinement was locked.');
  }

  endForRemovedRange(rangeId: CapturedRangeId): void {
    if (this.refinement?.snapshot.rangeId !== rangeId) return;
    this.refinement.invalidate('The range was removed before this refinement was locked.');
    this.refinement = null;
  }

  reset(): void {
    this.refinement = null;
    this.lastSeenRevision = null;
  }

  // With a fixed destination, a range being refined is extracted only after its refinement is locked.
  blocksExtraction(rangeId: CapturedRangeId): boolean {
    return this.refinement?.snapshot.rangeId === rangeId && this.refinement.snapshot.status !== 'committed';
  }

  currentSourceGeneration(): number | null {
    return this.deps.queue.hasModel ? this.deps.movie.sourceGeneration : null;
  }

  exactEndpointFromDisplayedCapture(capture: IFrameReviewDisplayedCapture | null): IExactFrameEndpoint | null {
    const { movie, queue } = this.deps;
    if (!capture || capture.point.kind !== 'exact-frame' || !movie.reviewState?.captureEnabled
      || capture.sourceGeneration !== movie.reviewState.sourceGeneration || !queue.hasModel) return null;
    return CaptureEndpoints.exact(capture.point.identity, capture.positionUs, movie.sourceGeneration);
  }

  commitRefinement(request: IRefineGifCommitRequest): RefineGifCommitResult {
    const { queue, extraction, movie, status } = this.deps;
    if (this.refinement !== request.session) {
      return Object.freeze({ kind: 'rejected', message: 'This refinement is no longer active.' });
    }
    if (request.sourceGeneration !== movie.sourceGeneration) {
      return Object.freeze({ kind: 'rejected', message: 'The source changed before this refinement was locked.' });
    }
    const current = queue.range(request.rangeId);
    if (!current) {
      return Object.freeze({ kind: 'rejected', message: 'The range was removed before this refinement was locked.' });
    }
    if (current !== request.session.snapshot.original) {
      return Object.freeze({ kind: 'rejected', message: 'This range changed before the refinement was locked.' });
    }
    const changed = !CapturedRanges.hasExactFrames(current, request.start, request.end);
    const block = changed ? extraction.revisionBlock(request.rangeId) : null;
    if (block) return Object.freeze({ kind: 'rejected', message: block });
    if (!changed && current.kind === 'ready-to-extract') {
      queue.markSelected(request.rangeId);
      const message = 'Range unchanged; previous extraction status is preserved.';
      status.show(message);
      return Object.freeze({ kind: 'committed', range: current, message });
    }
    const previousExtraction = extraction.state(request.rangeId);
    const replacement = queue.replaceRangeWithExactEndpoints(request.rangeId, request.start, request.end);
    if (!replacement || replacement.kind !== 'ready-to-extract') {
      return Object.freeze({ kind: 'rejected', message: 'The exact range could not be locked.' });
    }
    extraction.resetForRevision(request.rangeId);
    queue.save();
    if (request.startThumbnail && (current.start.kind !== 'exact-frame'
      || current.start.identity.frameIndex !== request.start.identity.frameIndex)) {
      queue.replaceThumbnail(request.rangeId, request.startThumbnail);
    }
    queue.markSelected(request.rangeId);
    const message = previousExtraction.kind === 'completed'
      ? 'Revised range locked. The earlier clip remains saved; extract again to create a new clip.'
      : 'Exact range locked';
    status.show(message);
    return Object.freeze({ kind: 'committed', range: replacement, message });
  }

  nextInexactRangeId(afterRangeId: CapturedRangeId): CapturedRangeId | null {
    const ranges = this.deps.queue.ranges;
    const currentIndex = ranges.findIndex(range => range.id === afterRangeId);
    if (currentIndex < 0) return null;
    return ranges.slice(currentIndex + 1).find(range => range.kind === 'needs-exact-frames')?.id ?? null;
  }

  refinementChanged(session: RangeRefinementDraft): void {
    if (this.refinement !== session) return;
    const current = session.snapshot.stagedRevision;
    if (current !== this.lastSeenRevision || session.snapshot.status !== 'editing') {
      this.lastSeenRevision = current;
      this.deps.status.advancePreview();
    }
    this.deps.status.changed();
  }

  private begin(rangeId: CapturedRangeId): BeginRefinementResult {
    const { queue, movie, status } = this.deps;
    if (movie.lifecycle !== 'open') return this.reject('Wait for the movie to finish opening.');
    const range = queue.range(rangeId);
    if (!range) return this.reject('Choose a captured range to refine.');
    if (queue.isStale(rangeId)) {
      return this.reject('Saved frames no longer match this movie. Remove the range or reopen the original movie.');
    }
    if (!movie.reviewState?.captureEnabled || range.sourceGeneration !== movie.sourceGeneration) {
      return this.reject('Exact frame review is not ready for this range.');
    }
    if (range.kind === 'saved-exact-range') return this.reject('Check the saved range against the movie before refining it.');
    this.refinement = new RangeRefinementDraft(this, range);
    this.lastSeenRevision = 0;
    status.advancePreview();
    queue.markSelected(rangeId);
    status.show(range.kind === 'needs-exact-frames'
      ? 'Refine the approximate endpoint against exact frames.'
      : 'Review and adjust exact frames, then lock the range.');
    status.changed();
    return Object.freeze({ kind: 'started', session: this.refinement });
  }

  private reject(message: string): BeginRefinementResult {
    this.deps.status.show(message);
    this.deps.status.changed();
    return Object.freeze({ kind: 'rejected', message });
  }
}
