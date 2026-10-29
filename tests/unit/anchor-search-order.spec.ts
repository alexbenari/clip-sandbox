// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { AnchorSearchOrder } = require('../../electron/anchor-search-order.cjs');

const everyFrame = (frameCount: number) => Array.from({ length: frameCount }, (_, index) => index);

describe('AnchorSearchOrder', () => {
  it('reads outward from the estimate, after it first', () => {
    expect([...AnchorSearchOrder.outward(4, 8)]).toEqual([4, 5, 3, 6, 2, 7, 1, 0]);
  });

  it('starts at the nearest window edge when the estimate lies outside the window', () => {
    expect([...AnchorSearchOrder.outward(-30, 4)]).toEqual([0, 1, 2, 3]);
  });

  it('reads the stretches a widened window added, nearest the previous window first, before the frames it held', () => {
    expect([...AnchorSearchOrder.widened(5, 10, 3, 6)]).toEqual([2, 7, 1, 8, 0, 9, 5, 6, 4, 3]);
  });

  it.each([
    ['outward', [...AnchorSearchOrder.outward(17, 50)]],
    ['widened', [...AnchorSearchOrder.widened(17, 50, 10, 30)]],
    ['widened past the window edge', [...AnchorSearchOrder.widened(17, 50, -5, 70)]],
  ])('lists every frame of the window exactly once when reading %s', (_case, order) => {
    expect([...order].sort((a, b) => a - b)).toEqual(everyFrame(50));
  });
});
