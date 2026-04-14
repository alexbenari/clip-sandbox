import { afterEach, describe, expect, test } from 'vitest';
import { renderActiveSourceSelector } from '../../src/ui/active-source-selector.js';

describe('active source selector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('renders a disabled placeholder when there are no options', () => {
    document.body.innerHTML = '<select id="select"></select>';
    const selectEl = document.getElementById('select');

    renderActiveSourceSelector({
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

    renderActiveSourceSelector({
      selectEl,
      options: [
        { label: 'clips', value: '__pipeline__' },
        { label: 'subset', value: 'subset.txt' },
      ],
      selectedValue: 'subset.txt',
      label: 'subset',
      defaultTitle: 'Local Video Grid Reviewer',
    });

    expect(selectEl.disabled).toBe(false);
    expect(Array.from(selectEl.options).map((option) => option.textContent)).toEqual(['clips', 'subset']);
    expect(selectEl.value).toBe('subset.txt');
  });
});
