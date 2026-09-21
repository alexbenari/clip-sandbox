import { describe, expect, it, vi } from 'vitest';
import { OpenFolderRefreshSession } from '../../src/app/open-folder-refresh-session.js';

describe('OpenFolderRefreshSession', () => {
  it('defers a matching folder refresh until its dirty collection has been saved', async () => {
    const state = { activeFolderPath: 'C:/pipelines/extraction-tmp', dirty: true };
    const refreshActiveFolder = vi.fn(async () => undefined);
    const session = new OpenFolderRefreshSession({
      isActiveFolder: folderPath => folderPath === state.activeFolderPath,
      hasUnsavedActiveSequenceChanges: () => state.dirty,
      refreshActiveFolder,
      onRefreshError: vi.fn(),
    });

    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');
    expect(refreshActiveFolder).not.toHaveBeenCalled();

    state.dirty = false;
    await session.afterCollectionSaved();

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });

  it('refreshes a clean matching folder immediately and ignores another folder', async () => {
    const refreshActiveFolder = vi.fn(async () => undefined);
    const session = new OpenFolderRefreshSession({
      isActiveFolder: folderPath => folderPath === 'C:/pipelines/extraction-tmp',
      hasUnsavedActiveSequenceChanges: () => false,
      refreshActiveFolder,
      onRefreshError: vi.fn(),
    });

    await session.onFolderContentsPublished('C:/elsewhere');
    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });
});
