// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { LoadStatusControl } from '../../src/ui/load-status-control.js';

describe('load status control', () => {
  test('reports empty pipelines clearly', () => {
    const control = new LoadStatusControl();
    const pipeline = { videoNames: () => [] };
    expect(control.initialLoadText({ pipeline, clipCount: 0 }))
      .toBe('No video files found in the selected folder.');
  });

  test('formats pipeline and collection selection load messages', () => {
    const control = new LoadStatusControl();
    const pipeline = { videoNames: () => ['a.mp4', 'b.mp4'] };
    expect(control.initialLoadText({ pipeline, clipCount: 2 })).toContain('2');
    expect(control.selectionLoadText({ isPipelineMode: true, clipCount: 1 })).toContain('1');
    expect(control.selectionLoadText({ isPipelineMode: false, clipCount: 2 })).toContain('2');
  });

  test('delegates semantic status calls to the generic status bar control', () => {
    const statusBarControl = { show: vi.fn() };
    const control = new LoadStatusControl({ statusBarControl });
    const pipeline = { videoNames: () => ['a.mp4'] };

    control.showInitialLoadStatus({ pipeline, clipCount: 1, timeout: 123 });
    control.showSelectionLoadStatus({ isPipelineMode: false, clipCount: 2, timeout: 456 });

    expect(statusBarControl.show).toHaveBeenNthCalledWith(1, 'Loaded pipeline with 1 clip.', 123);
    expect(statusBarControl.show).toHaveBeenNthCalledWith(2, 'Loaded collection with 2 clips.', 456);
  });
});
