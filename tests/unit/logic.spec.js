import { describe, it, expect } from 'vitest';
import {
  VIDEO_EXTS,
  isVideoFile,
  niceNum,
  formatDuration,
  filterAndSortFiles,
  computeBestGrid,
  validateOrderStrict,
  computeFsLayout,
} from '../../logic.js';

describe('video helpers', () => {
  it('detects video by MIME and extension', () => {
    expect(isVideoFile({ type: 'video/mp4', name: 'a.mp4' })).toBe(true);
    expect(isVideoFile({ type: '', name: 'clip.WEBM' })).toBe(true);
    expect(isVideoFile({ name: 'doc.txt' })).toBe(false);
  });

  it('filters and sorts files', () => {
    const files = [
      { name: 'clip10.mp4', type: 'video/mp4' },
      { name: 'clip2.mp4', type: 'video/mp4' },
      { name: 'note.txt', type: 'text/plain' },
    ];
    const sorted = filterAndSortFiles(files);
    expect(sorted.map((f) => f.name)).toEqual(['clip2.mp4', 'clip10.mp4']);
  });
});

describe('formatting', () => {
  it('formats numbers nicely', () => {
    expect(niceNum(1234)).toBe('1,234');
  });

  it('formats durations as hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(61)).toBe('00:01:01');
    expect(formatDuration(3661.6)).toBe('01:01:02');
    expect(formatDuration('bad')).toBe('--:--:--');
  });
});

describe('grid computation', () => {
  it('returns at least one column', () => {
    const res = computeBestGrid({ count: 0, availW: 100, availH: 100, gap: 10 });
    expect(res.cols).toBe(1);
  });

  it('chooses more columns for wider space', () => {
    const res = computeBestGrid({ count: 4, availW: 800, availH: 400, gap: 10 });
    expect(res.cols).toBeGreaterThanOrEqual(2);
  });
});

describe('order validation', () => {
  it('detects duplicates and missing/extra', () => {
    const current = ['a.mp4', 'b.mp4'];
    const { issues } = validateOrderStrict(['a.mp4', 'a.mp4', 'c.mp4'], current);
    expect(issues.join('\n')).toContain('Duplicate');
    expect(issues.join('\n')).toContain('Missing');
    expect(issues.join('\n')).toContain('Unknown');
  });

  it('passes when order matches', () => {
    const { issues, order } = validateOrderStrict(['b.mp4', 'a.mp4'], ['a.mp4', 'b.mp4']);
    expect(issues.length).toBe(0);
    expect(order).toEqual(['b.mp4', 'a.mp4']);
  });
});

describe('fullscreen layout', () => {
  it('reserves one empty slot and computes target visible', () => {
    const res = computeFsLayout({ slots: 6, availW: 1200, availH: 800, gap: 10 });
    expect(res.rows * res.cols - 1).toBeGreaterThanOrEqual(res.targetVisible);
  });
});
