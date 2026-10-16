import { CaptureEndpoints, type CaptureEndpoint } from '../domain/capture-endpoint.js';
import { RangeCaptureModel } from '../domain/range-capture-model.js';

// The per-movie capture file, as the desktop capture store keeps and validates it.
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

const MAX_SAVED_RANGES = 500;

// Converts a capture queue to and from its saved file. On disk an endpoint is 'exact-frame' when it named
// an exact frame at save time; in memory it becomes 'saved-exact-frame' until it is checked against the
// reopened movie. The disk name stays because the desktop store validates it.
export class SavedCaptureCodec {
  decode(value: unknown, sourceGeneration: number): RangeCaptureModel {
    const data = this.record(value, 'Saved capture data');
    if (data.schemaVersion !== 1 || !Array.isArray(data.ranges) || data.ranges.length > MAX_SAVED_RANGES
      || !Number.isSafeInteger(data.nextRangeSequence) || (data.nextRangeSequence as number) < 1) {
      throw new Error('Saved capture data is invalid or unsupported.');
    }
    const ranges = data.ranges.map(item => {
      const range = this.record(item, 'Saved range');
      if (typeof range.id !== 'string' || !/^range-[1-9]\d*$/.test(range.id)) throw new Error('Saved range ID is invalid or duplicated.');
      const sequence = Number(range.id.slice(6));
      if (!Number.isSafeInteger(sequence)) throw new Error('Saved range ID exceeds the supported range.');
      return { sequence, start: this.endpoint(range.start, sourceGeneration), end: this.endpoint(range.end, sourceGeneration) };
    });
    let draft = null;
    if (data.draft !== undefined && data.draft !== null) {
      const saved = this.record(data.draft, 'Saved draft');
      if (saved.start == null && saved.end == null) throw new Error('Saved draft has no endpoints.');
      draft = {
        start: saved.start == null ? null : this.endpoint(saved.start, sourceGeneration),
        end: saved.end == null ? null : this.endpoint(saved.end, sourceGeneration),
      };
    }
    return RangeCaptureModel.restore({ ranges, draft, nextRangeSequence: data.nextRangeSequence as number }, sourceGeneration);
  }

  // Fully extracted ranges are left out; the queue keeps only unfinished work.
  encode(model: RangeCaptureModel, excludedIds: ReadonlySet<string> = new Set()): ISavedRangeCaptureData {
    const { capture, ranges } = model.snapshot;
    const hasDraft = capture.kind === 'draft' && (capture.start !== null || capture.end !== null);
    return Object.freeze({
      schemaVersion: 1,
      nextRangeSequence: model.nextRangeSequence,
      ...(hasDraft ? {
        draft: Object.freeze({
          start: capture.start ? this.endpointData(capture.start) : null,
          end: capture.end ? this.endpointData(capture.end) : null,
        }),
      } : {}),
      ranges: Object.freeze(ranges.filter(range => !excludedIds.has(range.id)).map(range => Object.freeze({
        id: range.id,
        start: this.endpointData(range.start),
        end: this.endpointData(range.end),
      }))),
    });
  }

  private endpointData(endpoint: CaptureEndpoint): Readonly<Record<string, unknown>> {
    if (endpoint.kind === 'playback-timestamp') {
      return Object.freeze({ kind: endpoint.kind, timestampUs: endpoint.timestampUs.toString() });
    }
    return Object.freeze({
      kind: 'exact-frame',
      frameIndex: CaptureEndpoints.frameIndexOf(endpoint),
      frameInfoHash: CaptureEndpoints.frameHashOf(endpoint),
      reviewTimeUs: endpoint.reviewTimeUs.toString(),
    });
  }

  private endpoint(value: unknown, sourceGeneration: number): CaptureEndpoint {
    const record = this.record(value, 'Saved endpoint');
    if (record.kind === 'playback-timestamp') {
      return CaptureEndpoints.timestamp(this.decimal(record.timestampUs, 'timestampUs'), sourceGeneration);
    }
    if (record.kind === 'exact-frame') {
      return CaptureEndpoints.savedExact(record.frameIndex as number, record.frameInfoHash as string,
        this.decimal(record.reviewTimeUs, 'reviewTimeUs'), sourceGeneration);
    }
    throw new Error('Saved endpoint kind is unsupported.');
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
  }

  private decimal(value: unknown, label: string): bigint {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value)) {
      throw new Error(`${label} must be a bounded nonnegative decimal string.`);
    }
    return BigInt(value);
  }
}
