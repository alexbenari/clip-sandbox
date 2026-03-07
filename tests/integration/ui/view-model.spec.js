import { describe, expect, test } from 'vitest';
import { countText, fullscreenSlotsText, loadedVideosText, orderApplyErrorText } from '../../../src/ui/view-model.js';

describe('ui view-model helpers', () => {
  test('formats count text', () => {
    const niceNum = (n) => String(n);
    expect(countText(1, niceNum)).toBe('1 clip');
    expect(countText(12, niceNum)).toBe('12 clips');
  });

  test('formats status messages', () => {
    expect(loadedVideosText(1)).toBe('Loaded 1 video.');
    expect(loadedVideosText(3)).toBe('Loaded 3 videos.');
    expect(fullscreenSlotsText(6)).toBe('Fullscreen slots: 6 (showing 5)');
  });

  test('formats order apply error content', () => {
    expect(orderApplyErrorText(['a', 'b'])).toContain('Could not apply order');
    expect(orderApplyErrorText(['a', 'b'])).toContain('a');
    expect(orderApplyErrorText(['a', 'b'])).toContain('b');
  });
});
