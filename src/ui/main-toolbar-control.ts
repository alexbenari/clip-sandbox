// @ts-nocheck
import { countText, niceNum } from '../app/app-text.js';

export class MainToolbarControl {
  constructor({
    countEl,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
  } = {}) {
    this.countEl = countEl;
    this.saveBtn = saveBtn;
    this.saveAsNewBtn = saveAsNewBtn;
    this.addToCollectionBtn = addToCollectionBtn;
    this.deleteFromDiskBtn = deleteFromDiskBtn;
    this.toggleTitlesBtn = toggleTitlesBtn;
  }

  render({
    clipCount = 0,
    hasPipeline = false,
    hasSequence = false,
    hasSelection = false,
    isPipelineMode = true,
    titlesHidden = false,
  } = {}) {
    const normalizedClipCount = Number.isFinite(clipCount) ? Math.max(0, clipCount) : 0;

    if (this.countEl) {
      this.countEl.textContent = countText(normalizedClipCount, niceNum);
    }

    if (this.saveBtn) {
      this.saveBtn.disabled = !!isPipelineMode || normalizedClipCount === 0;
    }

    if (this.saveAsNewBtn) {
      this.saveAsNewBtn.disabled = !hasSequence || normalizedClipCount === 0;
      this.saveAsNewBtn.textContent = isPipelineMode ? 'Save as Collection' : 'Save Collection As...';
      this.saveAsNewBtn.title = isPipelineMode
        ? 'Save the current pipeline view as a new collection file'
        : 'Save the current collection as another collection file';
    }

    if (this.addToCollectionBtn) {
      this.addToCollectionBtn.disabled = !hasPipeline || !hasSelection;
    }

    if (this.deleteFromDiskBtn) {
      this.deleteFromDiskBtn.disabled = !hasPipeline || !hasSelection;
    }

    if (this.toggleTitlesBtn) {
      this.toggleTitlesBtn.textContent = titlesHidden ? 'Show Titles' : 'Hide Titles';
    }
  }
}

export function createMainToolbarControl(options) {
  return new MainToolbarControl(options);
}
