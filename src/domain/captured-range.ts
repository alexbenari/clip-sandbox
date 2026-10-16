import {
  CaptureEndpoints,
  type CaptureEndpoint,
  type IExactFrameEndpoint,
  type ISavedExactFrameEndpoint,
} from './capture-endpoint.js';

declare const capturedRangeIdBrand: unique symbol;

export type CapturedRangeId = string & { readonly [capturedRangeIdBrand]: true };

interface ICapturedRangeBase {
  readonly id: CapturedRangeId;
  readonly sourceGeneration: number;
}

export interface INeedsExactFramesRange extends ICapturedRangeBase {
  readonly kind: 'needs-exact-frames';
  readonly start: CaptureEndpoint;
  readonly end: CaptureEndpoint;
}

export interface IReadyToExtractRange extends ICapturedRangeBase {
  readonly kind: 'ready-to-extract';
  readonly start: IExactFrameEndpoint;
  readonly end: IExactFrameEndpoint;
}

export interface ISavedExactRange extends ICapturedRangeBase {
  readonly kind: 'saved-exact-range';
  readonly start: ISavedExactFrameEndpoint;
  readonly end: ISavedExactFrameEndpoint;
}

export type CapturedRange = INeedsExactFramesRange | IReadyToExtractRange | ISavedExactRange;

export class CapturedRanges {
  static hasExactFrames(range: CapturedRange, start: IExactFrameEndpoint, end: IExactFrameEndpoint): boolean {
    return range.kind === 'ready-to-extract'
      && range.start.identity.frameIndex === start.identity.frameIndex
      && range.end.identity.frameIndex === end.identity.frameIndex
      && range.sourceGeneration === start.sourceGeneration
      && range.sourceGeneration === end.sourceGeneration;
  }

  static id(sequence: number): CapturedRangeId {
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Captured-range sequence must be positive.');
    return `range-${sequence}` as CapturedRangeId;
  }

  // Why two endpoints cannot form a range, or null when they can.
  static problemWith(start: CaptureEndpoint, end: CaptureEndpoint): 'mixed-source-generations' | 'end-before-start' | null {
    if (start.sourceGeneration !== end.sourceGeneration) return 'mixed-source-generations';
    const endsFirst = start.kind === 'exact-frame' && end.kind === 'exact-frame'
      ? end.identity.frameIndex < start.identity.frameIndex
      : start.kind === 'saved-exact-frame' && end.kind === 'saved-exact-frame'
        ? end.frameIndex < start.frameIndex
        : CaptureEndpoints.positionUs(end) < CaptureEndpoints.positionUs(start);
    return endsFirst ? 'end-before-start' : null;
  }

  static lock(id: CapturedRangeId, start: CaptureEndpoint, end: CaptureEndpoint): CapturedRange {
    const problem = this.problemWith(start, end);
    if (problem === 'mixed-source-generations') throw new Error('Captured range endpoints belong to different source generations.');
    if (problem === 'end-before-start') throw new Error('The end must not precede the start.');
    if (start.kind === 'exact-frame' && end.kind === 'exact-frame') {
      return Object.freeze({
        kind: 'ready-to-extract', id, sourceGeneration: start.sourceGeneration, start, end,
      });
    }
    if (start.kind === 'saved-exact-frame' && end.kind === 'saved-exact-frame') {
      return Object.freeze({ kind: 'saved-exact-range', id, sourceGeneration: start.sourceGeneration, start, end });
    }
    return Object.freeze({
      kind: 'needs-exact-frames', id, sourceGeneration: start.sourceGeneration, start, end,
    });
  }
}
