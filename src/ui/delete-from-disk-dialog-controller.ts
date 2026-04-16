// @ts-nocheck
import {
  deleteFromDiskConfirmationText,
  deleteFromDiskPreviewOverflowText,
} from '../app/app-text.js';

function isDialogOpen(dialog) {
  return !!(dialog?.open || dialog?.hasAttribute?.('open'));
}

export class DeleteFromDiskDialogController {
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
  } = {}) {
    this.preflightDialog = preflightDialog;
    this.preflightTextEl = preflightTextEl;
    this.confirmDialog = confirmDialog;
    this.confirmSummaryEl = confirmSummaryEl;
    this.confirmPreviewEl = confirmPreviewEl;
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

  isPreflightOpen() {
    return isDialogOpen(this.preflightDialog);
  }

  isConfirmOpen() {
    return isDialogOpen(this.confirmDialog);
  }

  isOpen() {
    return this.isPreflightOpen() || this.isConfirmOpen();
  }

  closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  closePreflight() {
    this.closeDialog(this.preflightDialog);
    this.preflightHandlers = {};
  }

  closeConfirm() {
    this.closeDialog(this.confirmDialog);
    this.confirmHandlers = {};
  }

  closeAll() {
    this.closePreflight();
    this.closeConfirm();
  }

  cancelPreflight() {
    const { onCancel } = this.preflightHandlers;
    this.closePreflight();
    onCancel?.();
  }

  cancelConfirm() {
    const { onCancel } = this.confirmHandlers;
    this.closeConfirm();
    onCancel?.();
  }

  openPreflight({ text = '', onSave = null, onDiscard = null, onCancel = null } = {}) {
    this.preflightHandlers = { onSave, onDiscard, onCancel };
    if (this.preflightTextEl) this.preflightTextEl.textContent = text;
    this.openDialog(this.preflightDialog);
  }

  openConfirm({ summary = '', preview = '', onConfirm = null, onCancel = null } = {}) {
    this.confirmHandlers = { onConfirm, onCancel };
    if (this.confirmSummaryEl) this.confirmSummaryEl.textContent = summary;
    if (this.confirmPreviewEl) this.confirmPreviewEl.textContent = preview;
    this.openDialog(this.confirmDialog);
  }

  openConfirmForDeleteRequest(deleteRequest, { onConfirm = null, onCancel = null } = {}) {
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

  handleGlobalKeyDown(event) {
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

export function createDeleteFromDiskDialogController(options) {
  return new DeleteFromDiskDialogController(options);
}
