import { describe, expect, test } from 'vitest';
import { DisplayLayoutRules } from '../../src/ui/display-layout-rules.js';

describe('DisplayLayoutRules', () => {
  const rules = new DisplayLayoutRules();

  test('chooses the grid with the greatest rendered video area', () => {
    const layout = rules.computeBestGrid({
      count: 4,
      availW: 800,
      availH: 600,
      gap: 10,
      clips: Array.from({ length: 4 }, () => ({ videoWidth: 1, videoHeight: 1 })),
    });

    expect(layout).toMatchObject({ cols: 2, rows: 2 });
  });

  test('reserves one fullscreen grid cell outside the visible clip target', () => {
    const layout = rules.computeFullscreenLayout({
      slots: 6,
      availW: 1200,
      availH: 800,
      gap: 10,
    });

    expect(layout.targetVisible).toBe(layout.rows * layout.cols - 1);
  });

  test('normalizes invalid fullscreen slot counts to the minimum', () => {
    expect(rules.normalizeFullscreenSlots(Number.NaN)).toBe(2);
    expect(rules.normalizeFullscreenSlots(1)).toBe(2);
  });
});
