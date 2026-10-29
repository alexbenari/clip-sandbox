// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { GridContextMenuControl } from '../../src/ui/grid-context-menu-control.js';

const subset = { label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' };

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

  test('builds active add, new collection and Recycle Bin items when a selection exists', () => {
    const control = new GridContextMenuControl();
    const onAddToCollection = vi.fn();
    const onNewCollection = vi.fn();
    const onTrashSelected = vi.fn();

    const items = control.buildItems({
      hasSelection: true,
      hasPipeline: true,
      targetCollections: [subset],
      onAddToCollection,
      onNewCollection,
      onTrashSelected,
    });
    const item = (id) => items.find(entry => entry.id === id);

    item('add-to-subset.txt').onSelect();
    item('new-collection').onSelect();
    item('trash-selected').onSelect();
    expect(onAddToCollection).toHaveBeenCalledWith(subset);
    expect(onNewCollection).toHaveBeenCalledOnce();
    expect(onTrashSelected).toHaveBeenCalledOnce();
  });

  test('puts Move selected to Recycle Bin last, after a separator, as a destructive item with an icon', () => {
    const control = new GridContextMenuControl();

    const items = control.buildItems({ hasSelection: true, hasPipeline: true, targetCollections: [subset] });

    expect(items.at(-2)).toEqual({ separator: true });
    expect(items.at(-1)).toMatchObject({ id: 'trash-selected', label: 'Move selected to Recycle Bin…', tone: 'destructive' });
    expect(items.at(-1).icon).toMatchObject({ kind: 'svg', paint: 'stroke' });
    expect(items.filter(entry => entry.separator)).toHaveLength(1);
  });

  test('delegates open with built items to the generic context menu controller', () => {
    const contextMenu = { open: vi.fn() };
    const control = new GridContextMenuControl({ contextMenu });

    control.open({
      point: { x: 12, y: 24 },
      hasSelection: true,
      hasPipeline: true,
      targetCollections: [subset],
    });

    expect(contextMenu.open).toHaveBeenCalledOnce();
    expect(contextMenu.open.mock.calls[0][0].point).toEqual({ x: 12, y: 24 });
    expect(contextMenu.open.mock.calls[0][0].items.map((item) => item.id ?? 'separator')).toEqual([
      'add-to-subset.txt',
      'new-collection',
      'separator',
      'trash-selected',
    ]);
  });

  test('lists Refine first, apart from the collection items, for a menu opened on a clip', () => {
    const onRefine = vi.fn();
    const control = new GridContextMenuControl();

    const items = control.buildItems({ hasSelection: true, hasPipeline: true, targetCollections: [subset], onRefine });

    expect(items.slice(0, 2)).toEqual([{ id: 'refine-clip', label: 'Refine', onSelect: onRefine }, { separator: true }]);
  });

  test('lists Refine for a clip whatever is selected', () => {
    const control = new GridContextMenuControl();

    const items = control.buildItems({ hasSelection: false, hasPipeline: true, onRefine: vi.fn() });

    expect(items[0]).toMatchObject({ id: 'refine-clip', label: 'Refine' });
    expect(items[0].disabled).toBeFalsy();
  });

  test('asks the context menu to focus its first item for a keyboard request', () => {
    const contextMenu = { open: vi.fn() };
    const control = new GridContextMenuControl({ contextMenu });

    control.open({ point: { x: 12, y: 24 }, hasSelection: true, hasPipeline: true, focusFirstItem: true });

    expect(contextMenu.open.mock.calls[0][0].focusFirst).toBe(true);
  });
});
