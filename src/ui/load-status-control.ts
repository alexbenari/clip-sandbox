import { collectionLoadedText, loadedVideosText } from '../app/app-text.js';
import type { Pipeline } from '../domain/pipeline.js';

type StatusControl = {
  show(message: string, timeout?: number): void;
};

export class LoadStatusControl {
  statusBarControl?: StatusControl | null;

  constructor({
    statusControl,
    statusBarControl = statusControl,
  }: { statusControl?: StatusControl | null; statusBarControl?: StatusControl | null } = {}) {
    this.statusBarControl = statusBarControl;
  }

  initialLoadText({ pipeline = null, clipCount = 0 }: { pipeline?: Pipeline | null; clipCount?: number } = {}): string {
    if (pipeline?.videoNames?.().length === 0) {
      return 'No video files found in the selected folder.';
    }
    return loadedVideosText(clipCount);
  }

  selectionLoadText({ isPipelineMode = true, clipCount = 0 }: { isPipelineMode?: boolean; clipCount?: number } = {}): string {
    return isPipelineMode ? loadedVideosText(clipCount) : collectionLoadedText(clipCount);
  }

  showInitialLoadStatus({ pipeline = null, clipCount = 0, timeout = 2500 }: { pipeline?: Pipeline | null; clipCount?: number; timeout?: number } = {}): void {
    this.statusBarControl?.show(this.initialLoadText({ pipeline, clipCount }), timeout);
  }

  showSelectionLoadStatus({ isPipelineMode = true, clipCount = 0, timeout = 2500 }: { isPipelineMode?: boolean; clipCount?: number; timeout?: number } = {}): void {
    this.statusBarControl?.show(this.selectionLoadText({ isPipelineMode, clipCount }), timeout);
  }
}

export function createLoadStatusControl(options?: ConstructorParameters<typeof LoadStatusControl>[0]): LoadStatusControl {
  return new LoadStatusControl(options);
}
