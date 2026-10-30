import type { ClipRenameProblem } from '../app/clip-rename-service.js';

export interface IClipNameEditorHandlers {
  submit(newFilename: string): void;
  cancel(): void;
}

const PROBLEM_TEXT: Readonly<Record<ClipRenameProblem, string>> = Object.freeze({
  'invalid-name': 'Windows cannot use this name. Avoid \\ / : * ? " < > | and a dot or space at the end.',
  'name-taken': 'Another file in this folder already has this name.',
  'not-a-file': 'The clip is no longer in this folder. Press Escape, then open the folder again.',
  'folder-not-open': 'The folder is no longer open. Press Escape, then open it again.',
  failed: 'The clip could not be renamed. Check that no other program is using it, then try again.',
});

const RENAMING_CLASS = 'renaming';

export class ClipNameEditor {
  private readonly root: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly problem: HTMLElement;
  private readonly extension: string;
  private readonly originalStem: string;
  private readonly wasDraggable: boolean;
  private submittedStem: string | null = null;
  private ended = false;

  constructor(private readonly card: HTMLElement, filename: string, private readonly handlers: IClipNameEditorHandlers) {
    const doc = card.ownerDocument;
    const dot = filename.lastIndexOf('.');
    this.extension = dot > 0 ? filename.slice(dot) : '';
    this.originalStem = filename.slice(0, filename.length - this.extension.length);
    this.root = doc.createElement('div');
    this.root.className = 'filename-editor';
    this.problem = doc.createElement('div');
    this.problem.className = 'filename-editor-problem';
    this.problem.setAttribute('role', 'alert');
    this.problem.hidden = true;
    this.field = doc.createElement('input');
    this.field.type = 'text';
    this.field.spellcheck = false;
    this.field.value = this.originalStem;
    this.field.setAttribute('aria-label', `New name for ${filename}`);
    this.root.append(this.problem, this.field);
    this.bindListeners();
    this.wasDraggable = card.draggable;
    card.draggable = false;
    card.classList.add(RENAMING_CLASS);
    card.append(this.root);
    this.field.focus();
    this.field.select();
  }

  showProblem(problem: ClipRenameProblem): void {
    if (this.ended) return;
    this.problem.textContent = PROBLEM_TEXT[problem];
    this.problem.hidden = false;
    this.field.readOnly = false;
    this.field.focus();
    this.field.select();
  }

  remove(): void {
    if (this.ended) return;
    this.ended = true;
    const hadFocus = this.card.ownerDocument.activeElement === this.field;
    this.root.remove();
    this.card.classList.remove(RENAMING_CLASS);
    this.card.draggable = this.wasDraggable;
    if (hadFocus && this.card.isConnected) this.card.focus();
  }

  private bindListeners(): void {
    this.field.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.submit();
      else if (event.key === 'Escape') this.cancel();
      else return;
      event.preventDefault();
    });
    this.field.addEventListener('input', () => { this.problem.hidden = true; });
    this.field.addEventListener('blur', () => this.leave());
    // The card behind the field selects, opens, drags or offers its menu on these.
    for (const name of ['click', 'dblclick', 'mousedown', 'dragstart', 'contextmenu']) {
      this.root.addEventListener(name, event => event.stopPropagation());
    }
  }

  private submit(): void {
    if (this.ended || this.field.readOnly) return;
    const stem = this.field.value.trim();
    if (stem === this.originalStem) {
      this.handlers.cancel();
      return;
    }
    this.submittedStem = stem;
    this.field.readOnly = true;
    this.handlers.submit(stem + this.extension);
  }

  private cancel(): void {
    if (!this.ended) this.handlers.cancel();
  }

  // Leaving a name that was just refused gives it up, so the field does not take the focus back again.
  private leave(): void {
    if (this.ended || this.field.readOnly) return;
    if (this.field.value.trim() === this.submittedStem) this.handlers.cancel();
    else this.submit();
  }
}
