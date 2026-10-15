import type { Pipeline } from '../domain/pipeline.js';
import type { AppText } from './app-text.js';

export class LoadStatusText {
  constructor(private readonly appText: Pick<AppText, 'collectionLoadedText' | 'loadedVideosText'>) {}

  folderLoaded(pipeline: Pick<Pipeline, 'videoNames'>, clipCount: number): string {
    if (pipeline.videoNames().length === 0) return 'No video files found in the selected folder.';
    return this.appText.loadedVideosText(clipCount);
  }

  selectionLoaded(isPipelineMode: boolean, clipCount: number): string {
    return isPipelineMode
      ? this.appText.loadedVideosText(clipCount)
      : this.appText.collectionLoadedText(clipCount);
  }
}
