import type { AppText } from '../app/app-text.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';

export interface ICollectionSelectorEvents {
  selectionRequested: string | null;
}

type SelectorChoice = {
  label: string;
  value: string | null;
  collectionFilename?: string | null;
};

export class CollectionSelectorControl implements IEventSource<ICollectionSelectorEvents> {
  private readonly appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
  private readonly events = new EventSource<ICollectionSelectorEvents>();
  selectEl: HTMLSelectElement | null;
  private readonly unsavedChangesMarker: HTMLElement | null;
  doc: Document;
  pipelineSelectionValue: string;
  defaultTitle: string;
  onChange: (event: Event) => void;

  static fromDocument(doc: Document, { appText, defaultTitle }: {
    appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
    defaultTitle?: string;
  }): CollectionSelectorControl {
    const elements = new DocumentElements(doc);
    return new CollectionSelectorControl({
      appText,
      selectEl: elements.required<HTMLSelectElement>('activeCollectionName'),
      unsavedChangesMarker: elements.required('unsavedChangesMarker'),
      doc,
      defaultTitle,
    });
  }

  constructor({
    appText,
    selectEl,
    unsavedChangesMarker = null,
    doc = document,
    pipelineSelectionValue = '__pipeline__',
    defaultTitle = '',
  }: {
    appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
    selectEl?: HTMLSelectElement | null;
    unsavedChangesMarker?: HTMLElement | null;
    doc?: Document;
    pipelineSelectionValue?: string;
    defaultTitle?: string;
  }) {
    this.appText = appText;
    this.selectEl = selectEl || null;
    this.unsavedChangesMarker = unsavedChangesMarker;
    if (this.unsavedChangesMarker) {
      this.unsavedChangesMarker.textContent = 'Unsaved';
      this.unsavedChangesMarker.hidden = true;
    }
    this.doc = doc;
    this.pipelineSelectionValue = pipelineSelectionValue;
    this.defaultTitle = defaultTitle;
    this.onChange = (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      const collectionFilename = event.target.value === this.pipelineSelectionValue
        ? null
        : String(event.target.value || '').trim() || null;
      this.events.emit('selectionRequested', collectionFilename);
    };

    this.selectEl?.addEventListener('change', this.onChange);
  }

  on<TName extends keyof ICollectionSelectorEvents>(name: TName, handler: EventHandler<ICollectionSelectorEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  render({
    pipeline = null,
    activeCollection = null,
    currentClipSequence = null,
    hasUnsavedChanges = false,
  }: {
    pipeline?: Pipeline | null;
    activeCollection?: Collection | null;
    currentClipSequence?: ClipSequence | null;
    hasUnsavedChanges?: boolean;
  } = {}): void {
    if (!(this.selectEl instanceof HTMLSelectElement)) return;
    this.renderUnsavedChanges(hasUnsavedChanges);

    const sequenceName = this.currentSequenceName({ currentClipSequence, activeCollection, pipeline });
    const label = this.appText.activeCollectionText(sequenceName);
    const options = this.selectorOptions(pipeline);
    const selectedValue = activeCollection?.filename || this.pipelineSelectionValue;

    if (this.doc) {
      this.doc.title = this.appText.activeCollectionTabText(sequenceName);
    }

    this.selectEl.innerHTML = '';
    if (options.length === 0) {
      const option = this.doc.createElement('option');
      option.value = '';
      option.textContent = label || this.defaultTitle;
      this.selectEl.appendChild(option);
      this.selectEl.disabled = true;
      this.selectEl.value = '';
      this.selectEl.title = option.textContent;
      return;
    }

    for (const choice of Array.from(options)) {
      const option = this.doc.createElement('option');
      option.value = choice?.value || '';
      option.textContent = choice?.label || '';
      this.selectEl.appendChild(option);
    }

    this.selectEl.disabled = false;
    this.selectEl.value = selectedValue;
    this.selectEl.title = label || this.defaultTitle;
  }

  private renderUnsavedChanges(hasUnsavedChanges: boolean): void {
    if (!this.unsavedChangesMarker) return;
    this.unsavedChangesMarker.hidden = !hasUnsavedChanges;
    if (hasUnsavedChanges) this.selectEl?.setAttribute('aria-describedby', this.unsavedChangesMarker.id);
    else this.selectEl?.removeAttribute('aria-describedby');
  }

  dispose(): void {
    this.selectEl?.removeEventListener('change', this.onChange);
  }

  private selectorOptions(pipeline: Pipeline | null): SelectorChoice[] {
    if (!pipeline) return [];
    return [
      { label: pipeline.displayLabel(), value: this.pipelineSelectionValue },
      ...pipeline.collections().map(collection => ({
        label: collection.collectionName,
        value: collection.filename,
        collectionFilename: collection.filename,
      })),
    ];
  }

  private currentSequenceName({ currentClipSequence, activeCollection, pipeline }: {
    currentClipSequence: ClipSequence | null;
    activeCollection: Collection | null;
    pipeline: Pipeline | null;
  }): string {
    return currentClipSequence?.name
      || activeCollection?.collectionName
      || pipeline?.folderName
      || '';
  }
}
