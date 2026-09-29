import {
  CaptureEndpointValue,
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

export class CapturedRangeValue {
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

  static lock(id: CapturedRangeId, start: CaptureEndpoint, end: CaptureEndpoint): CapturedRange {
    if (start.sourceGeneration !== end.sourceGeneration) {
      throw new Error('Captured range endpoints belong to different source generations.');
    }
    if (start.kind === 'exact-frame' && end.kind === 'exact-frame') {
      if (end.identity.frameIndex < start.identity.frameIndex) {
        throw new Error('The end must not precede the start.');
      }
      return Object.freeze({
        kind: 'ready-to-extract', id, sourceGeneration: start.sourceGeneration, start, end,
      });
    }
    if (start.kind === 'saved-exact-frame' && end.kind === 'saved-exact-frame') {
      if (end.frameIndex < start.frameIndex) throw new Error('The end must not precede the start.');
      return Object.freeze({ kind: 'saved-exact-range', id, sourceGeneration: start.sourceGeneration, start, end });
    }
    if (CaptureEndpointValue.positionUs(end) < CaptureEndpointValue.positionUs(start)) {
      throw new Error('The end must not precede the start.');
    }
    return Object.freeze({
      kind: 'needs-exact-frames', id, sourceGeneration: start.sourceGeneration, start, end,
    });
  }
}
