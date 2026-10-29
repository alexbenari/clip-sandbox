import { describe, expect, it, vi } from 'vitest';

import { VideoEditCatalog } from '../../src/business-logic/video-edit-catalog.js';
import type { ContextMenuEntry } from '../../src/ui/context-menu-control.js';
import { ZoomEditMenuControl } from '../../src/ui/zoom-edit-menu-control.js';

const idsOf = (items: ContextMenuEntry[]) => items.map(item => ('separator' in item ? 'separator' : item.id));

describe('ZoomEditMenuControl', () => {
  it('lists Refine as a mode entry, apart from the file edits', () => {
    const menu = new ZoomEditMenuControl({ videoEditCatalog: new VideoEditCatalog() });

    const items = menu.buildItems({ onRefine: vi.fn() });

    expect(idsOf(items)).toEqual(['zoom-edit-refine', 'separator', 'zoom-edit-loopify']);
  });

  it('enters Refine through its own callback, never as a file edit', () => {
    const onRefine = vi.fn();
    const onSelectEdit = vi.fn();
    const menu = new ZoomEditMenuControl({ videoEditCatalog: new VideoEditCatalog() });
    const [refine] = menu.buildItems({ onRefine, onSelectEdit });

    if ('separator' in refine) throw new Error('Refine should come first.');
    refine.onSelect?.();

    expect(onRefine).toHaveBeenCalledOnce();
    expect(onSelectEdit).not.toHaveBeenCalled();
  });

  it('lists only the file edits when Zoom edit mode is unavailable', () => {
    const menu = new ZoomEditMenuControl({ videoEditCatalog: new VideoEditCatalog() });

    expect(idsOf(menu.buildItems({ onRefine: null }))).toEqual(['zoom-edit-loopify']);
  });

  it('disables Refine with the file edits while an edit runs', () => {
    const menu = new ZoomEditMenuControl({ videoEditCatalog: new VideoEditCatalog() });

    const items = menu.buildItems({ isDisabled: true, onRefine: vi.fn() });

    expect(items.filter(item => !('separator' in item)).map(item => ('separator' in item ? null : item.disabled))).toEqual([true, true]);
  });
});
