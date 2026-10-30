import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import type { UnlockedEndpointChange } from '../app/range-refinement-draft.js';
import type { ZoomEditModeText } from '../app/zoom-edit-mode-text.js';
import type { ZoomEditStagedChange } from '../app/staged-edit.js';
import { ButtonRowArrowKeys } from './button-row-arrow-keys.js';
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

type QuestionWording<TChange> = (changes: readonly TChange[]) => string;

export class DiscardRefinementDialogControl<TChange> implements IEventSource<IDiscardRefinementDialogEvents> {
  private readonly events = new EventSource<IDiscardRefinementDialogEvents>();
  private returnFocus: HTMLElement | null = null;

  static fromDocument(doc: Document): DiscardRefinementDialogControl<UnlockedEndpointChange> {
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
  static forZoomEdit(doc: Document, { text }: { text: Pick<ZoomEditModeText, 'editLabel'> }): DiscardRefinementDialogControl<ZoomEditStagedChange> {
    const elements = new DocumentElements(doc);
    return new DiscardRefinementDialogControl<ZoomEditStagedChange>({
      dialog: elements.required<HTMLDialogElement>('discardZoomEditDialog'),
      question: elements.required('discardZoomEditQuestion'),
      keepEditing: elements.required<HTMLButtonElement>('keepZoomEditingBtn'),
      discard: elements.required<HTMLButtonElement>('discardZoomEditBtn'),
    }, changes => {
      const ends = changes.filter(change => change === 'start' || change === 'end');
      const edits = changes.filter(change => change !== 'start' && change !== 'end');
      const discarded = [
        ...edits.map(edit => text.editLabel(edit)),
        ...(ends.length > 0 ? [`the new ${ends.join(' and ')}`] : []),
      ];
      return `Discard ${discarded.join(' and ')}?`;
    });
  }

  private constructor(private readonly parts: DiscardRefinementDialogParts, private readonly questionFor: QuestionWording<TChange>) {
    parts.keepEditing.addEventListener('click', () => this.answer('cancelled'));
    parts.discard.addEventListener('click', () => this.answer('confirmed'));
    parts.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.answer('cancelled');
    });
    ButtonRowArrowKeys.attachTo(parts.dialog);
    this.close();
  }

  on<TName extends keyof IDiscardRefinementDialogEvents>(name: TName, handler: EventHandler<IDiscardRefinementDialogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  isOpen(): boolean {
    return this.parts.dialog.open || this.parts.dialog.hasAttribute('open');
  }

  open(changes: readonly TChange[]): void {
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
