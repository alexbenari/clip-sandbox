import { describe, expect, it, vi } from 'vitest';
import { OpenFolderRefresher } from '../../src/app/open-folder-refresher.js';

function refreshSession({ activeFolderPath = 'C:/pipelines/extraction-tmp', dirty = false, refreshActiveFolder = vi.fn(async () => undefined) } = {}) {
  const pipelineWorkingCopy = { hasDirtyClipSequenceChanges: dirty };
  const activeEdit = { isActive: false };
  const folderAccess = { folderPath: activeFolderPath };
  const reporter = { failure: vi.fn(), technicalDetailsOf: (error: unknown) => String(error) };
  const diagnostics = { logRuntimeError: vi.fn(async () => undefined) };
  const session = new OpenFolderRefresher({
    folders: { isActiveFolder: (current: { folderPath: string } | null, folderPath: string) => current === folderAccess && folderPath === activeFolderPath },
    openFolder: { currentFolderAccess: folderAccess },
    pipelineWorkingCopy,
    activeEdit,
    refreshActiveFolder,
    reporter,
    diagnostics,
  });
  return { session, pipelineWorkingCopy, activeEdit, refreshActiveFolder, reporter, diagnostics };
}

describe('OpenFolderRefresher', () => {
  it('defers a matching folder refresh until its dirty collection has been saved', async () => {
    const { session, pipelineWorkingCopy, refreshActiveFolder } = refreshSession({ dirty: true });

    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');
    expect(refreshActiveFolder).not.toHaveBeenCalled();

    pipelineWorkingCopy.hasDirtyClipSequenceChanges = false;
    await session.afterCollectionSaved();

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });

  it('defers a matching folder refresh until Zoom edit mode ends', async () => {
    const { session, activeEdit, refreshActiveFolder } = refreshSession();
    activeEdit.isActive = true;

    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');
    expect(refreshActiveFolder).not.toHaveBeenCalled();

    activeEdit.isActive = false;
    await session.afterZoomEditModeEnded();

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });

  it('keeps waiting after Zoom edit mode ends while the collection still has unsaved changes', async () => {
    const { session, pipelineWorkingCopy, activeEdit, refreshActiveFolder } = refreshSession({ dirty: true });
    activeEdit.isActive = true;
    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');

    activeEdit.isActive = false;
    await session.afterZoomEditModeEnded();
    expect(refreshActiveFolder).not.toHaveBeenCalled();
    pipelineWorkingCopy.hasDirtyClipSequenceChanges = false;
    await session.afterCollectionSaved();

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });

  it('refreshes a clean matching folder immediately and ignores another folder', async () => {
    const { session, refreshActiveFolder } = refreshSession();

    await session.onFolderContentsPublished('C:/elsewhere');
    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');

    expect(refreshActiveFolder).toHaveBeenCalledOnce();
  });

  it('reports a refresh that fails after the clip was saved', async () => {
    const { session, reporter, diagnostics } = refreshSession({ refreshActiveFolder: vi.fn(async () => { throw new Error('read failed'); }) });

    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');

    expect(reporter.failure).toHaveBeenCalledWith('The clip was saved, but the Collection view could not refresh.', expect.objectContaining({
      affected: 'Collection refresh',
      technicalDetails: 'Error: read failed',
    }));
    expect(diagnostics.logRuntimeError).toHaveBeenCalledOnce();
  });
});
