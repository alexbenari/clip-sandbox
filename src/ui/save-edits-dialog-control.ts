import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import type { EditedClipSaveOutcome } from '../app/edited-clip-save-service.js';
import type { ZoomEditModeText } from '../app/zoom-edit-mode-text.js';
import type { ZoomEditComposition } from '../domain/zoom-edit-composition.js';
import { DocumentElements } from './document-elements.js';

export interface ISaveEditsDialogEvents {
  confirmed: EditedClipSaveOutcome;
  cancelled: void;
}

type SaveEditsDialogParts = Readonly<{
  dialog: HTMLDialogElement;
  title: HTMLElement;
  explanation: HTMLElement;
  cancel: HTMLButtonElement;
  replace: HTMLButtonElement;
  keepBoth: HTMLButtonElement;
}>;

export class SaveEditsDialogControl implements IEventSource<ISaveEditsDialogEvents> {
  private readonly events = new EventSource<ISaveEditsDialogEvents>();
  private returnFocus: HTMLElement | null = null;

  static fromDocument(doc: Document, { text }: { text: Pick<ZoomEditModeText, 'editedClip' | 'saveLoss'> }): SaveEditsDialogControl {
    const elements = new DocumentElements(doc);
    return new SaveEditsDialogControl({
      dialog: elements.required<HTMLDialogElement>('saveEditsDialog'),
      title: elements.required('saveEditsTitle'),
      explanation: elements.required('saveEditsExplanation'),
      cancel: elements.required<HTMLButtonElement>('cancelSaveEditsBtn'),
      replace: elements.required<HTMLButtonElement>('replaceEditedClipBtn'),
      keepBoth: elements.required<HTMLButtonElement>('keepBothEditedClipBtn'),
    }, text);
  }

  private constructor(private readonly parts: SaveEditsDialogParts, private readonly text: Pick<ZoomEditModeText, 'editedClip' | 'saveLoss'>) {
    parts.cancel.addEventListener('click', () => this.cancel());
    parts.replace.addEventListener('click', () => this.confirm('replace'));
    parts.keepBoth.addEventListener('click', () => this.confirm('keep-both'));
    parts.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.cancel();
    });
    this.close();
  }

  on<TName extends keyof ISaveEditsDialogEvents>(name: TName, handler: EventHandler<ISaveEditsDialogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  isOpen(): boolean {
    return this.parts.dialog.open || this.parts.dialog.hasAttribute('open');
  }

  open({ filename, edits }: Readonly<{ filename: string; edits: ZoomEditComposition }>): void {
    const { dialog, title, explanation, keepBoth } = this.parts;
    const clip = this.text.editedClip(edits);
    const loss = this.text.saveLoss(edits);
    title.textContent = `Save the ${clip}`;
    explanation.textContent = `Keep both adds the ${clip} next to ${filename}. `
      + `Replace puts it in place of ${filename} and moves the original to the Recycle Bin.${loss ? ` ${loss}` : ''}`;
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

  private confirm(outcome: EditedClipSaveOutcome): void {
    this.close();
    this.events.emit('confirmed', outcome);
  }

  private cancel(): void {
    this.close();
    this.events.emit('cancelled');
  }
}
