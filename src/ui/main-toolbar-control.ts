import { countText, niceNum } from '../app/app-text.js';

export class MainToolbarControl {
  countEl: HTMLElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAsNewBtn: HTMLButtonElement | null;
  addToCollectionBtn: HTMLButtonElement | null;
  deleteFromDiskBtn: HTMLButtonElement | null;
  toggleTitlesBtn: HTMLButtonElement | null;
  activityButton: HTMLButtonElement | null;

  constructor({
    countEl,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
    activityButton = null,
  }: {
    countEl?: HTMLElement | null;
    saveBtn?: HTMLButtonElement | null;
    saveAsNewBtn?: HTMLButtonElement | null;
    addToCollectionBtn?: HTMLButtonElement | null;
    deleteFromDiskBtn?: HTMLButtonElement | null;
    toggleTitlesBtn?: HTMLButtonElement | null;
    activityButton?: HTMLButtonElement | null;
  } = {}) {
    this.countEl = countEl || null;
    this.saveBtn = saveBtn || null;
    this.saveAsNewBtn = saveAsNewBtn || null;
    this.addToCollectionBtn = addToCollectionBtn || null;
    this.deleteFromDiskBtn = deleteFromDiskBtn || null;
    this.toggleTitlesBtn = toggleTitlesBtn || null;
    this.activityButton = activityButton || null;
  }

  render({
    clipCount = 0,
    hasPipeline = false,
    hasSequence = false,
    hasSelection = false,
    isPipelineMode = true,
    titlesHidden = false,
  }: {
    clipCount?: number;
    hasPipeline?: boolean;
    hasSequence?: boolean;
    hasSelection?: boolean;
    isPipelineMode?: boolean;
    titlesHidden?: boolean;
  } = {}): void {
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

export function createMainToolbarControl(options?: ConstructorParameters<typeof MainToolbarControl>[0]): MainToolbarControl {
  return new MainToolbarControl(options);
}
