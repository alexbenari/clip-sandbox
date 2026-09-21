import type { IExactFrameEndpoint } from '../domain/capture-endpoint.js';
import { CaptureEndpointValue, type CaptureEndpoint } from '../domain/capture-endpoint.js';
import type {
  CapturedRangeId,
  INeedsExactFramesRange,
  IReadyToExtractRange,
} from '../domain/captured-range.js';
import type { FrameReviewDisplayFrame } from '../frame-review/frame-review-api.js';
import type { IFrameReviewDisplayedCapture } from '../ui/frame-review-player-control.js';

export type RefineGifEndpoint = 'start' | 'end';

export type RefineGifTransition =
  | Readonly<{ kind: 'focused'; endpoint: RefineGifEndpoint; seekTimeUs: bigint }>
  | Readonly<{ kind: 'staged'; endpoint: RefineGifEndpoint }>
  | Readonly<{ kind: 'committed'; range: IReadyToExtractRange }>
  | Readonly<{ kind: 'rejected'; message: string }>;

export interface IRefineGifSessionSnapshot {
  readonly rangeId: CapturedRangeId;
  readonly sourceGeneration: number;
  readonly status: 'editing' | 'committed' | 'invalidated';
  readonly original: INeedsExactFramesRange;
  readonly start: CaptureEndpoint;
  readonly end: CaptureEndpoint;
  readonly focusedEndpoint: RefineGifEndpoint;
  readonly seekTimeUs: bigint;
  readonly seekRevision: number;
  readonly canCommit: boolean;
  readonly nextInexactRangeId: CapturedRangeId | null;
  readonly message: string | null;
}

export interface IRefineGifCommitRequest {
  readonly session: RefineGifSession;
  readonly rangeId: CapturedRangeId;
  readonly sourceGeneration: number;
  readonly start: IExactFrameEndpoint;
  readonly end: IExactFrameEndpoint;
  readonly startThumbnail: FrameReviewDisplayFrame | null;
}

export type RefineGifCommitResult =
  | Readonly<{ kind: 'committed'; range: IReadyToExtractRange }>
  | Readonly<{ kind: 'rejected'; message: string }>;

export interface IRefineGifSessionOwner {
  currentSourceGeneration(): number | null;
  exactEndpointFromDisplayedCapture(capture: IFrameReviewDisplayedCapture | null): IExactFrameEndpoint | null;
  commitRefinement(request: IRefineGifCommitRequest): RefineGifCommitResult;
  nextInexactRangeId(afterRangeId: CapturedRangeId): CapturedRangeId | null;
  refinementChanged(session: RefineGifSession): void;
}

export class RefineGifSession {
  private start: CaptureEndpoint;
  private end: CaptureEndpoint;
  private focusedEndpoint: RefineGifEndpoint;
  private status: IRefineGifSessionSnapshot['status'] = 'editing';
  private message: string | null = null;
  private seekRevision = 1;
  private startThumbnail: FrameReviewDisplayFrame | null = null;

  constructor(
    private readonly owner: IRefineGifSessionOwner,
    private readonly original: INeedsExactFramesRange,
  ) {
    this.start = original.start;
    this.end = original.end;
    this.focusedEndpoint = original.start.kind === 'playback-timestamp' ? 'start' : 'end';
  }

  get snapshot(): IRefineGifSessionSnapshot {
    return Object.freeze({
      rangeId: this.original.id,
      sourceGeneration: this.original.sourceGeneration,
      status: this.status,
      original: this.original,
      start: this.start,
      end: this.end,
      focusedEndpoint: this.focusedEndpoint,
      seekTimeUs: CaptureEndpointValue.positionUs(this.focusedValue()),
      seekRevision: this.seekRevision,
      canCommit: this.commitProblem() === null,
      nextInexactRangeId: this.status === 'committed'
        ? this.owner.nextInexactRangeId(this.original.id)
        : null,
      message: this.message,
    });
  }

