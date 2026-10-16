import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { CollectionFullScreenWorkflow } from './collection-full-screen-workflow.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import type { ZoomWorkflow } from './zoom-workflow.js';

export interface IMoviePlayerFullScreen {
  isMovieFullScreen(): boolean;
  onFullScreenChange(): void;
}

type FullScreenChangeDependencies = Readonly<{
  utilities: { close(restoreFocus?: boolean): void } | null;
  moviePlayer: IMoviePlayerFullScreen;
  heldSteps: { releaseHeldSteps(): void };
  fullScreen: { isDocumentFullScreen(): boolean };
  zoom: Pick<ZoomWorkflow, 'isOpen' | 'close'>;
  collectionFullScreen: Pick<CollectionFullScreenWorkflow, 'onFsChange'>;
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'currentClipSequence'>;
  collectionView: Pick<CollectionViewWorkflow, 'renderActiveSequence'>;
}>;

export class FullScreenChangeWorkflow {
  private collectionWasFullScreen = false;
  private movieWasFullScreen = false;

  constructor(private readonly change: FullScreenChangeDependencies) {}

  handleFullScreenChange(): void {
    const { moviePlayer, zoom } = this.change;
    this.change.utilities?.close(false);
    const movieFullScreen = moviePlayer.isMovieFullScreen();
    moviePlayer.onFullScreenChange();
    if (movieFullScreen !== this.movieWasFullScreen) this.change.heldSteps.releaseHeldSteps();
    this.movieWasFullScreen = movieFullScreen;
    const collectionFullScreen = this.change.fullScreen.isDocumentFullScreen();
    if (collectionFullScreen && zoom.isOpen()) zoom.close();
    if (collectionFullScreen || this.collectionWasFullScreen) this.change.collectionFullScreen.onFsChange();
    if (this.collectionWasFullScreen && !collectionFullScreen && this.change.pipelineWorkingCopy.currentClipSequence) {
      this.change.collectionView.renderActiveSequence();
    }
    this.collectionWasFullScreen = collectionFullScreen;
  }
}
