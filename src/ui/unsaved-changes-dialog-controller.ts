type DialogHandlers = {
  onSave?: (() => void) | null;
  onDiscard?: (() => void) | null;
  onCancel?: (() => void) | null;
};

export class UnsavedChangesDialogController {
  private readonly dialog: HTMLDialogElement | null;
  private readonly messageEl: HTMLElement | null;
  private handlers: DialogHandlers;

  constructor({
    dialog,
    messageEl,
    confirmBtn,
    discardBtn,
    cancelBtn,
  }: {
    dialog?: HTMLDialogElement | null;
    messageEl?: HTMLElement | null;
    confirmBtn?: HTMLElement | null;
    discardBtn?: HTMLElement | null;
    cancelBtn?: HTMLElement | null;
  } = {}) {
    this.dialog = dialog || null;
    this.messageEl = messageEl || null;
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

  isOpen(): boolean {
    return this.isDialogOpen();
  }

  resetHandlers(): void {
    this.handlers = {};
  }

  open({ message = '', onSave = null, onDiscard = null, onCancel = null }: { message?: string } & DialogHandlers = {}): void {
    if (!this.dialog) return;
    this.handlers = { onSave, onDiscard, onCancel };
    if (this.messageEl) this.messageEl.textContent = message;
    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
      return;
    }
    this.dialog.setAttribute('open', '');
  }

  close(): void {
    if (!this.dialog) return;
    if (typeof this.dialog.close === 'function' && this.dialog.open) {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute('open');
    }
    this.resetHandlers();
  }

  cancelFlow(): void {
    const { onCancel } = this.handlers;
    this.close();
    onCancel?.();
  }

  handleGlobalKeyDown(event: KeyboardEvent): boolean {
    if (!this.isOpen() || event?.key !== 'Escape') return false;
    this.cancelFlow();
    return true;
  }

  private isDialogOpen(): boolean {
    return !!(this.dialog?.open || this.dialog?.hasAttribute('open'));
  }
}
