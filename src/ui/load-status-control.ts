// @ts-nocheck
import { collectionLoadedText, loadedVideosText } from '../app/app-text.js';

export class LoadStatusControl {
  constructor({
    statusBarControl,
  } = {}) {
    this.statusBarControl = statusBarControl;
  }

  initialLoadText({ pipeline = null, clipCount = 0 } = {}) {
    if (pipeline?.videoNames?.().length === 0) {
      return 'No video files found in the selected folder.';
    }
    return loadedVideosText(clipCount);
  }

  selectionLoadText({ isPipelineMode = true, clipCount = 0 } = {}) {
    return isPipelineMode ? loadedVideosText(clipCount) : collectionLoadedText(clipCount);
  }

  showInitialLoadStatus({ pipeline = null, clipCount = 0, timeout = 2500 } = {}) {
    this.statusBarControl?.show(this.initialLoadText({ pipeline, clipCount }), timeout);
  }

  showSelectionLoadStatus({ isPipelineMode = true, clipCount = 0, timeout = 2500 } = {}) {
    this.statusBarControl?.show(this.selectionLoadText({ isPipelineMode, clipCount }), timeout);
  }
}

export function createLoadStatusControl(options) {
  return new LoadStatusControl(options);
}
