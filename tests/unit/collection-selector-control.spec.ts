// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CollectionSelectorControl } from '../../src/ui/collection-selector-control.js';

describe('collection selector control', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  test('renders a disabled placeholder when there is no pipeline', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const control = new CollectionSelectorControl({
      selectEl: document.getElementById('select'),
      doc: document,
      pipelineSelectionValue: '__pipeline__',
      defaultTitle: 'Local Video Grid Reviewer',
    });

    control.render({
      pipeline: null,
      activeCollection: null,
      currentClipSequence: null,
    });

    const selectEl = document.getElementById('select');
    expect(selectEl.disabled).toBe(true);
    expect(selectEl.value).toBe('');
    expect(selectEl.options[0].textContent).toBe('Local Video Grid Reviewer');
    expect(document.title).toBe('Local Video Grid Reviewer');
  });

  test('renders pipeline and collection options and selects the active collection', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const pipeline = {
      displayLabel: () => 'clips',
      collections: () => [
        { collectionName: 'subset', filename: 'subset.txt' },
      ],
      folderName: 'clips',
    };
    const control = new CollectionSelectorControl({
      selectEl: document.getElementById('select'),
      doc: document,
      pipelineSelectionValue: '__pipeline__',
      defaultTitle: 'Local Video Grid Reviewer',
    });

    control.render({
      pipeline,
      activeCollection: { collectionName: 'subset', filename: 'subset.txt' },
      currentClipSequence: { name: 'subset' },
    });

    const selectEl = document.getElementById('select');
    expect(selectEl.disabled).toBe(false);
    expect(Array.from(selectEl.options).map((option) => option.textContent)).toEqual(['clips', 'subset']);
    expect(selectEl.value).toBe('subset.txt');
    expect(document.title).toBe('subset');
  });

  test('emits selection requests from the change event', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const onSelectionRequested = vi.fn();
    const pipeline = {
      displayLabel: () => 'clips',
      collections: () => [
        { collectionName: 'subset', filename: 'subset.txt' },
      ],
      folderName: 'clips',
    };
    const control = new CollectionSelectorControl({
      selectEl: document.getElementById('select'),
      doc: document,
      pipelineSelectionValue: '__pipeline__',
      defaultTitle: 'Local Video Grid Reviewer',
      onSelectionRequested,
    });

    control.render({ pipeline, activeCollection: null, currentClipSequence: { name: 'clips' } });
    const selectEl = document.getElementById('select');
    selectEl.value = 'subset.txt';
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.value = '__pipeline__';
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onSelectionRequested).toHaveBeenNthCalledWith(1, 'subset.txt');
    expect(onSelectionRequested).toHaveBeenNthCalledWith(2, null);
  });
});
