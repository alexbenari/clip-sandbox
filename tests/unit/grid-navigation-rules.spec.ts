import { describe, expect, it } from 'vitest';

import { GridNavigationRules } from '../../src/ui/grid-navigation-rules.js';

// Seven cards in three columns: rows [0, 1, 2], [3, 4, 5], [6].
const rules = new GridNavigationRules();
const target = (key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', index: number) =>
  rules.targetIndex({ key, index, columns: 3, count: 7 });

describe('GridNavigationRules', () => {
  it('moves left and right through the cards in reading order, across row ends', () => {
    expect([target('ArrowRight', 2), target('ArrowLeft', 3)]).toEqual([3, 2]);
  });

  it('moves up and down by one row', () => {
    expect([target('ArrowDown', 1), target('ArrowUp', 4)]).toEqual([4, 1]);
  });

  it('moves down from above a shorter last row to the last card', () => {
    expect(target('ArrowDown', 5)).toBe(6);
  });

  it('stays put at the edges of the grid', () => {
    expect([target('ArrowLeft', 0), target('ArrowUp', 2), target('ArrowRight', 6), target('ArrowDown', 6)])
      .toEqual([null, null, null, null]);
  });

  it('recognizes only the four arrow keys', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].map(key => rules.isArrowKey(key)))
      .toEqual([true, true, true, true, false, false]);
  });
});
