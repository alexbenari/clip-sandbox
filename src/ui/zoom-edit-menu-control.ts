import type { VideoEdit, VideoEditCatalog } from '../business-logic/video-edit-catalog.js';
import type { ContextMenuController, ContextMenuItem, ContextMenuPoint } from './context-menu-controller.js';

export class ZoomEditMenuControl {
  contextMenuController: Pick<ContextMenuController, 'open'> | null;
  private readonly videoEditCatalog: Pick<VideoEditCatalog, 'listZoomEdits'>;

  constructor({
    contextMenuController,
    videoEditCatalog,
  }: {
    contextMenuController?: Pick<ContextMenuController, 'open'> | null;
    videoEditCatalog: Pick<VideoEditCatalog, 'listZoomEdits'>;
  }) {
    this.contextMenuController = contextMenuController || null;
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
    this.contextMenuController?.open({
      point,
      items: this.buildItems({
        isDisabled,
        onSelectEdit,
      }),
    });
  }
}
