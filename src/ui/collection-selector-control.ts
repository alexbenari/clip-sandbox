// @ts-nocheck
import { activeCollectionText, activeCollectionTabText } from '../app/app-text.js';

function selectorOptions(pipeline, pipelineSelectionValue) {
  if (!pipeline) return [];
  return [
    {
      label: pipeline.displayLabel(),
      value: pipelineSelectionValue,
    },
    ...pipeline.collections().map((collection) => ({
      label: collection.collectionName,
      value: collection.filename,
      collectionFilename: collection.filename,
    })),
  ];
}

function currentSequenceName({ currentClipSequence = null, activeCollection = null, pipeline = null } = {}) {
  return currentClipSequence?.name
    || activeCollection?.collectionName
    || pipeline?.folderName
    || '';
}

export class CollectionSelectorControl {
  constructor({
    selectEl,
    doc = document,
    pipelineSelectionValue = '__pipeline__',
    defaultTitle = '',
    onSelectionRequested = () => {},
  } = {}) {
    this.selectEl = selectEl;
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
  } = {}) {
    if (!(this.selectEl instanceof HTMLSelectElement)) return;

    const sequenceName = currentSequenceName({ currentClipSequence, activeCollection, pipeline });
    const label = activeCollectionText(sequenceName);
    const options = selectorOptions(pipeline, this.pipelineSelectionValue);
    const selectedValue = activeCollection?.filename || this.pipelineSelectionValue;

    if (this.doc) {
      this.doc.title = activeCollectionTabText(sequenceName);
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

  destroy() {
    this.selectEl?.removeEventListener('change', this.onChange);
  }
}

export function createCollectionSelectorControl(options) {
  return new CollectionSelectorControl(options);
}
