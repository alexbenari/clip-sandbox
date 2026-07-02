import {
  deleteFromDiskConfirmationText,
  deleteFromDiskPreviewOverflowText,
} from '../app/app-text.js';

type DeleteDialogHandlers = {
  onSave?: (() => void) | null;
  onDiscard?: (() => void) | null;
  onConfirm?: (() => void) | null;
  onCancel?: (() => void) | null;
};

type DeleteRequestPreview = {
  selectedClipNames: string[];
  affectedSavedCollectionCount: number;
};

function isDialogOpen(dialog: HTMLDialogElement | null): boolean {
  return !!(dialog?.open || dialog?.hasAttribute?.('open'));
}

export class DeleteFromDiskDialogController {
  preflightDialog: HTMLDialogElement | null;
  preflightTextEl: HTMLElement | null;
  confirmDialog: HTMLDialogElement | null;
  confirmSummaryEl: HTMLElement | null;
  confirmPreviewEl: HTMLElement | null;
  preflightHandlers: DeleteDialogHandlers;
  confirmHandlers: DeleteDialogHandlers;

  constructor({
    preflightDialog,
    preflightTextEl,
    confirmPreflightBtn,
    discardPreflightBtn,
    cancelPreflightBtn,
    confirmDialog,
    confirmSummaryEl,
    confirmPreviewEl,
    confirmDeleteBtn,
    cancelDeleteBtn,
  }: {
    preflightDialog?: HTMLDialogElement | null;
    preflightTextEl?: HTMLElement | null;
    confirmPreflightBtn?: HTMLElement | null;
    discardPreflightBtn?: HTMLElement | null;
    cancelPreflightBtn?: HTMLElement | null;
    confirmDialog?: HTMLDialogElement | null;
    confirmSummaryEl?: HTMLElement | null;
    confirmPreviewEl?: HTMLElement | null;
    confirmDeleteBtn?: HTMLElement | null;
    cancelDeleteBtn?: HTMLElement | null;
  } = {}) {
    this.preflightDialog = preflightDialog || null;
    this.preflightTextEl = preflightTextEl || null;
    this.confirmDialog = confirmDialog || null;
    this.confirmSummaryEl = confirmSummaryEl || null;
    this.confirmPreviewEl = confirmPreviewEl || null;
    this.preflightHandlers = {};
    this.confirmHandlers = {};

    confirmPreflightBtn?.addEventListener('click', () => {
      const { onSave } = this.preflightHandlers;
      this.closePreflight();
      onSave?.();
    });
    discardPreflightBtn?.addEventListener('click', () => {
      const { onDiscard } = this.preflightHandlers;
      this.closePreflight();
      onDiscard?.();
    });
    cancelPreflightBtn?.addEventListener('click', () => this.cancelPreflight());
    preflightDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancelPreflight();
    });

    confirmDeleteBtn?.addEventListener('click', () => {
      const { onConfirm } = this.confirmHandlers;
      this.closeConfirm();
      onConfirm?.();
    });
    cancelDeleteBtn?.addEventListener('click', () => this.cancelConfirm());
    confirmDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancelConfirm();
    });
  }

  isPreflightOpen(): boolean {
    return isDialogOpen(this.preflightDialog);
  }

  isConfirmOpen(): boolean {
    return isDialogOpen(this.confirmDialog);
  }

  isOpen(): boolean {
    return this.isPreflightOpen() || this.isConfirmOpen();
  }

  closeDialog(dialog: HTMLDialogElement | null): void {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  openDialog(dialog: HTMLDialogElement | null): void {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  closePreflight(): void {
    this.closeDialog(this.preflightDialog);
    this.preflightHandlers = {};
  }

  closeConfirm(): void {
    this.closeDialog(this.confirmDialog);
    this.confirmHandlers = {};
  }

  closeAll(): void {
    this.closePreflight();
    this.closeConfirm();
  }

  cancelPreflight(): void {
    const { onCancel } = this.preflightHandlers;
    this.closePreflight();
    onCancel?.();
  }

  cancelConfirm(): void {
    const { onCancel } = this.confirmHandlers;
    this.closeConfirm();
    onCancel?.();
  }

  openPreflight({ text = '', onSave = null, onDiscard = null, onCancel = null }: { text?: string } & DeleteDialogHandlers = {}): void {
    this.preflightHandlers = { onSave, onDiscard, onCancel };
    if (this.preflightTextEl) this.preflightTextEl.textContent = text;
    this.openDialog(this.preflightDialog);
  }

  openConfirm({ summary = '', preview = '', onConfirm = null, onCancel = null }: { summary?: string; preview?: string } & DeleteDialogHandlers = {}): void {
    this.confirmHandlers = { onConfirm, onCancel };
    if (this.confirmSummaryEl) this.confirmSummaryEl.textContent = summary;
    if (this.confirmPreviewEl) this.confirmPreviewEl.textContent = preview;
    this.openDialog(this.confirmDialog);
  }

  openConfirmForDeleteRequest(deleteRequest: DeleteRequestPreview | null | undefined, { onConfirm = null, onCancel = null }: DeleteDialogHandlers = {}): void {
    if (!deleteRequest) return;
    const summary = deleteFromDiskConfirmationText(
      deleteRequest.selectedClipNames.length,
      deleteRequest.affectedSavedCollectionCount
    );
    const previewNames = deleteRequest.selectedClipNames.slice(0, 5);
    const hiddenCount = Math.max(0, deleteRequest.selectedClipNames.length - previewNames.length);
    const preview = hiddenCount > 0
      ? `${previewNames.join('\n')}\n${deleteFromDiskPreviewOverflowText(hiddenCount)}`
      : previewNames.join('\n');

    this.openConfirm({
      summary,
      preview,
      onConfirm,
      onCancel,
    });
  }

  handleGlobalKeyDown(event: KeyboardEvent): boolean {
    if (event?.key !== 'Escape') return false;
    if (this.isConfirmOpen()) {
      this.cancelConfirm();
      return true;
    }
    if (this.isPreflightOpen()) {
      this.cancelPreflight();
      return true;
    }
    return false;
  }
}

export function createDeleteFromDiskDialogController(options?: ConstructorParameters<typeof DeleteFromDiskDialogController>[0]): DeleteFromDiskDialogController {
  return new DeleteFromDiskDialogController(options);
}
