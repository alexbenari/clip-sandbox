import type { VideoEdit, VideoEditCatalog } from '../business-logic/video-edit-catalog.js';
import type { ContextMenuControl, ContextMenuItem, ContextMenuPoint } from './context-menu-control.js';

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
  }: { isDisabled?: boolean; onSelectEdit?: (edit: VideoEdit) => void } = {}): ContextMenuItem[] {
    return this.videoEditCatalog.listZoomEdits().map((edit) => ({
      id: `zoom-edit-${edit.id}`,
      label: edit.label,
      icon: edit.icon,
      disabled: !!isDisabled,
      onSelect: () => onSelectEdit(edit),
    }));
  }

  open({
    point = {},
    isDisabled = false,
    onSelectEdit = () => {},
  }: { point?: ContextMenuPoint; isDisabled?: boolean; onSelectEdit?: (edit: VideoEdit) => void } = {}): void {
    this.contextMenu?.open({
      point,
      items: this.buildItems({
        isDisabled,
        onSelectEdit,
      }),
    });
  }
}
