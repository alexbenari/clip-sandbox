import { CaptureEndpoints, type CaptureEndpoint, type IExactFrameEndpoint } from './capture-endpoint.js';
import type { ISourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
import {
  CapturedRanges,
  type CapturedRange,
  type CapturedRangeId,
} from './captured-range.js';

// Why a mark or lock was refused. The application words these for the user.
export type RangeCaptureRejection =
  | 'locked-range-needs-new-start'
  | 'range-already-locked'
  | 'endpoints-missing'
  | 'saved-frames-unchecked'
  | 'end-before-start'
  | 'mixed-source-generations';

export type RangeCaptureTransition =
  | Readonly<{ kind: 'marked-start' | 'marked-end' }>
  | Readonly<{ kind: 'locked'; range: CapturedRange }>
  | Readonly<{ kind: 'rejected'; reason: RangeCaptureRejection }>;

export type RangeCaptureState =
  | Readonly<{
    kind: 'draft';
    start: CaptureEndpoint | null;
    end: CaptureEndpoint | null;
  }>
  | Readonly<{ kind: 'locked'; rangeId: CapturedRangeId }>;

export interface IRangeCaptureSnapshot {
  readonly sourceGeneration: number;
  readonly capture: RangeCaptureState;
  readonly ranges: readonly CapturedRange[];
}

// A range kept elsewhere and handed back for restoring: its sequence number and its endpoints.
export type RestoredRange = Readonly<{ sequence: number; start: CaptureEndpoint; end: CaptureEndpoint }>;
export class RangeCaptureModel {
  private start: CaptureEndpoint | null = null;
  private end: CaptureEndpoint | null = null;
  private latestLockedRangeId: CapturedRangeId | null = null;
  private sequence = 0;
  private readonly ranges: CapturedRange[] = [];

  constructor(private readonly sourceGeneration: number) {
    if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 1) {
      throw new Error('Range-capture source generation must be a positive safe integer.');
    }
  }

  // Rebuilds a queue from ranges and a draft kept between runs. Range numbers must be unique, and the
  // next number must not reuse one of them.
  static restore({ ranges, draft, nextRangeSequence }: Readonly<{
    ranges: readonly RestoredRange[];
    draft: Readonly<{ start: CaptureEndpoint | null; end: CaptureEndpoint | null }> | null;
    nextRangeSequence: number;
  }>, sourceGeneration: number): RangeCaptureModel {
    const model = new RangeCaptureModel(sourceGeneration);
    const sequences = new Set<number>();
    for (const range of ranges) {
      if (sequences.has(range.sequence)) throw new Error('Saved range ID is invalid or duplicated.');
      sequences.add(range.sequence);
      model.assertCurrentSource(range.start);
      model.assertCurrentSource(range.end);
      model.ranges.push(CapturedRanges.lock(CapturedRanges.id(range.sequence), range.start, range.end));
    }
    const highest = Math.max(0, ...sequences);
    if (!Number.isSafeInteger(nextRangeSequence) || nextRangeSequence <= highest) {
      throw new Error('Saved range sequence would reuse an ID.');
    }
    if (draft) {
      if (draft.start) model.assertCurrentSource(draft.start);
      if (draft.end) model.assertCurrentSource(draft.end);
      model.start = draft.start;
      model.end = draft.end;
    }
    model.sequence = nextRangeSequence - 1;
    return model;
  }

  get nextRangeSequence(): number { return this.sequence + 1; }
  hydrateSavedRange(
    rangeId: CapturedRangeId,
    identities: Readonly<{ start?: ISourceFrameIdentity; end?: ISourceFrameIdentity }>,
  ): CapturedRange | null {
    const index = this.ranges.findIndex(item => item.id === rangeId);
    const range = this.ranges[index];
    if (!range) return null;
    const hydrate = (endpoint: CaptureEndpoint, identity?: ISourceFrameIdentity): CaptureEndpoint | null => {
      if (endpoint.kind !== 'saved-exact-frame') return endpoint;
      if (!identity || endpoint.frameIndex !== identity.frameIndex || endpoint.frameInfoHash !== identity.frameInfoHash) return null;
      return CaptureEndpoints.exact(identity, endpoint.reviewTimeUs, this.sourceGeneration);
    };
    const start = hydrate(range.start, identities.start);
    const end = hydrate(range.end, identities.end);
    if (!start || !end) return null;
    const replacement = CapturedRanges.lock(rangeId, start, end);
    this.ranges[index] = replacement;
    return replacement;
  }

  hydrateSavedDraft(identities: Readonly<{ start?: ISourceFrameIdentity; end?: ISourceFrameIdentity }>): boolean {
    const hydrate = (endpoint: CaptureEndpoint | null, identity?: ISourceFrameIdentity): CaptureEndpoint | null | undefined => {
      if (endpoint?.kind !== 'saved-exact-frame') return endpoint;
      if (!identity || endpoint.frameIndex !== identity.frameIndex || endpoint.frameInfoHash !== identity.frameInfoHash) return undefined;
      return CaptureEndpoints.exact(identity, endpoint.reviewTimeUs, this.sourceGeneration);
    };
    const start = hydrate(this.start, identities.start);
    const end = hydrate(this.end, identities.end);
    if (start === undefined || end === undefined) return false;
    this.start = start;
    this.end = end;
    return true;
  }

  markStart(endpoint: CaptureEndpoint): RangeCaptureTransition {
    this.assertCurrentSource(endpoint);
    if (this.latestLockedRangeId) this.beginNextDraft();
    this.start = endpoint;
    return Object.freeze({ kind: 'marked-start' });
  }

  markEnd(endpoint: CaptureEndpoint): RangeCaptureTransition {
    this.assertCurrentSource(endpoint);
    if (this.latestLockedRangeId) return this.reject('locked-range-needs-new-start');
    this.end = endpoint;
    return Object.freeze({ kind: 'marked-end' });
  }

  lockRange(): RangeCaptureTransition {
    if (this.latestLockedRangeId) return this.reject('range-already-locked');
    if (!this.start || !this.end) return this.reject('endpoints-missing');
    if (this.start.kind === 'saved-exact-frame' || this.end.kind === 'saved-exact-frame') return this.reject('saved-frames-unchecked');
    const problem = CapturedRanges.problemWith(this.start, this.end);
    if (problem) return this.reject(problem);
    const range = CapturedRanges.lock(CapturedRanges.id(++this.sequence), this.start, this.end);
    this.ranges.push(range);
    this.latestLockedRangeId = range.id;
    return Object.freeze({ kind: 'locked', range });
  }

  replaceRangeWithExactEndpoints(
    rangeId: CapturedRangeId,
    start: IExactFrameEndpoint,
    end: IExactFrameEndpoint,
  ): CapturedRange | null {
    const index = this.ranges.findIndex(range => range.id === rangeId);
    if (index < 0) return null;
    const replacement = CapturedRanges.lock(rangeId, start, end);
    this.ranges[index] = replacement;
    return replacement;
  }

  removeRange(rangeId: CapturedRangeId): CapturedRange | null {
    const index = this.ranges.findIndex(range => range.id === rangeId);
    if (index < 0) return null;
    const [removed] = this.ranges.splice(index, 1);
    if (this.latestLockedRangeId === rangeId) {
      this.latestLockedRangeId = null;
      this.start = null;
      this.end = null;
    }
    return removed ?? null;
  }

  discardDraft(): boolean {
    if (this.latestLockedRangeId || (!this.start && !this.end)) return false;
    this.start = null;
    this.end = null;
    return true;
  }

  get snapshot(): IRangeCaptureSnapshot {
    const capture: RangeCaptureState = this.latestLockedRangeId
      ? Object.freeze({ kind: 'locked', rangeId: this.latestLockedRangeId })
      : Object.freeze({ kind: 'draft', start: this.start, end: this.end });
    return Object.freeze({
      sourceGeneration: this.sourceGeneration,
      capture,
      ranges: Object.freeze([...this.ranges]),
    });
  }

  continuationEndpoint(): CaptureEndpoint | null {
    return this.end ?? this.start ?? this.ranges.at(-1)?.end ?? null;
  }

  private beginNextDraft(): void {
    this.start = null;
    this.end = null;
    this.latestLockedRangeId = null;
  }

  private assertCurrentSource(endpoint: CaptureEndpoint): void {
    if (endpoint.sourceGeneration !== this.sourceGeneration) {
      throw new Error('Capture endpoint belongs to a stale source generation.');
    }
  }

  private reject(reason: RangeCaptureRejection): RangeCaptureTransition {
    return Object.freeze({ kind: 'rejected', reason });
  }
}
