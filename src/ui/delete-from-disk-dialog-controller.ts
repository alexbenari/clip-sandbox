import type { AppText } from '../app/app-text.js';
import { DocumentElements } from './document-elements.js';

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

export class DeleteFromDiskDialogController {
  private readonly appText: Pick<AppText, 'deleteFromDiskConfirmationText' | 'deleteFromDiskPreviewOverflowText'>;
  private readonly preflightDialog: HTMLDialogElement | null;
  private readonly preflightTextEl: HTMLElement | null;
  private readonly confirmDialog: HTMLDialogElement | null;
  private readonly confirmSummaryEl: HTMLElement | null;
  private readonly confirmPreviewEl: HTMLElement | null;
  private preflightHandlers: DeleteDialogHandlers;
  private confirmHandlers: DeleteDialogHandlers;

  static fromDocument(doc: Document, { appText }: {
    appText: Pick<AppText, 'deleteFromDiskConfirmationText' | 'deleteFromDiskPreviewOverflowText'>;
  }): DeleteFromDiskDialogController {
    const elements = new DocumentElements(doc);
    return new DeleteFromDiskDialogController({
      appText,
      preflightDialog: elements.optional<HTMLDialogElement>('deletePreflightDialog'),
      preflightTextEl: elements.optional('deletePreflightText'),
      confirmPreflightBtn: elements.optional<HTMLButtonElement>('confirmDeletePreflightBtn'),
      discardPreflightBtn: elements.optional<HTMLButtonElement>('discardDeletePreflightBtn'),
      cancelPreflightBtn: elements.optional<HTMLButtonElement>('cancelDeletePreflightBtn'),
      confirmDialog: elements.optional<HTMLDialogElement>('deleteFromDiskDialog'),
      confirmSummaryEl: elements.optional('deleteFromDiskSummary'),
      confirmPreviewEl: elements.optional('deleteFromDiskPreview'),
      confirmDeleteBtn: elements.optional<HTMLButtonElement>('confirmDeleteFromDiskBtn'),
      cancelDeleteBtn: elements.optional<HTMLButtonElement>('cancelDeleteFromDiskBtn'),
    });
  }

  constructor({
    appText,
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
    appText: Pick<AppText, 'deleteFromDiskConfirmationText' | 'deleteFromDiskPreviewOverflowText'>;
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
  }) {
    this.appText = appText;
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
    return this.isDialogOpen(this.preflightDialog);
  }

  isConfirmOpen(): boolean {
    return this.isDialogOpen(this.confirmDialog);
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
    const summary = this.appText.deleteFromDiskConfirmationText(
      deleteRequest.selectedClipNames.length,
      deleteRequest.affectedSavedCollectionCount
    );
    const previewNames = deleteRequest.selectedClipNames.slice(0, 5);
    const hiddenCount = Math.max(0, deleteRequest.selectedClipNames.length - previewNames.length);
    const preview = hiddenCount > 0
      ? `${previewNames.join('\n')}\n${this.appText.deleteFromDiskPreviewOverflowText(hiddenCount)}`
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

  private isDialogOpen(dialog: HTMLDialogElement | null): boolean {
    return !!(dialog?.open || dialog?.hasAttribute('open'));
  }
}
