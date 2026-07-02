import {
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  collectionAlreadyExistsText,
} from '../app/app-text.js';
import { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';

export class SaveAsNewDialogController {
  dialog: HTMLElement | null;
  titleEl: HTMLElement | null;
  textEl: HTMLElement | null;
  nameInput: HTMLInputElement | null;
  errorMessageEl: HTMLElement | null;
  confirmBtn: HTMLButtonElement | null;
  cancelBtn: HTMLElement | null;
  validateName: (name: string) => string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  externalError: string;

  constructor({
    dialog,
    titleEl,
    textEl,
    nameInput,
    errorMessageEl,
    confirmBtn,
    cancelBtn,
    validateName = () => '',
    onConfirm = () => {},
    onCancel = () => {},
  }: {
    dialog?: HTMLElement | null;
    titleEl?: HTMLElement | null;
    textEl?: HTMLElement | null;
    nameInput?: HTMLInputElement | null;
    errorMessageEl?: HTMLElement | null;
    confirmBtn?: HTMLButtonElement | null;
    cancelBtn?: HTMLElement | null;
    validateName?: (name: string) => string;
    onConfirm?: (name: string) => void;
    onCancel?: () => void;
  } = {}) {
    this.dialog = dialog || null;
    this.titleEl = titleEl || null;
    this.textEl = textEl || null;
    this.nameInput = nameInput || null;
    this.errorMessageEl = errorMessageEl || null;
    this.confirmBtn = confirmBtn || null;
    this.cancelBtn = cancelBtn || null;
    this.validateName = validateName;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.externalError = '';

    if (!dialog || !nameInput || !confirmBtn) return;

    nameInput.addEventListener('input', () => {
      this.clearExternalError();
      this.renderState();
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || confirmBtn.disabled) return;
      event.preventDefault();
      this.onConfirm(nameInput.value || '');
    });
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      this.onConfirm(nameInput.value || '');
    });
    cancelBtn?.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
  }

  isOpen(): boolean {
    return !!this.dialog && !this.dialog.hidden;
  }

  clearExternalError(): void {
    this.externalError = '';
  }

  currentValidationError(): string {
    return this.externalError || this.validateName(this.nameInput?.value || '');
  }

  hasNameInput(): boolean {
    return !!String(this.nameInput?.value || '').trim();
  }

  renderState(): void {
    if (!this.confirmBtn) return;
    const validationError = this.currentValidationError();
    if (this.errorMessageEl) this.errorMessageEl.textContent = validationError;
    this.confirmBtn.disabled = !this.hasNameInput();
  }

  renderCopy({ isPipelineMode = true }: { isPipelineMode?: boolean } = {}): void {
    if (isPipelineMode) {
      if (this.titleEl) this.titleEl.textContent = 'Save current pipeline view as a collection';
      if (this.textEl) this.textEl.textContent = 'Enter a collection name. The app will add .txt automatically.';
      if (this.confirmBtn) this.confirmBtn.textContent = 'Save Collection';
      return;
    }

    if (this.titleEl) this.titleEl.textContent = 'Save current collection as another collection';
    if (this.textEl) this.textEl.textContent = 'Enter a collection name. The app will add .txt automatically.';
    if (this.confirmBtn) this.confirmBtn.textContent = 'Save Collection';
  }

  open({ isPipelineMode = true }: { isPipelineMode?: boolean } = {}): void {
    if (!this.dialog || !this.nameInput) return;
    this.renderCopy({ isPipelineMode });
    this.nameInput.value = '';
    this.clearExternalError();
    this.dialog.hidden = false;
    this.renderState();
    this.nameInput.focus();
  }

  close(): void {
    if (!this.dialog || !this.nameInput || !this.confirmBtn) return;
    this.dialog.hidden = true;
    this.nameInput.value = '';
    this.clearExternalError();
    if (this.errorMessageEl) this.errorMessageEl.textContent = '';
    this.confirmBtn.disabled = false;
  }

  showValidationError(text: string, { focusInput = false }: { focusInput?: boolean } = {}): void {
    if (!this.nameInput) return;
    this.externalError = text || '';
    this.renderState();
    if (focusInput) this.nameInput.focus();
  }

  handleGlobalKeyDown(event: KeyboardEvent): boolean {
    if (!this.isOpen() || event?.key !== 'Escape') return false;
    this.close();
    this.onCancel();
    return true;
  }
}

export function createSaveAsNewDialogController(options?: ConstructorParameters<typeof SaveAsNewDialogController>[0]): SaveAsNewDialogController {
  return new SaveAsNewDialogController(options);
}

export function validateSaveAsNewName({ name = '', pipeline = null }: { name?: string; pipeline?: Pipeline | null } = {}): string {
  const validation = Collection.validateCollectionName(name);
  if (validation.code === 'required') return saveAsNewNameRequiredText();
  if (validation.code === 'illegal-chars') return saveAsNewInvalidNameText();
  if (!validation.code && pipeline?.getCollectionByFilename(validation.filename)) {
    return collectionAlreadyExistsText();
  }
  return '';
}