  markStart(capture: IFrameReviewDisplayedCapture | null): RefineGifTransition {
    return this.markEndpoint('start', capture);
  }

  markEnd(capture: IFrameReviewDisplayedCapture | null): RefineGifTransition {
    return this.markEndpoint('end', capture);
  }

  focus(endpoint: RefineGifEndpoint): RefineGifTransition {
    const problem = this.editingProblem();
    if (problem) return this.reject(problem);
    this.focusEndpoint(endpoint);
    return Object.freeze({ kind: 'focused', endpoint, seekTimeUs: this.snapshot.seekTimeUs });
  }

  commit(): RefineGifTransition {
    const problem = this.commitProblem();
    if (problem) return this.reject(problem);
    if (this.start.kind !== 'exact-frame' || this.end.kind !== 'exact-frame') {
      return this.reject('Set exact start and end frames before locking.');
    }
    const result = this.owner.commitRefinement({
      session: this,
      rangeId: this.original.id,
      sourceGeneration: this.original.sourceGeneration,
      start: this.start,
      end: this.end,
      startThumbnail: this.startThumbnail,
    });
    if (result.kind === 'rejected') return this.reject(result.message);
    this.status = 'committed';
    this.message = 'Exact range locked';
    this.owner.refinementChanged(this);
    return result;
  }

  invalidate(message: string): void {
    if (this.status !== 'editing') return;
    this.status = 'invalidated';
    this.message = message;
    this.owner.refinementChanged(this);
  }

  private markEndpoint(
    endpoint: RefineGifEndpoint,
    capture: IFrameReviewDisplayedCapture | null,
  ): RefineGifTransition {
    const problem = this.editingProblem();
    if (problem) return this.reject(problem);
    if (this.focusedEndpoint !== endpoint) {
      this.focusEndpoint(endpoint);
      return Object.freeze({ kind: 'focused', endpoint, seekTimeUs: this.snapshot.seekTimeUs });
    }
    const exact = this.owner.exactEndpointFromDisplayedCapture(capture);
    if (!exact) return this.reject('Display an exact frame before setting this endpoint.');
    if (endpoint === 'start') {
      this.start = exact;
      this.startThumbnail = capture?.thumbnail ?? null;
    } else {
      this.end = exact;
    }
    this.message = `Exact ${endpoint} staged`;
    if (endpoint === 'start' && this.end.kind === 'playback-timestamp') this.focusEndpoint('end');
    else this.owner.refinementChanged(this);
    return Object.freeze({ kind: 'staged', endpoint });
  }

  private focusEndpoint(endpoint: RefineGifEndpoint): void {
    this.focusedEndpoint = endpoint;
    this.seekRevision += 1;
    this.message = `Review exact ${endpoint}`;
    this.owner.refinementChanged(this);
  }

  private focusedValue(): CaptureEndpoint {
    return this.focusedEndpoint === 'start' ? this.start : this.end;
  }

  private editingProblem(): string | null {
    if (this.status === 'committed') return 'This refinement is already locked.';
    if (this.status === 'invalidated') return this.message ?? 'This refinement is no longer current.';
    if (this.owner.currentSourceGeneration() !== this.original.sourceGeneration) {
      return 'The source changed before this refinement was locked.';
    }
    return null;
  }

  private commitProblem(): string | null {
    const editing = this.editingProblem();
    if (editing) return editing;
    if (this.start.kind !== 'exact-frame' || this.end.kind !== 'exact-frame') {
      return 'Set exact start and end frames before locking.';
    }
    if (this.end.identity.frameIndex < this.start.identity.frameIndex) {
      return 'The end must not precede the start.';
    }
    return null;
  }

  private reject(message: string): RefineGifTransition {
    this.message = message;
    this.owner.refinementChanged(this);
    return Object.freeze({ kind: 'rejected', message });
  }
}
