// @ts-nocheck
import {
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  collectionAlreadyExistsText,
} from '../app/app-text.js';
import { Collection } from '../domain/collection.js';

export class SaveAsNewDialogController {
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
  } = {}) {
    this.dialog = dialog;
    this.titleEl = titleEl;
    this.textEl = textEl;
    this.nameInput = nameInput;
    this.errorMessageEl = errorMessageEl;
    this.confirmBtn = confirmBtn;
    this.cancelBtn = cancelBtn;
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

  isOpen() {
    return !!this.dialog && !this.dialog.hidden;
  }

  clearExternalError() {
    this.externalError = '';
  }

  currentValidationError() {
    return this.externalError || this.validateName(this.nameInput?.value || '');
  }

  hasNameInput() {
    return !!String(this.nameInput?.value || '').trim();
  }

  renderState() {
    if (!this.confirmBtn) return;
    const validationError = this.currentValidationError();
    if (this.errorMessageEl) this.errorMessageEl.textContent = validationError;
    this.confirmBtn.disabled = !this.hasNameInput();
  }

  renderCopy({ isPipelineMode = true } = {}) {
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

  open({ isPipelineMode = true } = {}) {
    if (!this.dialog || !this.nameInput) return;
    this.renderCopy({ isPipelineMode });
    this.nameInput.value = '';
    this.clearExternalError();
    this.dialog.hidden = false;
    this.renderState();
    this.nameInput.focus();
  }

  close() {
    if (!this.dialog || !this.nameInput || !this.confirmBtn) return;
    this.dialog.hidden = true;
    this.nameInput.value = '';
    this.clearExternalError();
    if (this.errorMessageEl) this.errorMessageEl.textContent = '';
    this.confirmBtn.disabled = false;
  }

  showValidationError(text, { focusInput = false } = {}) {
    if (!this.nameInput) return;
    this.externalError = text || '';
    this.renderState();
    if (focusInput) this.nameInput.focus();
  }

  handleGlobalKeyDown(event) {
    if (!this.isOpen() || event?.key !== 'Escape') return false;
    this.close();
    this.onCancel();
    return true;
  }
}

export function createSaveAsNewDialogController(options) {
  return new SaveAsNewDialogController(options);
}

export function validateSaveAsNewName({ name = '', pipeline = null } = {}) {
  const validation = Collection.validateCollectionName(name);
  if (validation.code === 'required') return saveAsNewNameRequiredText();
  if (validation.code === 'illegal-chars') return saveAsNewInvalidNameText();
  if (!validation.code && pipeline?.getCollectionByFilename(validation.filename)) {
    return collectionAlreadyExistsText();
  }
  return '';
}
