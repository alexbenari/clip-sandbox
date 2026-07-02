import {
  collectionConflictSummaryText,
  collectionConflictListText,
} from '../app/app-text.js';

type ConflictHandlers = {
  onApply?: (() => void) | null;
  onCancel?: (() => void) | null;
};

type CollectionConflict = {
  existingNamesInOrder?: string[];
  missingCount?: number;
  missingNames?: string[];
};

export class CollectionConflictController {
  root: HTMLElement | null;
  summaryEl: HTMLElement | null;
  listEl: HTMLElement | null;
  handlers: ConflictHandlers;

  constructor({
    root,
    summaryEl,
    listEl,
    applyBtn,
    cancelBtn,
  }: {
    root?: HTMLElement | null;
    summaryEl?: HTMLElement | null;
    listEl?: HTMLElement | null;
    applyBtn?: HTMLElement | null;
    cancelBtn?: HTMLElement | null;
  } = {}) {
    this.root = root || null;
    this.summaryEl = summaryEl || null;
    this.listEl = listEl || null;
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

  isVisible(): boolean {
    return !!this.root && !this.root.hidden;
  }

  hide(): void {
    if (!this.root) return;
    this.root.hidden = true;
    if (this.summaryEl) this.summaryEl.textContent = '';
    if (this.listEl) this.listEl.textContent = '';
    this.handlers = {};
  }

  show({ summary = '', list = '', onApply = null, onCancel = null }: { summary?: string; list?: string } & ConflictHandlers = {}): void {
    if (!this.root) return;
    this.handlers = { onApply, onCancel };
    if (this.summaryEl) this.summaryEl.textContent = summary;
    if (this.listEl) this.listEl.textContent = list;
    this.root.hidden = false;
  }

  showConflict(conflict: CollectionConflict | null | undefined, handlers: ConflictHandlers = {}): void {
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

export function createCollectionConflictController(options?: ConstructorParameters<typeof CollectionConflictController>[0]): CollectionConflictController {
  return new CollectionConflictController(options);
}
