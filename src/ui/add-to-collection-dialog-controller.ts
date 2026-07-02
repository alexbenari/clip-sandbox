import {
  saveAsNewNameRequiredText,
  saveAsNewInvalidNameText,
  collectionAlreadyExistsText,
} from '../app/app-text.js';
import { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';

export type AddToCollectionChoice = {
  label: string;
  value: string;
  collectionFilename: string | null;
};

export type AddToCollectionDestination =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; collectionFilename: string | null };

export class AddToCollectionDialogController {
  dialog: HTMLDialogElement | null;
  destinationSelect: HTMLSelectElement | null;
  newCollectionNameLabel: HTMLElement | null;
  newCollectionNameInput: HTMLInputElement | null;
  errorMessageEl: HTMLElement | null;
  confirmBtn: HTMLButtonElement | null;
  cancelBtn: HTMLButtonElement | null;
  newChoiceValue: string;
  validateNewName: (name: string) => string;
  onConfirm: (destination: AddToCollectionDestination) => void;
  onCancel: () => void;
  doc: Document;
  hasSelection: boolean;
  externalError: string;
  choiceByValue: Map<string, AddToCollectionChoice>;

  static validationErrorText(code: string): string {
    if (code === 'required') return saveAsNewNameRequiredText();
    if (code === 'illegal-chars') return saveAsNewInvalidNameText();
    if (code === 'already-exists') return collectionAlreadyExistsText();
    return '';
  }

  static validateName({ name = '', pipeline = null }: { name?: string; pipeline?: Pipeline | null } = {}): string {
    let validationCode: string = Collection.validateCollectionName(name).code;
    if (!validationCode) {
      const candidateFilename = Collection.filenameFromCollectionName(name || '');
      if (pipeline?.getCollectionByFilename(candidateFilename)) validationCode = 'already-exists';
    }
    return AddToCollectionDialogController.validationErrorText(validationCode);
  }

  static buildChoices({ pipeline = null, activeCollectionFilename = '' }: { pipeline?: Pipeline | null; activeCollectionFilename?: string } = {}): AddToCollectionChoice[] {
    if (!pipeline) return [];
    return pipeline.eligibleDestinationCollections(activeCollectionFilename)
      .map((collection) => ({
        label: collection.collectionName,
        value: collection.filename || '',
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
  }: {
    dialog?: HTMLDialogElement | null;
    destinationSelect?: HTMLSelectElement | null;
    newCollectionNameLabel?: HTMLElement | null;
    newCollectionNameInput?: HTMLInputElement | null;
    errorMessageEl?: HTMLElement | null;
    confirmBtn?: HTMLButtonElement | null;
    cancelBtn?: HTMLButtonElement | null;
    newChoiceValue: string;
    validateNewName?: (name: string) => string;
    onConfirm?: (destination: AddToCollectionDestination) => void;
    onCancel?: () => void;
  }) {
    this.dialog = dialog || null;
    this.destinationSelect = destinationSelect || null;
    this.newCollectionNameLabel = newCollectionNameLabel || null;
    this.newCollectionNameInput = newCollectionNameInput || null;
    this.errorMessageEl = errorMessageEl || null;
    this.confirmBtn = confirmBtn || null;
    this.cancelBtn = cancelBtn || null;
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

  isOpen(): boolean {
    return !!this.dialog?.open;
  }

  isNewDestinationSelected(): boolean {
    return this.destinationSelect?.value === this.newChoiceValue;
  }

  clearExternalError(): void {
    this.externalError = '';
  }

  currentDestination(): AddToCollectionDestination {
    const selectedValue = this.destinationSelect?.value || '';
    const selectedChoice = this.choiceByValue.get(selectedValue) || null;
    return this.isNewDestinationSelected()
      ? { kind: 'new', name: this.newCollectionNameInput?.value || '' }
      : { kind: 'existing', collectionFilename: selectedChoice?.collectionFilename || null };
  }

  currentValidationError(): string {
    if (this.externalError) return this.externalError;
    if (!this.isNewDestinationSelected()) return '';
    return this.validateNewName(this.newCollectionNameInput?.value || '');
  }

  focusActiveField(): void {
    if (this.isNewDestinationSelected()) this.newCollectionNameInput?.focus();
    else this.destinationSelect?.focus();
  }

  renderState(): void {
    if (!this.confirmBtn) return;
    const validationError = this.currentValidationError();
    if (this.isNewDestinationSelected()) this.newCollectionNameLabel?.removeAttribute('hidden');
    else this.newCollectionNameLabel?.setAttribute('hidden', '');
    if (this.errorMessageEl) this.errorMessageEl.textContent = validationError;
    this.confirmBtn.disabled = !this.hasSelection || !!validationError;
  }

  renderChoices(choices: AddToCollectionChoice[] = [], { startWithNewCollection = false }: { startWithNewCollection?: boolean } = {}): void {
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
  }: { choices?: AddToCollectionChoice[]; hasSelection?: boolean; startWithNewCollection?: boolean } = {}): void {
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

  close(): void {
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

  showValidationError(text: string, { focusNameInput = false }: { focusNameInput?: boolean } = {}): void {
    this.externalError = text || '';
    this.renderState();
    if (focusNameInput) this.newCollectionNameInput?.focus();
  }
}
