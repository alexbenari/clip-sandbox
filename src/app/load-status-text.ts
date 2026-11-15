import type { AppText } from './app-text.js';

export class LoadStatusText {
  constructor(private readonly appText: Pick<AppText, 'collectionLoadedText' | 'loadedVideosText'>) {}

  selectionLoaded(isPipelineMode: boolean, clipCount: number): string {
    return isPipelineMode
      ? this.appText.loadedVideosText(clipCount)
      : this.appText.collectionLoadedText(clipCount);
  }
}
