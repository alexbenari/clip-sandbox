import type { BestSourceFrameIndexer, IFrameIndexResult } from './bestsource-frame-indexer.js';

export class FrameIndexCache {
  constructor(private readonly indexer: BestSourceFrameIndexer) {}

  build(sourcePath: string, indexPath: string, signal?: AbortSignal): Promise<IFrameIndexResult> {
    return this.indexer.index(sourcePath, indexPath, signal);
  }
}
