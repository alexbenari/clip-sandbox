import type { AppText } from '../app/app-text.js';

export class MainToolbarControl {
  private readonly appText: Pick<AppText, 'countText'>;
  private readonly browseButton?: HTMLButtonElement;
  private readonly fullscreenButton?: HTMLButtonElement;
  private readonly onBrowse: EventListener;
  private readonly onSave: EventListener;
  private readonly onSaveAsNew: EventListener;
  private readonly onAddToCollection: EventListener;
  private readonly onDeleteFromDisk: EventListener;
  private readonly onToggleTitles: EventListener;
  private readonly onToggleFullscreen: EventListener;
  countEl: HTMLElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAsNewBtn: HTMLButtonElement | null;
  addToCollectionBtn: HTMLButtonElement | null;
  deleteFromDiskBtn: HTMLButtonElement | null;
  toggleTitlesBtn: HTMLButtonElement | null;

  constructor({
    appText,
    browseButton,
    fullscreenButton,
    countEl,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
    onBrowse = () => {},
    onSave = () => {},
    onSaveAsNew = () => {},
    onAddToCollection = () => {},
    onDeleteFromDisk = () => {},
    onToggleTitles = () => {},
    onToggleFullscreen = () => {},
  }: {
    appText: Pick<AppText, 'countText'>;
    browseButton?: HTMLButtonElement;
    fullscreenButton?: HTMLButtonElement;
    countEl?: HTMLElement | null;
    saveBtn?: HTMLButtonElement | null;
    saveAsNewBtn?: HTMLButtonElement | null;
    addToCollectionBtn?: HTMLButtonElement | null;
    deleteFromDiskBtn?: HTMLButtonElement | null;
    toggleTitlesBtn?: HTMLButtonElement | null;
    onBrowse?: () => void;
    onSave?: () => void;
    onSaveAsNew?: () => void;
    onAddToCollection?: () => void;
    onDeleteFromDisk?: () => void;
    onToggleTitles?: () => void;
    onToggleFullscreen?: () => void;
  }) {
    this.appText = appText;
    this.browseButton = browseButton;
    this.fullscreenButton = fullscreenButton;
    this.countEl = countEl || null;
    this.saveBtn = saveBtn || null;
    this.saveAsNewBtn = saveAsNewBtn || null;
    this.addToCollectionBtn = addToCollectionBtn || null;
    this.deleteFromDiskBtn = deleteFromDiskBtn || null;
    this.toggleTitlesBtn = toggleTitlesBtn || null;
    this.onBrowse = onBrowse;
    this.onSave = onSave;
    this.onSaveAsNew = onSaveAsNew;
    this.onAddToCollection = onAddToCollection;
    this.onDeleteFromDisk = onDeleteFromDisk;
    this.onToggleTitles = onToggleTitles;
    this.onToggleFullscreen = onToggleFullscreen;

    this.browseButton?.addEventListener('click', this.onBrowse);
    this.saveBtn?.addEventListener('click', this.onSave);
    this.saveAsNewBtn?.addEventListener('click', this.onSaveAsNew);
    this.addToCollectionBtn?.addEventListener('click', this.onAddToCollection);
    this.deleteFromDiskBtn?.addEventListener('click', this.onDeleteFromDisk);
    this.toggleTitlesBtn?.addEventListener('click', this.onToggleTitles);
    this.fullscreenButton?.addEventListener('click', this.onToggleFullscreen);
  }

  setFullscreenButtonState(active: boolean): void {
    if (!this.fullscreenButton) return;
    const label = active ? 'Exit Full Screen' : 'Full Screen';
    (this.fullscreenButton.querySelector('.command-label') ?? this.fullscreenButton).textContent = label;
    this.fullscreenButton.setAttribute('aria-label', label);
  }

  focusBrowse(): void { this.browseButton?.focus({ preventScroll: true }); }

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
      this.countEl.textContent = this.appText.countText(normalizedClipCount);
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
      const label = this.toggleTitlesBtn.querySelector('.command-label') ?? this.toggleTitlesBtn;
      label.textContent = titlesHidden ? 'Show Titles' : 'Hide Titles';
      this.toggleTitlesBtn.setAttribute('aria-label', titlesHidden ? 'Show Titles' : 'Hide Titles');
      this.toggleTitlesBtn.setAttribute('aria-pressed', String(titlesHidden));
    }

  }

  destroy(): void {
    this.browseButton?.removeEventListener('click', this.onBrowse);
    this.saveBtn?.removeEventListener('click', this.onSave);
    this.saveAsNewBtn?.removeEventListener('click', this.onSaveAsNew);
    this.addToCollectionBtn?.removeEventListener('click', this.onAddToCollection);
    this.deleteFromDiskBtn?.removeEventListener('click', this.onDeleteFromDisk);
    this.toggleTitlesBtn?.removeEventListener('click', this.onToggleTitles);
    this.fullscreenButton?.removeEventListener('click', this.onToggleFullscreen);
  }
}
