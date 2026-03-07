import { describe, expect, test, vi } from 'vitest';
import { runLoadClips } from '../../src/business-logic/load-clips.js';
import { runSaveOrder } from '../../src/business-logic/save-order.js';
import { runRemoveSelectedClip } from '../../src/business-logic/remove-clip.js';

describe('business logic modules', () => {
  test('runLoadClips loads and reports count', async () => {
    const added = [];
    const showStatus = vi.fn();
    const count = await runLoadClips({
      fileList: [{ name: 'b.mp4' }, { name: 'a.mp4' }],
      filterAndSortFiles: (files) => files.slice().sort((a, b) => a.name.localeCompare(b.name)),
      addThumbForFile: (file) => added.push(file.name),
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      showStatus,
      delay: async () => {},
      buildLoadedMessage: (n) => `Loaded ${n} videos.`,
    });
    expect(count).toBe(2);
    expect(added).toEqual(['a.mp4', 'b.mp4']);
    expect(showStatus).toHaveBeenCalledWith('Loaded 2 videos.');
  });

  test('runSaveOrder uses direct write when handle is available', async () => {
    const saveTextToDirectory = vi.fn(async () => {});
    const downloadText = vi.fn();
    const showStatus = vi.fn();
    const mode = await runSaveOrder({
      names: ['one.mp4', 'two.webm'],
      currentDirHandle: { kind: 'directory', getFileHandle: vi.fn() },
      saveTextToDirectory,
      downloadText,
      showStatus,
    });
    expect(mode).toBe('saved');
    expect(saveTextToDirectory).toHaveBeenCalledOnce();
    expect(downloadText).not.toHaveBeenCalled();
    expect(showStatus).toHaveBeenCalledWith('Saved clip-order.txt to the selected folder.');
  });

  test('runRemoveSelectedClip removes selected card', () => {
    const removed = { dataset: { objectUrl: 'blob:x' }, remove: vi.fn() };
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();
    const result = runRemoveSelectedClip({
      selectedThumb: removed,
      clearSelection: vi.fn(),
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      showStatus: vi.fn(),
    });
    expect(result).toBe(true);
    expect(removed.remove).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    URL.revokeObjectURL = originalRevoke;
  });
});
