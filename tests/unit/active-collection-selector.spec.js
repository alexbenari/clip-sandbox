import { afterEach, describe, expect, test } from 'vitest';
import { renderActiveCollectionSelector } from '../../src/ui/active-collection-selector.js';

describe('active collection selector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('renders a disabled placeholder when there are no options', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const selectEl = document.getElementById('select');

    renderActiveCollectionSelector({
      selectEl,
      options: [],
      label: 'Local Video Grid Reviewer',
      defaultTitle: 'Local Video Grid Reviewer',
    });

    expect(selectEl.disabled).toBe(true);
    expect(selectEl.value).toBe('');
    expect(selectEl.options[0].textContent).toBe('Local Video Grid Reviewer');
  });

  test('renders supplied options and selects the active value', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const selectEl = document.getElementById('select');

    renderActiveCollectionSelector({
      selectEl,
      options: [
        { label: 'clips-default', value: '__default__' },
        { label: 'subset', value: 'subset.txt' },
      ],
      selectedValue: 'subset.txt',
      label: 'subset',
      defaultTitle: 'Local Video Grid Reviewer',
    });

    expect(selectEl.disabled).toBe(false);
    expect(Array.from(selectEl.options).map((option) => option.textContent)).toEqual(['clips-default', 'subset']);
    expect(selectEl.value).toBe('subset.txt');
  });
});
