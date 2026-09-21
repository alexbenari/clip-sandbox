import { Collection } from '../domain/collection.js';
import type { IReadyToExtractRange } from '../domain/captured-range.js';
import type {
  IClipExtractionService,
  ICreatedExtractionMedia,
  IExactClipExtractionRequest,
} from '../frame-review/clip-extraction-api.js';

export type { IClipExtractionService } from '../frame-review/clip-extraction-api.js';

export interface IClipExtractorRequest {
  readonly range: IReadyToExtractRange;
  readonly sourceHandle: string;
  readonly currentSourceGeneration: number;
  readonly destinationHandle: string;
  readonly collectionName: string;
}

export class ClipExtractor {
  constructor(private readonly service: IClipExtractionService) {}

  async extract(request: IClipExtractorRequest): Promise<ICreatedExtractionMedia> {
    const wire = this.validate(request);
    return await this.service.extract(wire);
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
    if (!/^source_[a-zA-Z0-9_-]{8,120}$/.test(request.sourceHandle)) {
      throw new Error('The source handle is invalid.');
    }
    if (!/^destination_[a-zA-Z0-9_-]{8,120}$/.test(request.destinationHandle)) {
      throw new Error('The extraction destination handle is invalid.');
    }
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
    });
  }
}
