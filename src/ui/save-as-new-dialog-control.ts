import { EventSource, type EventHandler, type IEventSource, type IEventSubscriberCount } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';

export interface ISaveAsNewDialogEvents {
  confirmed: string;
  cancelled: void;
}

export class SaveAsNewDialogControl implements IEventSource<ISaveAsNewDialogEvents>, IEventSubscriberCount<ISaveAsNewDialogEvents> {
  private readonly dialog: HTMLElement | null;
  private readonly titleEl: HTMLElement | null;
  private readonly textEl: HTMLElement | null;
  private readonly nameInput: HTMLInputElement | null;
  private readonly errorMessageEl: HTMLElement | null;
  private readonly confirmBtn: HTMLButtonElement | null;
  private readonly cancelBtn: HTMLElement | null;
  private readonly validateName: (name: string) => string;
  private readonly events = new EventSource<ISaveAsNewDialogEvents>();
  private externalError: string;

  static fromDocument(doc: Document, { validateName }: { validateName?: (name: string) => string } = {}): SaveAsNewDialogControl {
    const elements = new DocumentElements(doc);
    const dialog = elements.required('saveAsNewDialog');
    return new SaveAsNewDialogControl({
      dialog,
      titleEl: dialog.querySelector<HTMLElement>('h2'),
      textEl: dialog.querySelector<HTMLElement>('p'),
      nameInput: elements.required<HTMLInputElement>('saveAsNewNameInput'),
      errorMessageEl: elements.required('saveAsNewError'),
      confirmBtn: elements.required<HTMLButtonElement>('confirmSaveAsNewBtn'),
      cancelBtn: elements.required<HTMLButtonElement>('cancelSaveAsNewBtn'),
      validateName,
    });
  }

  constructor({
    dialog,
    titleEl,
    textEl,
    nameInput,
    errorMessageEl,
    confirmBtn,
    cancelBtn,
    validateName = () => '',
  }: {
    dialog?: HTMLElement | null;
    titleEl?: HTMLElement | null;
    textEl?: HTMLElement | null;
    nameInput?: HTMLInputElement | null;
    errorMessageEl?: HTMLElement | null;
    confirmBtn?: HTMLButtonElement | null;
    cancelBtn?: HTMLElement | null;
    validateName?: (name: string) => string;
  } = {}) {
    this.dialog = dialog || null;
    this.titleEl = titleEl || null;
    this.textEl = textEl || null;
    this.nameInput = nameInput || null;
    this.errorMessageEl = errorMessageEl || null;
    this.confirmBtn = confirmBtn || null;
    this.cancelBtn = cancelBtn || null;
    this.validateName = validateName;
    this.externalError = '';

    if (!dialog || !nameInput || !confirmBtn) return;

    nameInput.addEventListener('input', () => {
      this.clearExternalError();
      this.renderState();
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || confirmBtn.disabled) return;
      event.preventDefault();
      this.events.emit('confirmed', nameInput.value || '');
    });
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      this.events.emit('confirmed', nameInput.value || '');
    });
    cancelBtn?.addEventListener('click', () => {
      this.close();
      this.events.emit('cancelled');
    });
    this.close();
  }

  on<TName extends keyof ISaveAsNewDialogEvents>(name: TName, handler: EventHandler<ISaveAsNewDialogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  subscriberCount(name: keyof ISaveAsNewDialogEvents): number {
    return this.events.subscriberCount(name);
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
    this.events.emit('cancelled');
    return true;
  }
}
