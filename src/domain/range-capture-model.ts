import { CaptureEndpointValue, type CaptureEndpoint, type IExactFrameEndpoint } from './capture-endpoint.js';
import type { ISourceFrameIdentity } from '../frame-review/model/source-frame-identity.js';
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

export interface ISavedRangeCaptureData {
  readonly schemaVersion: 1;
  readonly nextRangeSequence: number;
  readonly draft?: Readonly<{
    start: Readonly<Record<string, unknown>> | null;
    end: Readonly<Record<string, unknown>> | null;
  }>;
  readonly ranges: readonly Readonly<{
    id: string;
    start: Readonly<Record<string, unknown>>;
    end: Readonly<Record<string, unknown>>;
  }>[];
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

  static fromSavedData(value: unknown, sourceGeneration: number): RangeCaptureModel {
    const data = this.record(value, 'Saved capture data');
    if (data.schemaVersion !== 1 || !Array.isArray(data.ranges) || data.ranges.length > 500
      || !Number.isSafeInteger(data.nextRangeSequence) || (data.nextRangeSequence as number) < 1) {
      throw new Error('Saved capture data is invalid or unsupported.');
    }
    const model = new RangeCaptureModel(sourceGeneration);
    const ids = new Set<string>();
    let highestId = 0;
    for (const item of data.ranges) {
      const range = this.record(item, 'Saved range');
      if (typeof range.id !== 'string' || !/^range-[1-9]\d*$/.test(range.id) || ids.has(range.id)) {
        throw new Error('Saved range ID is invalid or duplicated.');
      }
      const sequence = Number(range.id.slice(6));
      if (!Number.isSafeInteger(sequence)) throw new Error('Saved range ID exceeds the supported range.');
      highestId = Math.max(highestId, sequence);
      ids.add(range.id);
      const start = this.savedEndpoint(range.start, sourceGeneration);
      const end = this.savedEndpoint(range.end, sourceGeneration);
      model.ranges.push(CapturedRangeValue.lock(CapturedRangeValue.id(sequence), start, end));
    }
    if ((data.nextRangeSequence as number) <= highestId) throw new Error('Saved range sequence would reuse an ID.');
    if (data.draft !== undefined && data.draft !== null) {
      const draft = this.record(data.draft, 'Saved draft');
      if (draft.start == null && draft.end == null) throw new Error('Saved draft has no endpoints.');
      model.start = draft.start == null ? null : this.savedEndpoint(draft.start, sourceGeneration);
      model.end = draft.end == null ? null : this.savedEndpoint(draft.end, sourceGeneration);
    }
    model.sequence = (data.nextRangeSequence as number) - 1;
    return model;
  }

  toSavedData(excludedIds: ReadonlySet<string> = new Set()): ISavedRangeCaptureData {
    return Object.freeze({
      schemaVersion: 1,
      nextRangeSequence: this.sequence + 1,
      ...(!this.latestLockedRangeId && (this.start || this.end) ? {
        draft: Object.freeze({
          start: this.start ? RangeCaptureModel.endpointData(this.start) : null,
          end: this.end ? RangeCaptureModel.endpointData(this.end) : null,
        }),
      } : {}),
      ranges: Object.freeze(this.ranges.filter(range => !excludedIds.has(range.id)).map(range => Object.freeze({
        id: range.id,
        start: RangeCaptureModel.endpointData(range.start),
        end: RangeCaptureModel.endpointData(range.end),
      }))),
    });
  }

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
      return CaptureEndpointValue.exact(identity, endpoint.reviewTimeUs, this.sourceGeneration);
    };
    const start = hydrate(range.start, identities.start);
    const end = hydrate(range.end, identities.end);
    if (!start || !end) return null;
    const replacement = CapturedRangeValue.lock(rangeId, start, end);
    this.ranges[index] = replacement;
    return replacement;
  }

  hydrateSavedDraft(identities: Readonly<{ start?: ISourceFrameIdentity; end?: ISourceFrameIdentity }>): boolean {
    const hydrate = (endpoint: CaptureEndpoint | null, identity?: ISourceFrameIdentity): CaptureEndpoint | null | undefined => {
      if (endpoint?.kind !== 'saved-exact-frame') return endpoint;
      if (!identity || endpoint.frameIndex !== identity.frameIndex || endpoint.frameInfoHash !== identity.frameInfoHash) return undefined;
      return CaptureEndpointValue.exact(identity, endpoint.reviewTimeUs, this.sourceGeneration);
    };
    const start = hydrate(this.start, identities.start);
    const end = hydrate(this.end, identities.end);
    if (start === undefined || end === undefined) return false;
    this.start = start;
    this.end = end;
    return true;
  }

  private static endpointData(endpoint: CaptureEndpoint): Readonly<Record<string, unknown>> {
    if (endpoint.kind === 'playback-timestamp') {
      return Object.freeze({ kind: endpoint.kind, timestampUs: endpoint.timestampUs.toString() });
    }
    return Object.freeze({
      kind: 'exact-frame',
      frameIndex: endpoint.kind === 'exact-frame' ? endpoint.identity.frameIndex : endpoint.frameIndex,
      frameInfoHash: endpoint.kind === 'exact-frame' ? endpoint.identity.frameInfoHash : endpoint.frameInfoHash,
      reviewTimeUs: endpoint.reviewTimeUs.toString(),
    });
  }

  private static savedEndpoint(value: unknown, sourceGeneration: number): CaptureEndpoint {
    const record = this.record(value, 'Saved endpoint');
    if (record.kind === 'playback-timestamp') {
      return CaptureEndpointValue.timestamp(this.decimal(record.timestampUs, 'timestampUs'), sourceGeneration);
    }
    if (record.kind === 'exact-frame') {
      return CaptureEndpointValue.savedExact(record.frameIndex as number, record.frameInfoHash as string,
        this.decimal(record.reviewTimeUs, 'reviewTimeUs'), sourceGeneration);
    }
    throw new Error('Saved endpoint kind is unsupported.');
  }

  private static record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
  }

  private static decimal(value: unknown, label: string): bigint {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value)) {
      throw new Error(`${label} must be a bounded nonnegative decimal string.`);
    }
    return BigInt(value);
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
    if (this.start.kind === 'saved-exact-frame' || this.end.kind === 'saved-exact-frame') {
      return this.reject('Check the saved exact frames before locking this draft.');
    }
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
    this.message = null;
    return true;
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
