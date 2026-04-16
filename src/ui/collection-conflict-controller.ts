// @ts-nocheck
import {
  collectionConflictSummaryText,
  collectionConflictListText,
} from '../app/app-text.js';

export class CollectionConflictController {
  constructor({
    root,
    summaryEl,
    listEl,
    applyBtn,
    cancelBtn,
  } = {}) {
    this.root = root;
    this.summaryEl = summaryEl;
    this.listEl = listEl;
    this.handlers = {};

    applyBtn?.addEventListener('click', () => {
      const { onApply } = this.handlers;
      this.hide();
      onApply?.();
    });

    cancelBtn?.addEventListener('click', () => {
      const { onCancel } = this.handlers;
      this.hide();
      onCancel?.();
    });
  }

  isVisible() {
    return !!this.root && !this.root.hidden;
  }

  hide() {
    if (!this.root) return;
    this.root.hidden = true;
    if (this.summaryEl) this.summaryEl.textContent = '';
    if (this.listEl) this.listEl.textContent = '';
    this.handlers = {};
  }

  show({ summary = '', list = '', onApply = null, onCancel = null } = {}) {
    if (!this.root) return;
    this.handlers = { onApply, onCancel };
    if (this.summaryEl) this.summaryEl.textContent = summary;
    if (this.listEl) this.listEl.textContent = list;
    this.root.hidden = false;
  }

  showConflict(conflict, handlers = {}) {
    this.show({
      summary: collectionConflictSummaryText(
        conflict?.existingNamesInOrder?.length || 0,
        conflict?.missingCount || 0
      ),
      list: collectionConflictListText(conflict?.missingNames || []),
      onApply: handlers?.onApply,
      onCancel: handlers?.onCancel,
    });
  }
}

export function createCollectionConflictController(options) {
  return new CollectionConflictController(options);
}
