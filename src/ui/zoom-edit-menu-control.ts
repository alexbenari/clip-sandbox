import { listZoomVideoEdits } from '../business-logic/video-edit-catalog.js';
import type { VideoEdit } from '../business-logic/video-edit-catalog.js';
import type { ContextMenuController, ContextMenuItem, ContextMenuPoint } from './context-menu-controller.js';

export class ZoomEditMenuControl {
  contextMenuController: Pick<ContextMenuController, 'open'> | null;

  constructor({
    contextMenuController,
  }: { contextMenuController?: Pick<ContextMenuController, 'open'> | null } = {}) {
    this.contextMenuController = contextMenuController || null;
  }

  buildItems({
    isDisabled = false,
    onSelectEdit = () => {},
  }: { isDisabled?: boolean; onSelectEdit?: (edit: VideoEdit) => void } = {}): ContextMenuItem[] {
    return listZoomVideoEdits().map((edit) => ({
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

export function createZoomEditMenuControl(options?: ConstructorParameters<typeof ZoomEditMenuControl>[0]): ZoomEditMenuControl {
  return new ZoomEditMenuControl(options);
}

