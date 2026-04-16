// @ts-nocheck
function isDialogOpen(dialog) {
  return !!(dialog?.open || dialog?.hasAttribute?.('open'));
}

export class UnsavedChangesDialogController {
  constructor({
    dialog,
    messageEl,
    confirmBtn,
    discardBtn,
    cancelBtn,
  } = {}) {
    this.dialog = dialog;
    this.messageEl = messageEl;
    this.handlers = {};

    confirmBtn?.addEventListener('click', () => {
      const { onSave } = this.handlers;
      this.close();
      onSave?.();
    });
    discardBtn?.addEventListener('click', () => {
      const { onDiscard } = this.handlers;
      this.close();
      onDiscard?.();
    });
    cancelBtn?.addEventListener('click', () => this.cancelFlow());
    dialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.cancelFlow();
    });
  }

  isOpen() {
    return isDialogOpen(this.dialog);
  }

  resetHandlers() {
    this.handlers = {};
  }

  open({ message = '', onSave = null, onDiscard = null, onCancel = null } = {}) {
    if (!this.dialog) return;
    this.handlers = { onSave, onDiscard, onCancel };
    if (this.messageEl) this.messageEl.textContent = message;
    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
      return;
    }
    this.dialog.setAttribute('open', '');
  }

  close() {
    if (!this.dialog) return;
    if (typeof this.dialog.close === 'function' && this.dialog.open) {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute('open');
    }
    this.resetHandlers();
  }

  cancelFlow() {
    const { onCancel } = this.handlers;
    this.close();
    onCancel?.();
  }

  handleGlobalKeyDown(event) {
    if (!this.isOpen() || event?.key !== 'Escape') return false;
    this.cancelFlow();
    return true;
  }
}

export function createUnsavedChangesDialogController(options) {
  return new UnsavedChangesDialogController(options);
}
