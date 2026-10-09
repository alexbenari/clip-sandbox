import { describe, expect, it, vi } from 'vitest';

import { FullScreenChangeWorkflow } from '../../src/app/full-screen-change-workflow.js';

function fullScreenChange() {
  const state = { movie: false, document: false, zoomOpen: false };
  const heldSteps = { releaseHeldSteps: vi.fn() };
  const zoom = { isOpen: () => state.zoomOpen, close: vi.fn() };
  const collectionFullScreen = { onFsChange: vi.fn() };
  const collectionView = { renderActiveSequence: vi.fn() };
  const utilities = { close: vi.fn() };
  const workflow = new FullScreenChangeWorkflow({
    utilities,
    moviePlayer: { isMovieFullScreen: () => state.movie, onFullScreenChange: vi.fn() },
    heldSteps,
    fullScreen: { isDocumentFullScreen: () => state.document },
    zoom,
    collectionFullScreen,
    pipelineSession: { currentClipSequence: {} as never },
    collectionView,
  });
  return { workflow, state, heldSteps, zoom, collectionFullScreen, collectionView, utilities };
}

describe('FullScreenChangeWorkflow', () => {
  it('releases held frame steps whenever movie full screen starts or ends', () => {
    const { workflow, state, heldSteps } = fullScreenChange();

    state.movie = true;
    workflow.handleFullScreenChange();
    workflow.handleFullScreenChange();
    state.movie = false;
    workflow.handleFullScreenChange();

    expect(heldSteps.releaseHeldSteps).toHaveBeenCalledTimes(2);
  });

  it('closes Zoom when Collection full screen starts, and re-renders the collection when it ends', () => {
    const { workflow, state, zoom, collectionFullScreen, collectionView, utilities } = fullScreenChange();
    state.zoomOpen = true;

    state.document = true;
    workflow.handleFullScreenChange();
    expect(zoom.close).toHaveBeenCalledOnce();
    expect(collectionFullScreen.onFsChange).toHaveBeenCalledOnce();
    expect(utilities.close).toHaveBeenCalledWith(false);

    state.document = false;
    workflow.handleFullScreenChange();
    expect(collectionFullScreen.onFsChange).toHaveBeenCalledTimes(2);
    expect(collectionView.renderActiveSequence).toHaveBeenCalledOnce();
  });

  it('leaves the Collection view alone during movie-only full screen', () => {
    const { workflow, state, collectionFullScreen, collectionView } = fullScreenChange();

    state.movie = true;
    workflow.handleFullScreenChange();
    state.movie = false;
    workflow.handleFullScreenChange();

    expect(collectionFullScreen.onFsChange).not.toHaveBeenCalled();
    expect(collectionView.renderActiveSequence).not.toHaveBeenCalled();
  });
});
