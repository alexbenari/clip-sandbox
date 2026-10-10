import { describe, expect, it, vi } from 'vitest';
import { OpenFolderRefreshSession } from '../../src/app/open-folder-refresh-session.js';

function refreshSession({ activeFolderPath = 'C:/pipelines/extraction-tmp', dirty = false, refreshActiveFolder = vi.fn(async () => undefined) } = {}) {
  const pipelineSession = { hasDirtyClipSequenceChanges: dirty };
  const folderSession = { folderPath: activeFolderPath };
  const reporter = { failure: vi.fn(), technicalDetailsOf: (error: unknown) => String(error) };
  const diagnostics = { logRuntimeError: vi.fn(async () => undefined) };
  const session = new OpenFolderRefreshSession({
    folders: { isActiveFolder: (current: unknown, folderPath: string) => current === folderSession && folderPath === activeFolderPath },
    openFolder: { currentFolderSession: folderSession },
    pipelineSession,
    refreshActiveFolder,
    reporter,
    diagnostics,
  });
  return { session, pipelineSession, refreshActiveFolder, reporter, diagnostics };
}

describe('OpenFolderRefreshSession', () => {
  it('defers a matching folder refresh until its dirty collection has been saved', async () => {
    const { session, pipelineSession, refreshActiveFolder } = refreshSession({ dirty: true });

    await session.onFolderContentsPublished('C:/pipelines/extraction-tmp');
    expect(refreshActiveFolder).not.toHaveBeenCalled();

    pipelineSession.hasDirtyClipSequenceChanges = false;
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
