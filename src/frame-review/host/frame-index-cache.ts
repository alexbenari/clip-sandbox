import type { BestSourceFrameIndexer, IFrameIndexResult, IFrameTimelineIndexResult } from './bestsource-frame-indexer.js';

export class FrameIndexCache {
  constructor(private readonly indexer: BestSourceFrameIndexer) {}

  build(
    sourcePath: string,
    indexPath: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
  ): Promise<IFrameIndexResult> {
    return this.indexer.index(sourcePath, indexPath, signal, onProgress);
  }

  timeline(sourcePath: string, indexPath: string, signal?: AbortSignal): Promise<IFrameTimelineIndexResult> {
    return this.indexer.timeline(sourcePath, indexPath, signal);
  }
}
