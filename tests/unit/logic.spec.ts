// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { PipelineFactory } from '../../src/business-logic/PipelineFactory.js';
import { niceNum } from '../../src/app/app-text.js';
import { formatDuration } from '../../src/ui/clip-collection-grid-controller.js';
import {
  computeBestGrid,
  computeFsLayout,
} from '../../src/ui/display-layout-rules.js';

describe('video helpers', () => {
  const pipelineFactory = new PipelineFactory();

  it('detects video by MIME and extension', () => {
    expect(pipelineFactory.isVideoFile({ type: 'video/mp4', name: 'a.mp4' })).toBe(true);
    expect(pipelineFactory.isVideoFile({ type: '', name: 'clip.WEBM' })).toBe(true);
    expect(pipelineFactory.isVideoFile({ name: 'doc.txt' })).toBe(false);
  });

  it('filters and sorts files', () => {
    const files = [
      { name: 'clip10.mp4', type: 'video/mp4' },
      { name: 'clip2.mp4', type: 'video/mp4' },
      { name: 'note.txt', type: 'text/plain' },
    ];
    const sorted = pipelineFactory.filterAndSortFiles(files);
    expect(sorted.map((f) => f.name)).toEqual(['clip2.mp4', 'clip10.mp4']);
  });

  it('detects collection text files and top-level folder entries', () => {
    expect(pipelineFactory.isCollectionFile({ name: 'set-a.txt' })).toBe(true);
    expect(pipelineFactory.isCollectionFile({ name: 'set-a.md' })).toBe(false);
    expect(pipelineFactory.isTopLevelFolderEntry({ webkitRelativePath: 'clips/one.mp4' })).toBe(true);
    expect(pipelineFactory.isTopLevelFolderEntry({ webkitRelativePath: 'clips/sub/one.mp4' })).toBe(false);
  });

  it('splits top-level videos and collection files while ignoring nested entries', () => {
    const { videos, collectionFiles } = pipelineFactory.getVideosAndCollectionFiles([
      { name: 'clip10.mp4', type: 'video/mp4', webkitRelativePath: 'clips/clip10.mp4' },
      { name: 'clip2.mp4', type: 'video/mp4', webkitRelativePath: 'clips/clip2.mp4' },
      { name: 'subset.txt', type: 'text/plain', webkitRelativePath: 'clips/subset.txt' },
      { name: 'deep.mp4', type: 'video/mp4', webkitRelativePath: 'clips/nested/deep.mp4' },
      { name: 'deep.txt', type: 'text/plain', webkitRelativePath: 'clips/nested/deep.txt' },
    ]);
    expect(videos.map((file) => file.name)).toEqual(['clip2.mp4', 'clip10.mp4']);
    expect(collectionFiles.map((file) => file.name)).toEqual(['subset.txt']);
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
  function clips(count, videoWidth, videoHeight) {
    return Array.from({ length: count }, () => ({ videoWidth, videoHeight }));
  }

  it('returns at least one column', () => {
    const res = computeBestGrid({ count: 0, availW: 100, availH: 100, gap: 10 });
    expect(res.cols).toBe(1);
  });

  it('chooses a layout with empty final-row slots when that gives larger rendered videos', () => {
    const res = computeBestGrid({
      count: 7,
      availW: 900,
      availH: 360,
      gap: 10,
      clips: clips(7, 16, 9),
    });
    expect(res).toMatchObject({ cols: 4, rows: 2 });
  });

  it('does not over-prefer very wide low-row layouts for large landscape sets', () => {
    const res = computeBestGrid({
      count: 34,
      availW: 1600,
      availH: 800,
      gap: 10,
      clips: clips(34, 720, 390),
    });
    expect(res).toMatchObject({ cols: 6, rows: 6 });
  });

  it('scores mixed aspect ratios by aggregate rendered video area', () => {
    const res = computeBestGrid({
      count: 6,
      availW: 900,
      availH: 600,
      gap: 10,
      clips: [
        ...clips(2, 16, 9),
        ...clips(2, 1, 1),
        ...clips(2, 9, 16),
      ],
    });
    expect(res).toMatchObject({ cols: 3, rows: 2 });
  });

  it('handles portrait, square, and landscape dimensions', () => {
    expect(computeBestGrid({
      count: 4,
      availW: 800,
      availH: 600,
      gap: 10,
      clips: clips(4, 9, 16),
    })).toMatchObject({ cols: 4, rows: 1 });

    expect(computeBestGrid({
      count: 4,
      availW: 800,
      availH: 600,
      gap: 10,
      clips: clips(4, 1, 1),
    })).toMatchObject({ cols: 2, rows: 2 });

    expect(computeBestGrid({
      count: 4,
      availW: 800,
      availH: 600,
      gap: 10,
      clips: clips(4, 16, 9),
    })).toMatchObject({ cols: 2, rows: 2 });
  });

  it('falls back for unavailable or invalid dimensions', () => {
    const res = computeBestGrid({
      count: 3,
      availW: 600,
      availH: 300,
      gap: 10,
      clips: [
        { videoWidth: 0, videoHeight: 9 },
        { videoWidth: Number.NaN, videoHeight: 9 },
        null,
      ],
    });
    expect(res).toMatchObject({ cols: 2, rows: 2 });
  });

  it('accounts for constrained dimensions and gap size', () => {
    const withoutGap = computeBestGrid({
      count: 5,
      availW: 500,
      availH: 300,
      gap: 0,
      clips: clips(5, 16, 9),
    });
    const largeGap = computeBestGrid({
      count: 5,
      availW: 500,
      availH: 300,
      gap: 80,
      clips: clips(5, 16, 9),
    });

    expect(withoutGap).toMatchObject({ cols: 2, rows: 3 });
    expect(largeGap).toMatchObject({ cols: 3, rows: 2 });
  });
});

describe('fullscreen layout', () => {
  it('reserves one empty slot and computes target visible', () => {
    const res = computeFsLayout({ slots: 6, availW: 1200, availH: 800, gap: 10 });
    expect(res.targetVisible).toBe(res.rows * res.cols - 1);
  });

  it('reduces cell height as slots increase for the same viewport', () => {
    const fewSlots = computeFsLayout({ slots: 4, availW: 1200, availH: 800, gap: 10 });
    const manySlots = computeFsLayout({ slots: 12, availW: 1200, availH: 800, gap: 10 });
    expect(manySlots.cellH).toBeLessThan(fewSlots.cellH);
    expect(manySlots.targetVisible).toBeGreaterThan(fewSlots.targetVisible);
  });

  it('returns a usable layout in constrained space', () => {
    const res = computeFsLayout({ slots: 9, availW: 48, availH: 30, gap: 10 });
    expect(res.cols).toBeGreaterThanOrEqual(1);
    expect(res.rows).toBeGreaterThanOrEqual(1);
    expect(res.cellH).toBeGreaterThan(0);
    expect(res.targetVisible).toBeGreaterThanOrEqual(1);
  });
});

describe('normal vs fullscreen policy', () => {
  it('produces different sizing when clip count and slots differ', () => {
    const normal = computeBestGrid({ count: 18, availW: 1200, availH: 800, gap: 10 });
    const fs = computeFsLayout({ slots: 6, availW: 1200, availH: 800, gap: 10 });
    expect(normal.cellH).not.toBe(fs.cellH);
  });
});

