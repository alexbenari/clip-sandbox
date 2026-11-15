export interface INewPipelineFieldHandlers {
  submit(name: string): void;
  cancel(): void;
}

export class NewPipelineField {
  readonly element: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly problem: HTMLElement;
  private submittedName: string | null = null;
  private ended = false;

  constructor(doc: Document, private readonly handlers: INewPipelineFieldHandlers) {
    this.element = doc.createElement('div');
    this.element.className = 'new-pipeline-field';
    this.problem = doc.createElement('div');
    this.problem.className = 'new-pipeline-field-problem';
    this.problem.setAttribute('role', 'alert');
    this.problem.hidden = true;
    this.field = doc.createElement('input');
    this.field.type = 'text';
    this.field.spellcheck = false;
    this.field.placeholder = 'Pipeline name';
    this.field.setAttribute('aria-label', 'Pipeline name');
    this.element.append(this.problem, this.field);
    this.bindListeners();
  }

  focus(): void {
    this.field.focus();
  }

  showProblem(text: string): void {
    if (this.ended) return;
    this.problem.textContent = text;
    this.problem.hidden = false;
    this.field.readOnly = false;
    this.field.focus();
    this.field.select();
  }

  get hasFocus(): boolean {
    return this.field.ownerDocument.activeElement === this.field;
  }

  remove(): void {
    if (this.ended) return;
    this.ended = true;
    this.element.remove();
  }

  private bindListeners(): void {
    this.field.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.submit();
      else if (event.key === 'Escape') this.handlers.cancel();
      else return;
      event.preventDefault();
      // Escape closes only this field, not another open surface as well.
      event.stopPropagation();
    });
    this.field.addEventListener('input', () => { this.problem.hidden = true; });
    this.field.addEventListener('blur', () => this.leave());
  }

  private submit(): void {
    if (this.ended || this.field.readOnly) return;
    const name = this.field.value.trim();
    if (!name) {
      this.handlers.cancel();
      return;
    }
    this.submittedName = name;
    this.field.readOnly = true;
    this.handlers.submit(name);
  }

  // Leaving a name that was just refused gives it up, so the field does not take the focus back again.
  private leave(): void {
    if (this.ended || this.field.readOnly) return;
    if (this.field.value.trim() === this.submittedName) this.handlers.cancel();
    else this.submit();
  }
}
