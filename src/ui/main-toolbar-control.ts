import type { AppText } from '../app/app-text.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';
import { OrderMenuControl } from './order-menu-control.js';

export interface IMainToolbarEvents {
  browseRequested: void;
  saveRequested: void;
  saveAsNewRequested: void;
  addToCollectionRequested: void;
  trashSelectedRequested: void;
  toggleTitlesRequested: void;
  toggleFullscreenRequested: void;
}

export class MainToolbarControl implements IEventSource<IMainToolbarEvents> {
  private readonly appText: Pick<AppText, 'countText'>;
  private readonly browseButton?: HTMLButtonElement;
  private readonly fullscreenButton?: HTMLButtonElement;
  private readonly saveChangesButton: HTMLButtonElement | null;
  private readonly events = new EventSource<IMainToolbarEvents>();
  private readonly orderMenu: OrderMenuControl | null;
  private readonly buttonRequests: ReadonlyArray<readonly [HTMLButtonElement | null | undefined, EventListener]>;
  countEl: HTMLElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAsNewBtn: HTMLButtonElement | null;
  addToCollectionBtn: HTMLButtonElement | null;
  trashSelectedBtn: HTMLButtonElement | null;
  toggleTitlesBtn: HTMLButtonElement | null;

  // The Save, Save as, Add and Recycle Bin commands are items of the toolbar's Actions menu.
  static fromDocument(doc: Document, { appText }: { appText: Pick<AppText, 'countText'> }): MainToolbarControl {
    const elements = new DocumentElements(doc);
    return new MainToolbarControl({
      appText,
      orderMenu: OrderMenuControl.fromDocument(doc),
      browseButton: elements.required<HTMLButtonElement>('pickBtn'),
      fullscreenButton: elements.required<HTMLButtonElement>('fsBtn'),
      saveChangesButton: elements.required<HTMLButtonElement>('saveChangesBtn'),
      countEl: elements.required('count'),
      saveBtn: elements.required<HTMLButtonElement>('saveBtn'),
      saveAsNewBtn: elements.required<HTMLButtonElement>('saveAsNewBtn'),
      addToCollectionBtn: elements.optional<HTMLButtonElement>('addToCollectionBtn'),
      trashSelectedBtn: elements.optional<HTMLButtonElement>('trashSelectedBtn'),
      toggleTitlesBtn: elements.required<HTMLButtonElement>('toggleTitlesBtn'),
    });
  }

  constructor({
    appText,
    browseButton,
    fullscreenButton,
    saveChangesButton,
    countEl,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    trashSelectedBtn,
    toggleTitlesBtn,
    orderMenu,
  }: {
    appText: Pick<AppText, 'countText'>;
    orderMenu?: OrderMenuControl;
    browseButton?: HTMLButtonElement;
    fullscreenButton?: HTMLButtonElement;
    saveChangesButton?: HTMLButtonElement | null;
    countEl?: HTMLElement | null;
    saveBtn?: HTMLButtonElement | null;
    saveAsNewBtn?: HTMLButtonElement | null;
    addToCollectionBtn?: HTMLButtonElement | null;
    trashSelectedBtn?: HTMLButtonElement | null;
    toggleTitlesBtn?: HTMLButtonElement | null;
  }) {
    this.appText = appText;
    this.browseButton = browseButton;
    this.fullscreenButton = fullscreenButton;
    this.saveChangesButton = saveChangesButton || null;
    if (this.saveChangesButton) this.saveChangesButton.hidden = true;
    this.countEl = countEl || null;
    this.saveBtn = saveBtn || null;
    this.saveAsNewBtn = saveAsNewBtn || null;
    this.addToCollectionBtn = addToCollectionBtn || null;
    this.trashSelectedBtn = trashSelectedBtn || null;
    this.toggleTitlesBtn = toggleTitlesBtn || null;
    this.orderMenu = orderMenu ?? null;
    this.buttonRequests = [
      [this.browseButton, () => this.events.emit('browseRequested')],
      [this.saveBtn, () => this.events.emit('saveRequested')],
      [this.saveChangesButton, () => this.events.emit('saveRequested')],
      [this.saveAsNewBtn, () => this.events.emit('saveAsNewRequested')],
      [this.addToCollectionBtn, () => this.events.emit('addToCollectionRequested')],
      [this.trashSelectedBtn, () => this.events.emit('trashSelectedRequested')],
      [this.toggleTitlesBtn, () => this.events.emit('toggleTitlesRequested')],
      [this.fullscreenButton, () => this.events.emit('toggleFullscreenRequested')],
    ];
    for (const [button, request] of this.buttonRequests) button?.addEventListener('click', request);
  }

  on<TName extends keyof IMainToolbarEvents>(name: TName, handler: EventHandler<IMainToolbarEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }
  setFullscreenButtonState(active: boolean): void {
    if (!this.fullscreenButton) return;
    const label = active ? 'Exit full screen' : 'Full screen';
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
    hasUnsavedChanges = false,
  }: {
    clipCount?: number;
    hasPipeline?: boolean;
    hasSequence?: boolean;
    hasSelection?: boolean;
    isPipelineMode?: boolean;
    titlesHidden?: boolean;
    hasUnsavedChanges?: boolean;
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
      this.saveAsNewBtn.textContent = isPipelineMode ? 'Save as collection…' : 'Save collection as…';
      this.saveAsNewBtn.title = isPipelineMode
        ? 'Save the current pipeline view as a new collection file'
        : 'Save the current collection as another collection file';
    }

    if (this.addToCollectionBtn) {
      this.addToCollectionBtn.disabled = !hasPipeline || !hasSelection;
    }

    if (this.trashSelectedBtn) {
      this.trashSelectedBtn.disabled = !hasPipeline || !hasSelection;
    }

    if (this.toggleTitlesBtn) {
      const label = this.toggleTitlesBtn.querySelector('.command-label') ?? this.toggleTitlesBtn;
      label.textContent = titlesHidden ? 'Show titles' : 'Hide titles';
      this.toggleTitlesBtn.setAttribute('aria-label', titlesHidden ? 'Show titles' : 'Hide titles');
      this.toggleTitlesBtn.setAttribute('aria-pressed', String(titlesHidden));
    }

    this.renderSaveChanges(hasUnsavedChanges, isPipelineMode);
  }

  private renderSaveChanges(hasUnsavedChanges: boolean, isPipelineMode: boolean): void {
    if (!this.saveChangesButton) return;
    this.saveChangesButton.hidden = !hasUnsavedChanges;
    const label = this.saveChangesButton.querySelector('.command-label') ?? this.saveChangesButton;
    label.textContent = isPipelineMode ? 'Save…' : 'Save';
    this.saveChangesButton.title = isPipelineMode ? 'Save this order as a new collection' : 'Save the changes to this collection';
  }

  destroy(): void {
    for (const [button, request] of this.buttonRequests) button?.removeEventListener('click', request);
    this.orderMenu?.destroy();
  }
}
