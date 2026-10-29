import type { VideoEdit, VideoEditCatalog } from '../business-logic/video-edit-catalog.js';
import type { ContextMenuControl, ContextMenuEntry, ContextMenuIcon, ContextMenuPoint } from './context-menu-control.js';

const CHISEL_ICON: ContextMenuIcon = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 16 16',
  paths: [
    'M10.74 1.26a1.5 1.5 0 0 1 2.12 0l1.88 1.88a1.5 1.5 0 0 1 0 2.12L9.47 10.53a1.5 1.5 0 0 1-.73.4l-2.91.64a.75.75 0 0 1-.89-.89l.64-2.91a1.5 1.5 0 0 1 .4-.73Z',
    'M4.47 10.78 1.9 13.35a.75.75 0 1 0 1.06 1.06l2.57-2.57-.31-.31a2.98 2.98 0 0 1-.75-.75Z',
  ],
});

const RANGE_ICON: ContextMenuIcon = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 24 24',
  paint: 'stroke',
  paths: ['M8 4H5v16h3M16 4h3v16h-3M10 12h4'],
});

// The menu's icon for each edit; the catalog knows which edits exist, the menu knows how they look.
const EDIT_ICONS: Readonly<Record<VideoEdit['id'], ContextMenuIcon>> = Object.freeze({ loopify: CHISEL_ICON });

type ZoomEditMenuRequest = {
  isDisabled?: boolean;
  onSelectEdit?: (edit: VideoEdit) => void;
  onRefine?: (() => void) | null;
};

// Refine enters Zoom edit mode, so it is listed apart from the file edits of the catalog.
export class ZoomEditMenuControl {
  contextMenu: Pick<ContextMenuControl, 'open'> | null;
  private readonly videoEditCatalog: Pick<VideoEditCatalog, 'listZoomEdits'>;

  constructor({
    contextMenu,
    videoEditCatalog,
  }: {
    contextMenu?: Pick<ContextMenuControl, 'open'> | null;
    videoEditCatalog: Pick<VideoEditCatalog, 'listZoomEdits'>;
  }) {
    this.contextMenu = contextMenu || null;
    this.videoEditCatalog = videoEditCatalog;
  }

  buildItems({
    isDisabled = false,
    onSelectEdit = () => {},
    onRefine = null,
  }: ZoomEditMenuRequest = {}): ContextMenuEntry[] {
    const fileEdits: ContextMenuEntry[] = this.videoEditCatalog.listZoomEdits().map((edit) => ({
      id: `zoom-edit-${edit.id}`,
      label: edit.label,
      icon: EDIT_ICONS[edit.id],
      disabled: !!isDisabled,
      onSelect: () => onSelectEdit(edit),
    }));
    if (!onRefine) return fileEdits;
    return [
      { id: 'zoom-edit-refine', label: 'Refine', icon: RANGE_ICON, disabled: !!isDisabled, onSelect: onRefine },
      ...(fileEdits.length > 0 ? [{ separator: true } as const, ...fileEdits] : []),
    ];
  }

  open({ point = {}, ...request }: ZoomEditMenuRequest & { point?: ContextMenuPoint } = {}): void {
    this.contextMenu?.open({ point, items: this.buildItems(request) });
  }
}
