// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { GridContextMenuControl } from '../../src/ui/grid-context-menu-control.js';

describe('grid context menu control', () => {
  test('builds disabled items when nothing is selected', () => {
    const control = new GridContextMenuControl();
    const items = control.buildItems({
      hasSelection: false,
      hasPipeline: true,
      targetCollections: [],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'add-to-collection-disabled',
      disabled: true,
    });
    expect(items[1]).toMatchObject({
      id: 'new-collection',
      disabled: true,
    });
  });

  test('builds active add/delete menu items when selection exists', () => {
    const control = new GridContextMenuControl();
    const onAddToCollection = vi.fn();
    const onNewCollection = vi.fn();
    const onDeleteFromDisk = vi.fn();

    const items = control.buildItems({
      hasSelection: true,
      hasPipeline: true,
      targetCollections: [{ label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' }],
      onAddToCollection,
      onNewCollection,
      onDeleteFromDisk,
    });

    expect(items.map((item) => item.id)).toEqual(['add-to-subset.txt', 'new-collection', 'delete-from-disk']);
    items[0].onSelect();
    items[1].onSelect();
    items[2].onSelect();
    expect(onAddToCollection).toHaveBeenCalledWith({ label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' });
    expect(onNewCollection).toHaveBeenCalledOnce();
    expect(onDeleteFromDisk).toHaveBeenCalledOnce();
  });

  test('delegates open with built items to the generic context menu controller', () => {
    const contextMenuController = { open: vi.fn() };
    const control = new GridContextMenuControl({ contextMenuController });

    control.open({
      point: { x: 12, y: 24 },
      hasSelection: true,
      hasPipeline: true,
      targetCollections: [{ label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' }],
    });

    expect(contextMenuController.open).toHaveBeenCalledOnce();
    expect(contextMenuController.open.mock.calls[0][0].point).toEqual({ x: 12, y: 24 });
    expect(contextMenuController.open.mock.calls[0][0].items.map((item) => item.id)).toEqual([
      'add-to-subset.txt',
      'new-collection',
      'delete-from-disk',
    ]);
  });
});
