import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import type { UnlockedEndpointChange } from '../app/range-refinement-draft.js';
import { DocumentElements } from './document-elements.js';

export interface IDiscardRefinementDialogEvents {
  confirmed: void;
  cancelled: void;
}

type DiscardRefinementDialogParts = Readonly<{
  dialog: HTMLDialogElement;
  question: HTMLElement;
  keepEditing: HTMLButtonElement;
  discard: HTMLButtonElement;
}>;

type QuestionWording = (changes: readonly UnlockedEndpointChange[]) => string;

export class DiscardRefinementDialogControl implements IEventSource<IDiscardRefinementDialogEvents> {
  private readonly events = new EventSource<IDiscardRefinementDialogEvents>();
  private returnFocus: HTMLElement | null = null;

  static fromDocument(doc: Document): DiscardRefinementDialogControl {
    const elements = new DocumentElements(doc);
    return new DiscardRefinementDialogControl({
      dialog: elements.required<HTMLDialogElement>('discardRefinementDialog'),
      question: elements.required('discardRefinementQuestion'),
      keepEditing: elements.required<HTMLButtonElement>('keepRefiningBtn'),
      discard: elements.required<HTMLButtonElement>('discardRefinementBtn'),
    }, changes => `Discard the staged ${changes
      .map(change => `${change.endpoint} (frame ${change.frameIndex.toLocaleString()})`).join(' and ')}?`);
  }

  // Zoom edit mode counts frames from the clip's own start, so its question names the changed ends without numbers.
  static forZoomEdit(doc: Document): DiscardRefinementDialogControl {
    const elements = new DocumentElements(doc);
    return new DiscardRefinementDialogControl({
      dialog: elements.required<HTMLDialogElement>('discardZoomEditDialog'),
      question: elements.required('discardZoomEditQuestion'),
      keepEditing: elements.required<HTMLButtonElement>('keepZoomEditingBtn'),
      discard: elements.required<HTMLButtonElement>('discardZoomEditBtn'),
    }, changes => `Discard the new ${changes.map(change => change.endpoint).join(' and ')}?`);
  }

  private constructor(private readonly parts: DiscardRefinementDialogParts, private readonly questionFor: QuestionWording) {
    parts.keepEditing.addEventListener('click', () => this.answer('cancelled'));
    parts.discard.addEventListener('click', () => this.answer('confirmed'));
    parts.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.answer('cancelled');
    });
    this.close();
  }

  on<TName extends keyof IDiscardRefinementDialogEvents>(name: TName, handler: EventHandler<IDiscardRefinementDialogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  isOpen(): boolean {
    return this.parts.dialog.open || this.parts.dialog.hasAttribute('open');
  }

  open(changes: readonly UnlockedEndpointChange[]): void {
    const { dialog, question, keepEditing } = this.parts;
    question.textContent = this.questionFor(changes);
    if (!this.isOpen()) {
      const focused = dialog.ownerDocument.activeElement;
      this.returnFocus = focused instanceof HTMLElement ? focused : null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    keepEditing.focus();
  }

  close(): void {
    const { dialog } = this.parts;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    const returnFocus = this.returnFocus;
    this.returnFocus = null;
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  private answer(name: keyof IDiscardRefinementDialogEvents): void {
    this.close();
    this.events.emit(name);
  }
}
