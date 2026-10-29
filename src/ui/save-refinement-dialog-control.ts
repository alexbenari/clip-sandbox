import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import type { RefinedClipSaveOutcome } from '../app/refined-clip-save-service.js';
import { DocumentElements } from './document-elements.js';

export interface ISaveRefinementDialogEvents {
  confirmed: RefinedClipSaveOutcome;
  cancelled: void;
}

type SaveRefinementDialogParts = Readonly<{
  dialog: HTMLDialogElement;
  explanation: HTMLElement;
  cancel: HTMLButtonElement;
  replace: HTMLButtonElement;
  keepBoth: HTMLButtonElement;
}>;

export class SaveRefinementDialogControl implements IEventSource<ISaveRefinementDialogEvents> {
  private readonly events = new EventSource<ISaveRefinementDialogEvents>();
  private returnFocus: HTMLElement | null = null;

  static fromDocument(doc: Document): SaveRefinementDialogControl {
    const elements = new DocumentElements(doc);
    return new SaveRefinementDialogControl({
      dialog: elements.required<HTMLDialogElement>('saveRefinementDialog'),
      explanation: elements.required('saveRefinementExplanation'),
      cancel: elements.required<HTMLButtonElement>('cancelSaveRefinementBtn'),
      replace: elements.required<HTMLButtonElement>('replaceRefinedClipBtn'),
      keepBoth: elements.required<HTMLButtonElement>('keepBothRefinedClipBtn'),
    });
  }

  private constructor(private readonly parts: SaveRefinementDialogParts) {
    parts.cancel.addEventListener('click', () => this.cancel());
    parts.replace.addEventListener('click', () => this.confirm('replace'));
    parts.keepBoth.addEventListener('click', () => this.confirm('keep-both'));
    parts.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.cancel();
    });
    this.close();
  }

  on<TName extends keyof ISaveRefinementDialogEvents>(name: TName, handler: EventHandler<ISaveRefinementDialogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  isOpen(): boolean {
    return this.parts.dialog.open || this.parts.dialog.hasAttribute('open');
  }

  open(filename: string): void {
    const { dialog, explanation, keepBoth } = this.parts;
    explanation.textContent = `Keep both adds the refined clip next to ${filename}. `
      + `Replace puts it in place of ${filename} and moves the original to the Recycle Bin.`;
    if (!this.isOpen()) {
      const focused = dialog.ownerDocument.activeElement;
      this.returnFocus = focused instanceof HTMLElement ? focused : null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    keepBoth.focus();
  }

  close(): void {
    const { dialog } = this.parts;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    const returnFocus = this.returnFocus;
    this.returnFocus = null;
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  private confirm(outcome: RefinedClipSaveOutcome): void {
    this.close();
    this.events.emit('confirmed', outcome);
  }

  private cancel(): void {
    this.close();
    this.events.emit('cancelled');
  }
}
