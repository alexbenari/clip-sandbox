import type { AppText } from '../app/app-text.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';
import { EventSource, type EventHandler, type IEventSource, type IEventSubscriberCount } from '../app/event-source.js';

export interface ICollectionSelectorEvents {
  selectionRequested: string | null;
}

type SelectorChoice = {
  label: string;
  value: string | null;
  collectionFilename?: string | null;
};

export class CollectionSelectorControl implements IEventSource<ICollectionSelectorEvents>, IEventSubscriberCount<ICollectionSelectorEvents> {
  private readonly appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
  private readonly events = new EventSource<ICollectionSelectorEvents>();
  selectEl: HTMLSelectElement | null;
  doc: Document;
  pipelineSelectionValue: string;
  defaultTitle: string;
  onChange: (event: Event) => void;

  constructor({
    appText,
    selectEl,
    doc = document,
    pipelineSelectionValue = '__pipeline__',
    defaultTitle = '',
  }: {
    appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
    selectEl?: HTMLSelectElement | null;
    doc?: Document;
    pipelineSelectionValue?: string;
    defaultTitle?: string;
  }) {
    this.appText = appText;
    this.selectEl = selectEl || null;
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

  subscriberCount(name: keyof ICollectionSelectorEvents): number {
    return this.events.subscriberCount(name);
  }

  render({
    pipeline = null,
    activeCollection = null,
    currentClipSequence = null,
  }: {
    pipeline?: Pipeline | null;
    activeCollection?: Collection | null;
    currentClipSequence?: ClipSequence | null;
  } = {}): void {
    if (!(this.selectEl instanceof HTMLSelectElement)) return;

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

  destroy(): void {
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
