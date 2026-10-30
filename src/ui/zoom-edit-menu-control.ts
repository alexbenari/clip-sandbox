import type { ZoomEditModeText } from '../app/zoom-edit-mode-text.js';
import type { ContextMenuControl, ContextMenuEntry, ContextMenuIcon, ContextMenuPoint } from './context-menu-control.js';

const LOOP_ICON: ContextMenuIcon = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 24 24',
  paint: 'stroke',
  paths: ['M4 12a5 5 0 0 1 5-5h9M15 4l3 3-3 3M20 12a5 5 0 0 1-5 5H6M9 20l-3-3 3-3'],
});

const RANGE_ICON: ContextMenuIcon = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 24 24',
  paint: 'stroke',
  paths: ['M8 4H5v16h3M16 4h3v16h-3M10 12h4'],
});

type ZoomEditMenuRequest = {
  point: ContextMenuPoint;
  onRefine: () => void;
  onLoopify: () => void;
};

export class ZoomEditMenuControl {
  private readonly contextMenu: Pick<ContextMenuControl, 'open'>;
  private readonly text: Pick<ZoomEditModeText, 'editLabel'>;

  constructor({ contextMenu, text }: { contextMenu: Pick<ContextMenuControl, 'open'>; text: Pick<ZoomEditModeText, 'editLabel'> }) {
    this.contextMenu = contextMenu;
    this.text = text;
  }

  open({ point, onRefine, onLoopify }: ZoomEditMenuRequest): void {
    const items: ContextMenuEntry[] = [
      { id: 'zoom-edit-refine', label: this.text.editLabel('refine'), icon: RANGE_ICON, onSelect: onRefine },
      { id: 'zoom-edit-loopify', label: this.text.editLabel('loopify'), icon: LOOP_ICON, onSelect: onLoopify },
    ];
    this.contextMenu.open({ point, items });
  }
}
