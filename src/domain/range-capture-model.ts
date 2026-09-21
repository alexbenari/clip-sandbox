import type { CaptureEndpoint, IExactFrameEndpoint } from './capture-endpoint.js';
import {
  CapturedRangeValue,
  type CapturedRange,
  type CapturedRangeId,
} from './captured-range.js';

export type RangeCaptureTransition =
  | Readonly<{ kind: 'marked-start' | 'marked-end' }>
  | Readonly<{ kind: 'locked'; range: CapturedRange }>
  | Readonly<{ kind: 'rejected'; message: string }>;

export type RangeCaptureState =
  | Readonly<{
    kind: 'draft';
    start: CaptureEndpoint | null;
    end: CaptureEndpoint | null;
    message: string | null;
  }>
  | Readonly<{ kind: 'locked'; rangeId: CapturedRangeId; message: string | null }>;

export interface IRangeCaptureSnapshot {
  readonly sourceGeneration: number;
  readonly capture: RangeCaptureState;
  readonly ranges: readonly CapturedRange[];
}

export class RangeCaptureModel {
  private start: CaptureEndpoint | null = null;
  private end: CaptureEndpoint | null = null;
  private latestLockedRangeId: CapturedRangeId | null = null;
  private message: string | null = null;
  private sequence = 0;
  private readonly ranges: CapturedRange[] = [];

  constructor(private readonly sourceGeneration: number) {
    if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 1) {
      throw new Error('Range-capture source generation must be a positive safe integer.');
    }
  }

  markStart(endpoint: CaptureEndpoint): RangeCaptureTransition {
    this.assertCurrentSource(endpoint);
    if (this.latestLockedRangeId) this.beginNextDraft();
    this.start = endpoint;
    this.message = null;
    return Object.freeze({ kind: 'marked-start' });
  }

  markEnd(endpoint: CaptureEndpoint): RangeCaptureTransition {
    this.assertCurrentSource(endpoint);
    if (this.latestLockedRangeId) return this.reject('Press Q to begin a new range.');
    this.end = endpoint;
    this.message = null;
    return Object.freeze({ kind: 'marked-end' });
  }

  lockRange(): RangeCaptureTransition {
    if (this.latestLockedRangeId) return this.reject('The current range is already locked.');
    if (!this.start || !this.end) return this.reject('Mark a start and end before locking.');
    try {
      const range = CapturedRangeValue.lock(CapturedRangeValue.id(++this.sequence), this.start, this.end);
      this.ranges.push(range);
      this.latestLockedRangeId = range.id;
      this.message = null;
      return Object.freeze({ kind: 'locked', range });
    } catch (error) {
      this.sequence -= 1;
      return this.reject(error instanceof Error ? error.message : 'The range could not be locked.');
    }
  }

  replaceRangeWithExactEndpoints(
    rangeId: CapturedRangeId,
    start: IExactFrameEndpoint,
    end: IExactFrameEndpoint,
  ): CapturedRange | null {
    const index = this.ranges.findIndex(range => range.id === rangeId);
    if (index < 0) return null;
    const replacement = CapturedRangeValue.lock(rangeId, start, end);
    this.ranges[index] = replacement;
    return replacement;
  }

  removeRange(rangeId: CapturedRangeId): CapturedRange | null {
    const index = this.ranges.findIndex(range => range.id === rangeId);
    if (index < 0) return null;
    const [removed] = this.ranges.splice(index, 1);
    if (this.latestLockedRangeId === rangeId) this.latestLockedRangeId = null;
    return removed ?? null;
  }

  get snapshot(): IRangeCaptureSnapshot {
    const capture: RangeCaptureState = this.latestLockedRangeId
      ? Object.freeze({ kind: 'locked', rangeId: this.latestLockedRangeId, message: this.message })
      : Object.freeze({ kind: 'draft', start: this.start, end: this.end, message: this.message });
    return Object.freeze({
      sourceGeneration: this.sourceGeneration,
      capture,
      ranges: Object.freeze([...this.ranges]),
    });
  }

  private beginNextDraft(): void {
    this.start = null;
    this.end = null;
    this.latestLockedRangeId = null;
    this.message = null;
  }

  private assertCurrentSource(endpoint: CaptureEndpoint): void {
    if (endpoint.sourceGeneration !== this.sourceGeneration) {
      throw new Error('Capture endpoint belongs to a stale source generation.');
    }
  }

  private reject(message: string): RangeCaptureTransition {
    this.message = message;
    return Object.freeze({ kind: 'rejected', message });
  }
}
