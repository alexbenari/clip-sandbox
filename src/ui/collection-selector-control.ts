import type { AppText } from '../app/app-text.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';

type SelectorChoice = {
  label: string;
  value: string | null;
  collectionFilename?: string | null;
};

export class CollectionSelectorControl {
  private readonly appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
  selectEl: HTMLSelectElement | null;
  doc: Document;
  pipelineSelectionValue: string;
  defaultTitle: string;
  onSelectionRequested: (collectionFilename: string | null) => void;
  onChange: (event: Event) => void;

  constructor({
    appText,
    selectEl,
    doc = document,
    pipelineSelectionValue = '__pipeline__',
    defaultTitle = '',
    onSelectionRequested = () => {},
  }: {
    appText: Pick<AppText, 'activeCollectionText' | 'activeCollectionTabText'>;
    selectEl?: HTMLSelectElement | null;
    doc?: Document;
    pipelineSelectionValue?: string;
    defaultTitle?: string;
    onSelectionRequested?: (collectionFilename: string | null) => void;
  }) {
    this.appText = appText;
    this.selectEl = selectEl || null;
    this.doc = doc;
    this.pipelineSelectionValue = pipelineSelectionValue;
    this.defaultTitle = defaultTitle;
    this.onSelectionRequested = onSelectionRequested;
    this.onChange = (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      const collectionFilename = event.target.value === this.pipelineSelectionValue
        ? null
        : String(event.target.value || '').trim() || null;
      this.onSelectionRequested(collectionFilename);
    };

    this.selectEl?.addEventListener('change', this.onChange);
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
