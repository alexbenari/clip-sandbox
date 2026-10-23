import type { ClipRefineAvailability } from '../app/grid-context-menu-workflow.js';
import type { ContextMenuControl, ContextMenuEntry, ContextMenuIcon, ContextMenuItem, ContextMenuPoint } from './context-menu-control.js';

const TRASH_ICON: ContextMenuIcon = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 24 24',
  paint: 'stroke',
  paths: ['M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3'],
});

const REFINE_UNAVAILABLE_REASONS: Readonly<Record<Exclude<ClipRefineAvailability, 'available'>, string>> = Object.freeze({
  'no-source-info': 'No source movie info',
  'source-info-unreadable': 'Couldn’t read source movie info',
});

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
  onTrashSelected?: () => void;
  hasClip?: boolean;
  refineAvailability?: ClipRefineAvailability;
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
    onTrashSelected = () => {},
    hasClip = false,
    refineAvailability = 'no-source-info',
    onRefine = () => {},
  }: GridContextMenuRequest = {}): ContextMenuEntry[] {
    const items: ContextMenuEntry[] = hasSelection
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

    if (hasClip) items.push(this.refineItem(refineAvailability, onRefine));

    items.push({
      id: 'new-collection',
      label: 'New collection…',
      disabled: !hasPipeline || !hasSelection,
      onSelect: onNewCollection,
    });

    if (hasPipeline && hasSelection) {
      items.push({ separator: true }, {
        id: 'trash-selected',
        label: 'Move selected to Recycle Bin…',
        tone: 'destructive',
        icon: TRASH_ICON,
        onSelect: onTrashSelected,
      });
    }

    return items;
  }

  open({ point = {}, ...request }: GridContextMenuRequest = {}): void {
    this.contextMenu?.open({ point, items: this.buildItems(request) });
  }

  close(options?: { restoreFocus?: boolean }): void {
    this.contextMenu?.close(options);
  }

  private refineItem(availability: ClipRefineAvailability, onRefine: () => void): ContextMenuItem {
    if (availability === 'available') return { id: 'refine-clip', label: 'Refine', disabled: false, onSelect: onRefine };
    return { id: 'refine-clip', label: 'Refine', detail: REFINE_UNAVAILABLE_REASONS[availability], disabled: true };
  }
}
