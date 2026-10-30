import { describe, expect, it, vi } from 'vitest';

import { ZoomEditModeText } from '../../src/app/zoom-edit-mode-text.js';
import type { ContextMenuEntry } from '../../src/ui/context-menu-control.js';
import { ZoomEditMenuControl } from '../../src/ui/zoom-edit-menu-control.js';

function openedMenu() {
  const contextMenu = { open: vi.fn((_request: { point?: object; items?: Iterable<ContextMenuEntry> }) => undefined) };
  const onRefine = vi.fn();
  const onLoopify = vi.fn();
  new ZoomEditMenuControl({ contextMenu, text: new ZoomEditModeText() }).open({ point: { x: 64, y: 72 }, onRefine, onLoopify });
  const items = [...(contextMenu.open.mock.calls[0][0].items ?? [])];
  const item = (id: string) => items.find(entry => !('separator' in entry) && entry.id === id) as { onSelect?: () => void } | undefined;
  return { contextMenu, items, item, onRefine, onLoopify };
}

describe('ZoomEditMenuControl', () => {
  it('lists Refine, then Loopify, at the point of the right-click', () => {
    const { contextMenu, items } = openedMenu();

    expect(items.map(entry => ('separator' in entry ? 'separator' : entry.id))).toEqual(['zoom-edit-refine', 'zoom-edit-loopify']);
    expect(contextMenu.open.mock.calls[0][0].point).toEqual({ x: 64, y: 72 });
  });

  it('names the entries after the edits they stage', () => {
    const { items } = openedMenu();

    expect(items.map(entry => ('separator' in entry ? 'separator' : entry.label))).toEqual(['Refine', 'Loopify']);
  });

  it.each([
    ['zoom-edit-refine', 'onRefine'],
    ['zoom-edit-loopify', 'onLoopify'],
  ] as const)('answers %s through its own callback only', (id, callback) => {
    const menu = openedMenu();

    menu.item(id)?.onSelect?.();

    expect([menu.onRefine.mock.calls.length, menu.onLoopify.mock.calls.length])
      .toEqual(callback === 'onRefine' ? [1, 0] : [0, 1]);
  });
});
