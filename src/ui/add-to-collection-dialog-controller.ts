// @ts-nocheck
import {
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  collectionAlreadyExistsText,
} from '../app/app-text.js';
import { Collection } from '../domain/collection.js';

export class AddToCollectionDialogController {
  static validationErrorText(code) {
    if (code === 'required') return saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (code === 'already-exists') return collectionAlreadyExistsText();
    return '';
  }

  static validateName({ name = '', pipeline = null } = {}) {
    let validationCode = Collection.validateCollectionName(name).code;
    if (!validationCode) {
      const candidateFilename = Collection.filenameFromCollectionName(name || '');
      if (pipeline?.getCollectionByFilename(candidateFilename)) validationCode = 'already-exists';
    }
    return AddToCollectionDialogController.validationErrorText(validationCode);
  }

  static buildChoices({ pipeline = null, activeCollectionFilename = '' } = {}) {
    if (!pipeline) return [];
    return pipeline.eligibleDestinationCollections(activeCollectionFilename)
      .map((collection) => ({
        label: collection.collectionName,
        value: collection.filename,
        collectionFilename: collection.filename,
      }));
  }

  constructor({
    dialog,
    destinationSelect,
    newCollectionNameLabel,
    newCollectionNameInput,
    errorMessageEl,
    confirmBtn,
    cancelBtn,
    newChoiceValue,
    validateNewName = () => '',
    onConfirm = () => {},
    onCancel = () => {},
  } = {}) {
    this.dialog = dialog;
    this.destinationSelect = destinationSelect;
    this.newCollectionNameLabel = newCollectionNameLabel;
    this.newCollectionNameInput = newCollectionNameInput;
    this.errorMessageEl = errorMessageEl;
    this.confirmBtn = confirmBtn;
    this.cancelBtn = cancelBtn;
    this.newChoiceValue = newChoiceValue;
    this.validateNewName = validateNewName;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.doc = dialog?.ownerDocument || document;
    this.hasSelection = false;
    this.externalError = '';
    this.choiceByValue = new Map();

    if (!dialog || !destinationSelect || !newCollectionNameInput || !confirmBtn) return;

    destinationSelect.addEventListener('change', () => {
      this.clearExternalError();
      this.renderState();
      this.focusActiveField();
    });
    newCollectionNameInput.addEventListener('input', () => {
      this.clearExternalError();
      this.renderState();
    });
    newCollectionNameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || confirmBtn.disabled) return;
      event.preventDefault();
      this.onConfirm(this.currentDestination());
    });
    confirmBtn.addEventListener('click', () => this.onConfirm(this.currentDestination()));
    cancelBtn?.addEventListener('click', () => {
      this.close();
      this.onCancel();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
      this.onCancel();
    });
  }

  isOpen() {
    return !!this.dialog?.open;
  }

  isNewDestinationSelected() {
    return this.destinationSelect?.value === this.newChoiceValue;
  }

  clearExternalError() {
    this.externalError = '';
  }

  currentDestination() {
    const selectedChoice = this.choiceByValue.get(this.destinationSelect?.value) || null;
    return this.isNewDestinationSelected()
      ? { kind: 'new', name: this.newCollectionNameInput?.value || '' }
      : { kind: 'existing', collectionFilename: selectedChoice?.collectionFilename || null };
  }

  currentValidationError() {
    if (this.externalError) return this.externalError;
    if (!this.isNewDestinationSelected()) return '';
    return this.validateNewName(this.newCollectionNameInput?.value || '');
  }

  focusActiveField() {
    if (this.isNewDestinationSelected()) this.newCollectionNameInput?.focus();
    else this.destinationSelect?.focus();
  }

  renderState() {
    if (!this.confirmBtn) return;
    const validationError = this.currentValidationError();
    if (this.isNewDestinationSelected()) this.newCollectionNameLabel?.removeAttribute('hidden');
    else this.newCollectionNameLabel?.setAttribute('hidden', '');
    if (this.errorMessageEl) this.errorMessageEl.textContent = validationError;
    this.confirmBtn.disabled = !this.hasSelection || !!validationError;
  }

  renderChoices(choices = [], { startWithNewCollection = false } = {}) {
    if (!this.destinationSelect) return;
    this.choiceByValue = new Map();
    this.destinationSelect.innerHTML = '';
    for (const choice of Array.from(choices)) {
      this.choiceByValue.set(choice.value, choice);
      const option = this.doc.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      this.destinationSelect.appendChild(option);
    }
    const newOption = this.doc.createElement('option');
    newOption.value = this.newChoiceValue;
    newOption.textContent = 'New collection...';
    this.destinationSelect.appendChild(newOption);
    this.destinationSelect.value = startWithNewCollection
      ? this.newChoiceValue
      : choices[0]?.value || this.newChoiceValue;
  }

  open({
    choices = [],
    hasSelection: nextHasSelection = false,
    startWithNewCollection = false,
  } = {}) {
    if (!this.dialog || !this.newCollectionNameInput) return;
    this.hasSelection = !!nextHasSelection;
    this.newCollectionNameInput.value = '';
    this.clearExternalError();
    this.renderChoices(choices, { startWithNewCollection });
    this.renderState();
    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }
    this.focusActiveField();
  }

  close() {
    if (!this.dialog || !this.newCollectionNameInput) return;
    this.newCollectionNameInput.value = '';
    this.clearExternalError();
    if (this.errorMessageEl) this.errorMessageEl.textContent = '';
    this.newCollectionNameLabel?.setAttribute('hidden', '');
    if (typeof this.dialog.close === 'function' && this.dialog.open) {
      this.dialog.close();
      return;
    }
    this.dialog.removeAttribute('open');
  }

  showValidationError(text, { focusNameInput = false } = {}) {
    this.externalError = text || '';
    this.renderState();
    if (focusNameInput) this.newCollectionNameInput?.focus();
  }
}
