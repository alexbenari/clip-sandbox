import { describe, expect, it } from 'vitest';

import { GridSelection } from '../../src/ui/grid-selection.js';

const order = ['a', 'b', 'c', 'd', 'e'];
const selected = (selection: GridSelection) => order.filter(clipId => selection.has(clipId));

describe('GridSelection', () => {
  it('extends from the clip selected on its own to the clip asked for, in either direction', () => {
    const selection = new GridSelection();
    selection.selectOnly('c');

    selection.extendTo(order, 'c', 'e');
    expect(selected(selection)).toEqual(['c', 'd', 'e']);
    selection.extendTo(order, 'e', 'a');
    expect(selected(selection)).toEqual(['a', 'b', 'c']);
  });

  it('extends from the clip last toggled', () => {
    const selection = new GridSelection();
    selection.selectOnly('a');
    selection.toggle('d');

    selection.extendTo(order, 'a', 'e');

    expect(selected(selection)).toEqual(['d', 'e']);
  });

  it.each([
    ['nothing was selected', (_selection: GridSelection) => undefined],
    ['the selection was cleared', (selection: GridSelection) => { selection.selectOnly('a'); selection.clear(); }],
    ['the clip it started from is no longer shown', (selection: GridSelection) => {
      selection.selectOnly('a');
      selection.retainWhere(clipId => clipId !== 'a');
    }],
  ])('extends from the fallback clip when %s', (_case, before) => {
    const selection = new GridSelection();
    before(selection);

    selection.extendTo(order, 'c', 'd');

    expect(selected(selection)).toEqual(['c', 'd']);
  });

  it('keeps only the clips still shown', () => {
    const selection = new GridSelection();
    selection.selectOnly('a');
    selection.toggle('b');

    selection.retainWhere(clipId => clipId === 'b');

    expect(selected(selection)).toEqual(['b']);
  });
});
