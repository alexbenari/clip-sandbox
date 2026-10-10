import type { AppText } from '../app/app-text.js';
import type { Pipeline } from '../domain/pipeline.js';

type SuccessReporter = {
  success(message: string, timeoutMs?: number): void;
};

export class LoadStatusControl {
  private readonly appText: Pick<AppText, 'collectionLoadedText' | 'loadedVideosText'>;
  private readonly reporter: SuccessReporter | null;

  constructor({ appText, reporter = null }: {
    appText: Pick<AppText, 'collectionLoadedText' | 'loadedVideosText'>;
    reporter?: SuccessReporter | null;
  }) {
    this.appText = appText;
    this.reporter = reporter;
  }

  initialLoadText({ pipeline = null, clipCount = 0 }: { pipeline?: Pipeline | null; clipCount?: number } = {}): string {
    if (pipeline?.videoNames?.().length === 0) {
      return 'No video files found in the selected folder.';
    }
    return this.appText.loadedVideosText(clipCount);
  }

  selectionLoadText({ isPipelineMode = true, clipCount = 0 }: { isPipelineMode?: boolean; clipCount?: number } = {}): string {
    return isPipelineMode
      ? this.appText.loadedVideosText(clipCount)
      : this.appText.collectionLoadedText(clipCount);
  }

  showInitialLoadStatus({ pipeline = null, clipCount = 0, timeout = 2500 }: { pipeline?: Pipeline | null; clipCount?: number; timeout?: number } = {}): void {
    this.reporter?.success(this.initialLoadText({ pipeline, clipCount }), timeout);
  }

  showSelectionLoadStatus({ isPipelineMode = true, clipCount = 0, timeout = 2500 }: { isPipelineMode?: boolean; clipCount?: number; timeout?: number } = {}): void {
    this.reporter?.success(this.selectionLoadText({ isPipelineMode, clipCount }), timeout);
  }
}
