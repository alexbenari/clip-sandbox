import { OpaqueHandle } from '../frame-review/opaque-handle.js';
import { Collection } from '../domain/collection.js';
import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExactClipExtractionRequest,
  IClipExtractionProgress,
} from './clip-extraction-service.js';

export type { IClipExtractionService } from './clip-extraction-service.js';

export interface IClipExtractorRequest {
  readonly range: IReadyToExtractRange;
  readonly sourceHandle: string;
  readonly reviewSessionId?: string;
  readonly currentSourceGeneration: number;
  readonly destinationHandle: string;
  readonly collectionName: string;
}

export class ClipExtractor {
  constructor(private readonly service: IClipExtractionService) {}

  async extract(request: IClipExtractorRequest, onProgress?: (progress: IClipExtractionProgress) => void): Promise<ICreatedExtractionMedia> {
    const wire = this.validate(request);
    return onProgress
      ? await this.service.extract(wire, onProgress)
      : await this.service.extract(wire);
  }

  cancelCurrent(): Promise<void> {
    return this.service.cancelCurrent?.() ?? Promise.resolve();
  }

  private validate(request: IClipExtractorRequest): IExactClipExtractionRequest {
    const range = request?.range;
    if (!range || range.kind !== 'ready-to-extract'
      || range.start.kind !== 'exact-frame' || range.end.kind !== 'exact-frame') {
      throw new Error('Only a locked exact range can be extracted.');
    }
    if (!Number.isSafeInteger(request.currentSourceGeneration) || request.currentSourceGeneration < 1
      || range.sourceGeneration !== request.currentSourceGeneration) {
      throw new Error('The captured range belongs to an earlier source.');
    }
    OpaqueHandle.parse(request.sourceHandle, 'source handle');
    OpaqueHandle.parse(request.destinationHandle, 'extraction destination handle');
    const collection = Collection.validateCollectionName(request.collectionName);
    if (!collection.ok || collection.name !== request.collectionName) {
      throw new Error('The extraction collection name is invalid.');
    }
    const startFrameIndex = range.start.identity.frameIndex;
    const endFrameIndex = range.end.identity.frameIndex;
    if (!Number.isSafeInteger(startFrameIndex) || startFrameIndex < 0
      || !Number.isSafeInteger(endFrameIndex) || endFrameIndex < startFrameIndex) {
      throw new Error('The exact frame range is invalid.');
    }
    return Object.freeze({
      sourceHandle: request.sourceHandle,
      destinationHandle: request.destinationHandle,
      sourceGeneration: request.currentSourceGeneration,
      collectionName: collection.name,
      startFrameIndex,
      endFrameIndex,
      ...(request.reviewSessionId ? { reviewSessionId: request.reviewSessionId } : {}),
    });
  }
}
