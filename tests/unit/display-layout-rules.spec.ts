import { describe, expect, test } from 'vitest';
import { DisplayLayoutRules } from '../../src/ui/display-layout-rules.js';

function clips(count: number, videoWidth: number, videoHeight: number) {
  return Array.from({ length: count }, () => ({ videoWidth, videoHeight }));
}

describe('DisplayLayoutRules grid choice', () => {
  const rules = new DisplayLayoutRules();

  test('returns at least one column for an empty grid', () => {
    expect(rules.computeBestGrid({ count: 0, availW: 100, availH: 100, gap: 10 }).cols).toBe(1);
  });

  test('chooses portrait, square and landscape grids by the greatest rendered video area', () => {
    const area = { count: 4, availW: 800, availH: 600, gap: 10 };

    expect(rules.computeBestGrid({ ...area, clips: clips(4, 9, 16) })).toMatchObject({ cols: 4, rows: 1 });
    expect(rules.computeBestGrid({ ...area, clips: clips(4, 1, 1) })).toMatchObject({ cols: 2, rows: 2 });
    expect(rules.computeBestGrid({ ...area, clips: clips(4, 16, 9) })).toMatchObject({ cols: 2, rows: 2 });
  });

  test('accepts empty final-row slots when that gives larger rendered videos', () => {
    expect(rules.computeBestGrid({ count: 7, availW: 900, availH: 360, gap: 10, clips: clips(7, 16, 9) }))
      .toMatchObject({ cols: 4, rows: 2 });
  });

  test('does not over-prefer very wide low-row layouts for large landscape sets', () => {
    expect(rules.computeBestGrid({ count: 34, availW: 1600, availH: 800, gap: 10, clips: clips(34, 720, 390) }))
      .toMatchObject({ cols: 6, rows: 6 });
  });

  test('scores mixed aspect ratios by aggregate rendered video area', () => {
    expect(rules.computeBestGrid({
      count: 6, availW: 900, availH: 600, gap: 10,
      clips: [...clips(2, 16, 9), ...clips(2, 1, 1), ...clips(2, 9, 16)],
    })).toMatchObject({ cols: 3, rows: 2 });
  });

  test('falls back for unavailable or invalid dimensions', () => {
    expect(rules.computeBestGrid({
      count: 3, availW: 600, availH: 300, gap: 10,
      clips: [{ videoWidth: 0, videoHeight: 9 }, { videoWidth: Number.NaN, videoHeight: 9 }, null],
    })).toMatchObject({ cols: 2, rows: 2 });
  });

  test('accounts for the gap between cards', () => {
    const area = { count: 5, availW: 500, availH: 300, clips: clips(5, 16, 9) };

    expect(rules.computeBestGrid({ ...area, gap: 0 })).toMatchObject({ cols: 2, rows: 3 });
    expect(rules.computeBestGrid({ ...area, gap: 80 })).toMatchObject({ cols: 3, rows: 2 });
  });
});

describe('DisplayLayoutRules full-screen layout', () => {
  const rules = new DisplayLayoutRules();

  test('reserves one grid cell outside the visible clip target', () => {
    const layout = rules.computeFullscreenLayout({ slots: 6, availW: 1200, availH: 800, gap: 10 });

    expect(layout.targetVisible).toBe(layout.rows * layout.cols - 1);
  });

  test('shows more, smaller clips as the slot count grows in the same viewport', () => {
    const fewSlots = rules.computeFullscreenLayout({ slots: 4, availW: 1200, availH: 800, gap: 10 });
    const manySlots = rules.computeFullscreenLayout({ slots: 12, availW: 1200, availH: 800, gap: 10 });

    expect(manySlots.cellH).toBeLessThan(fewSlots.cellH);
    expect(manySlots.targetVisible).toBeGreaterThan(fewSlots.targetVisible);
  });

  test('returns a usable layout in a very small space', () => {
    const layout = rules.computeFullscreenLayout({ slots: 9, availW: 48, availH: 30, gap: 10 });

    expect(layout.cols).toBeGreaterThanOrEqual(1);
    expect(layout.rows).toBeGreaterThanOrEqual(1);
    expect(layout.cellH).toBeGreaterThan(0);
    expect(layout.targetVisible).toBeGreaterThanOrEqual(1);
  });

  test('normalizes invalid slot counts to the minimum', () => {
    expect(rules.normalizeFullscreenSlots(Number.NaN)).toBe(2);
    expect(rules.normalizeFullscreenSlots(1)).toBe(2);
  });
});
