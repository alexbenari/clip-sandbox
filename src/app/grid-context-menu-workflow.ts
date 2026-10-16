import type { AddToCollectionWorkflow, CollectionDestinationChoice } from './add-to-collection-workflow.js';
import type { AppSessionState } from './app-session-state.js';
import type { ICollectionClipRefinementService } from './collection-clip-refinement.js';
import type { CollectionRefinementWorkflow, IScreenNavigation } from './collection-refinement-workflow.js';
import type { DeleteFromDiskWorkflow } from './delete-from-disk-workflow.js';
import type { IEventSource } from './event-source.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

type MenuPoint = Readonly<{ x: number; y: number }>;

export interface IClipContextMenu {
  open(request: {
    point: MenuPoint;
    hasSelection: boolean;
    hasPipeline: boolean;
    hasClip: boolean;
    canRefine: boolean;
    onRefine: () => void;
    targetCollections: CollectionDestinationChoice[];
    onAddToCollection: (choice: Readonly<{ collectionFilename?: string | null }>) => void;
    onNewCollection: () => void;
    onDeleteFromDisk: () => void;
  }): void;
}

type GridContextMenuDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'resolveClip' | 'activeCollectionFilename'>;
  openFolder: Pick<AppSessionState, 'currentFolderSession'>;
  refinementAvailability: Pick<ICollectionClipRefinementService, 'inspect'> | null;
  grid: IEventSource<{ contextMenuRequested: Readonly<{ point: MenuPoint; clipId: string | null }> }>
    & { getSelectedClipIds(): string[] };
  menu: IClipContextMenu;
  navigation: Pick<IScreenNavigation, 'activeScreen'>;
  collectionScreenId: string;
  zoom: { isOpen(): boolean };
  fullScreen: { isDocumentFullScreen(): boolean };
  addToCollection: Pick<AddToCollectionWorkflow, 'destinationChoices' | 'addSelectedClips' | 'openDialog'>;
  deleteFromDisk: Pick<DeleteFromDiskWorkflow, 'start'>;
  collectionRefinement: Pick<CollectionRefinementWorkflow, 'start'>;
}>;

export class GridContextMenuWorkflow {
  private revision = 0;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly menu: GridContextMenuDependencies) {
    this.unsubscribes = [
      menu.grid.on('contextMenuRequested', ({ point, clipId }) => {
        if (menu.zoom.isOpen() || menu.fullScreen.isDocumentFullScreen()) return;
        void this.open(point, clipId);
      }),
    ];
  }

  // Checking whether a clip can be refined is asynchronous, so a newer request or a changed view cancels this one.
  async open(point: MenuPoint, clipId: string | null): Promise<void> {
    const { pipelineWorkingCopy, openFolder } = this.menu;
    const revision = ++this.revision;
    const clip = pipelineWorkingCopy.resolveClip(clipId);
    const collectionFilename = pipelineWorkingCopy.activeCollectionFilename();
    const folderSession = openFolder.currentFolderSession;
    const request = clip && folderSession
      ? { folderPath: folderSession.folderPath, filename: clip.name } : null;
    let canRefine = false;
    if (request && this.menu.refinementAvailability) {
      try { canRefine = await this.menu.refinementAvailability.inspect(request); }
      catch { canRefine = false; }
    }
    if (revision !== this.revision || collectionFilename !== pipelineWorkingCopy.activeCollectionFilename()
      || openFolder.currentFolderSession !== folderSession
      || this.menu.navigation.activeScreen.id !== this.menu.collectionScreenId
      || (clipId && pipelineWorkingCopy.resolveClip(clipId) !== clip)) return;
    this.menu.menu.open({
      point,
      hasSelection: this.menu.grid.getSelectedClipIds().length > 0,
      hasPipeline: !!pipelineWorkingCopy.pipeline,
      hasClip: request !== null,
      canRefine,
      onRefine: () => {
        if (request) void this.menu.collectionRefinement.start(request, collectionFilename);
      },
      targetCollections: this.menu.addToCollection.destinationChoices(),
      onAddToCollection: choice => {
        void this.menu.addToCollection.addSelectedClips({ kind: 'existing', collectionFilename: choice.collectionFilename ?? null });
      },
      onNewCollection: () => this.menu.addToCollection.openDialog({ startWithNewCollection: true }),
      onDeleteFromDisk: () => this.menu.deleteFromDisk.start(),
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }
}
