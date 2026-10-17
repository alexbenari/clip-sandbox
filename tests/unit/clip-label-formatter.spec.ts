import { describe, expect, it } from 'vitest';
import { ClipLabelFormatter } from '../../src/ui/clip-label-formatter.js';

describe('ClipLabelFormatter', () => {
  const formatter = new ClipLabelFormatter();

  it('formats durations as hh:mm:ss, rounding to the nearest second', () => {
    expect(formatter.formatDuration(0)).toBe('00:00:00');
    expect(formatter.formatDuration(61)).toBe('00:01:01');
    expect(formatter.formatDuration(3661.6)).toBe('01:01:02');
  });

  it('shows placeholders for a duration that is not a number', () => {
    expect(formatter.formatDuration('bad' as never)).toBe('--:--:--');
  });
});
