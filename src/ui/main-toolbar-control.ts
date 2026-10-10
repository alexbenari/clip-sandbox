import type { AppText } from '../app/app-text.js';
import { EventSource, type EventHandler, type IEventSource, type IEventSubscriberCount } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';
import { OrderMenuController } from './order-menu-controller.js';

export interface IMainToolbarEvents {
  browseRequested: void;
  saveRequested: void;
  saveAsNewRequested: void;
  addToCollectionRequested: void;
  deleteFromDiskRequested: void;
  toggleTitlesRequested: void;
  toggleFullscreenRequested: void;
}

export class MainToolbarControl implements IEventSource<IMainToolbarEvents>, IEventSubscriberCount<IMainToolbarEvents> {
  private readonly appText: Pick<AppText, 'countText'>;
  private readonly browseButton?: HTMLButtonElement;
  private readonly fullscreenButton?: HTMLButtonElement;
  private readonly events = new EventSource<IMainToolbarEvents>();
  private readonly buttonRequests: ReadonlyArray<readonly [HTMLButtonElement | null | undefined, EventListener]>;
  countEl: HTMLElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAsNewBtn: HTMLButtonElement | null;
  addToCollectionBtn: HTMLButtonElement | null;
  deleteFromDiskBtn: HTMLButtonElement | null;
  toggleTitlesBtn: HTMLButtonElement | null;

  // The Save, Save as, Add and Delete commands are items of the toolbar's Actions menu.
  static fromDocument(doc: Document, { appText }: { appText: Pick<AppText, 'countText'> }): MainToolbarControl {
    const elements = new DocumentElements(doc);
    OrderMenuController.fromDocument(doc);
    return new MainToolbarControl({
      appText,
      browseButton: elements.required<HTMLButtonElement>('pickBtn'),
      fullscreenButton: elements.required<HTMLButtonElement>('fsBtn'),
      countEl: elements.required('count'),
      saveBtn: elements.required<HTMLButtonElement>('saveBtn'),
      saveAsNewBtn: elements.required<HTMLButtonElement>('saveAsNewBtn'),
      addToCollectionBtn: elements.optional<HTMLButtonElement>('addToCollectionBtn'),
      deleteFromDiskBtn: elements.optional<HTMLButtonElement>('deleteFromDiskBtn'),
      toggleTitlesBtn: elements.required<HTMLButtonElement>('toggleTitlesBtn'),
    });
  }

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
    this.buttonRequests = [
      [this.browseButton, () => this.events.emit('browseRequested')],
      [this.saveBtn, () => this.events.emit('saveRequested')],
      [this.saveAsNewBtn, () => this.events.emit('saveAsNewRequested')],
      [this.addToCollectionBtn, () => this.events.emit('addToCollectionRequested')],
      [this.deleteFromDiskBtn, () => this.events.emit('deleteFromDiskRequested')],
      [this.toggleTitlesBtn, () => this.events.emit('toggleTitlesRequested')],
      [this.fullscreenButton, () => this.events.emit('toggleFullscreenRequested')],
    ];
    for (const [button, request] of this.buttonRequests) button?.addEventListener('click', request);
  }

  on<TName extends keyof IMainToolbarEvents>(name: TName, handler: EventHandler<IMainToolbarEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  subscriberCount(name: keyof IMainToolbarEvents): number {
    return this.events.subscriberCount(name);
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
    for (const [button, request] of this.buttonRequests) button?.removeEventListener('click', request);
  }
}
