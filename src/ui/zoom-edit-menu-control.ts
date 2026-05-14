// @ts-nocheck
import { listZoomVideoEdits } from '../business-logic/video-edit-catalog.js';

export class ZoomEditMenuControl {
  constructor({
    contextMenuController,
  } = {}) {
    this.contextMenuController = contextMenuController;
  }

  buildItems({
    isDisabled = false,
    onSelectEdit = () => {},
  } = {}) {
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
  } = {}) {
    this.contextMenuController?.open({
      point,
      items: this.buildItems({
        isDisabled,
        onSelectEdit,
      }),
    });
  }
}

export function createZoomEditMenuControl(options) {
  return new ZoomEditMenuControl(options);
}

