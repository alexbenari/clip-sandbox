import type { ContextMenuControl, ContextMenuItem, ContextMenuPoint } from './context-menu-control.js';

type TargetCollectionChoice = {
  value: string;
  label: string;
  collectionFilename?: string | null;
};

type GridContextMenuOptions = {
  contextMenu?: Pick<ContextMenuControl, 'open' | 'close'> | null;
};

type GridContextMenuRequest = {
  point?: ContextMenuPoint;
  hasSelection?: boolean;
  hasPipeline?: boolean;
  targetCollections?: TargetCollectionChoice[];
  onAddToCollection?: (choice: TargetCollectionChoice) => void;
  onNewCollection?: () => void;
  onDeleteFromDisk?: () => void;
  hasClip?: boolean;
  canRefine?: boolean;
  onRefine?: () => void;
};

export class GridContextMenuControl {
  contextMenu: Pick<ContextMenuControl, 'open' | 'close'> | null;

  constructor({
    contextMenu,
  }: GridContextMenuOptions = {}) {
    this.contextMenu = contextMenu || null;
  }

  buildItems({
    hasSelection = false,
    hasPipeline = false,
    targetCollections = [],
    onAddToCollection = () => {},
    onNewCollection = () => {},
    onDeleteFromDisk = () => {},
    hasClip = false,
    canRefine = false,
    onRefine = () => {},
  }: GridContextMenuRequest = {}): ContextMenuItem[] {
    const items: ContextMenuItem[] = hasSelection
      ? targetCollections.map((choice) => ({
        id: `add-to-${choice.value}`,
        label: `Add to ${choice.label}`,
        onSelect: () => onAddToCollection(choice),
      }))
      : [{
        id: 'add-to-collection-disabled',
        label: 'Select clips to add to a collection',
        disabled: true,
      }];

    if (hasClip) items.push({
      id: 'refine-clip',
      label: 'Refine',
      disabled: !canRefine,
      onSelect: onRefine,
    });

    items.push({
      id: 'new-collection',
      label: 'New collection...',
      disabled: !hasPipeline || !hasSelection,
      onSelect: onNewCollection,
    });

    if (hasPipeline && hasSelection) {
      items.push({
        id: 'delete-from-disk',
        label: 'Delete from Disk...',
        onSelect: onDeleteFromDisk,
      });
    }

    return items;
  }

  open({
    point = {},
    hasSelection = false,
    hasPipeline = false,
    targetCollections = [],
    onAddToCollection = () => {},
    onNewCollection = () => {},
    onDeleteFromDisk = () => {},
    hasClip = false,
    canRefine = false,
    onRefine = () => {},
  }: GridContextMenuRequest = {}): void {
    this.contextMenu?.open({
      point,
      items: this.buildItems({
        hasSelection,
        hasPipeline,
        targetCollections,
        onAddToCollection,
        onNewCollection,
        onDeleteFromDisk,
        hasClip,
        canRefine,
        onRefine,
      }),
    });
  }

  close(options?: { restoreFocus?: boolean }): void {
    this.contextMenu?.close(options);
  }
}
