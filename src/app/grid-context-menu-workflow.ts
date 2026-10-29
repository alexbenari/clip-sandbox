import type { AddToCollectionWorkflow, CollectionDestinationChoice } from './add-to-collection-workflow.js';
import type { TrashClipsWorkflow } from './trash-clips-workflow.js';
import type { IEventSource } from './event-source.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';

type MenuPoint = Readonly<{ x: number; y: number }>;

export interface IClipContextMenu {
  open(request: {
    point: MenuPoint;
    focusFirstItem: boolean;
    hasSelection: boolean;
    hasPipeline: boolean;
    targetCollections: CollectionDestinationChoice[];
    onAddToCollection: (choice: Readonly<{ collectionFilename?: string | null }>) => void;
    onNewCollection: () => void;
    onTrashSelected: () => void;
  }): void;
}

type GridContextMenuDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline'>;
  grid: IEventSource<{ contextMenuRequested: Readonly<{ point: MenuPoint; clipId: string | null; fromKeyboard: boolean }> }>
    & { getSelectedClipIds(): string[] };
  menu: IClipContextMenu;
  zoom: { isOpen(): boolean };
  fullScreen: { isDocumentFullScreen(): boolean };
  addToCollection: Pick<AddToCollectionWorkflow, 'destinationChoices' | 'addSelectedClips' | 'openDialog'>;
  trashClips: Pick<TrashClipsWorkflow, 'start'>;
}>;

export class GridContextMenuWorkflow {
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly menu: GridContextMenuDependencies) {
    this.unsubscribes = [
      menu.grid.on('contextMenuRequested', ({ point, fromKeyboard }) => {
        if (menu.zoom.isOpen() || menu.fullScreen.isDocumentFullScreen()) return;
        this.open(point, { focusFirstItem: fromKeyboard });
      }),
    ];
  }

  open(point: MenuPoint, { focusFirstItem = false }: { focusFirstItem?: boolean } = {}): void {
    this.menu.menu.open({
      point,
      focusFirstItem,
      hasSelection: this.menu.grid.getSelectedClipIds().length > 0,
      hasPipeline: !!this.menu.pipelineWorkingCopy.pipeline,
      targetCollections: this.menu.addToCollection.destinationChoices(),
      onAddToCollection: choice => {
        void this.menu.addToCollection.addSelectedClips({ kind: 'existing', collectionFilename: choice.collectionFilename ?? null });
      },
      onNewCollection: () => this.menu.addToCollection.openDialog({ startWithNewCollection: true }),
      onTrashSelected: () => this.menu.trashClips.start(),
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }
}
