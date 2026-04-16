// @ts-nocheck
export class GridContextMenuControl {
  constructor({
    contextMenuController,
  } = {}) {
    this.contextMenuController = contextMenuController;
  }

  buildItems({
    hasSelection = false,
    hasPipeline = false,
    targetCollections = [],
    onAddToCollection = () => {},
    onNewCollection = () => {},
    onDeleteFromDisk = () => {},
  } = {}) {
    const items = hasSelection
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
  } = {}) {
    this.contextMenuController?.open({
      point,
      items: this.buildItems({
        hasSelection,
        hasPipeline,
        targetCollections,
        onAddToCollection,
        onNewCollection,
        onDeleteFromDisk,
      }),
    });
  }

  close(options) {
    this.contextMenuController?.close(options);
  }
}

export function createGridContextMenuControl(options) {
  return new GridContextMenuControl(options);
}
