const STEP_BY_KEY: Readonly<Record<string, number>> = Object.freeze({ ArrowLeft: -1, ArrowRight: 1 });

export class ButtonRowArrowKeys {
  static attachTo(root: HTMLElement): void {
    root.addEventListener('keydown', event => ButtonRowArrowKeys.moveFocus(event));
  }

  private static moveFocus(event: KeyboardEvent): void {
    const step = STEP_BY_KEY[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLButtonElement)) return;
    const button = event.target;
    const row = [...(button.parentElement?.children ?? [])]
      .filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement && !element.disabled && !element.hidden);
    const index = row.indexOf(button);
    if (row.length < 2 || index < 0) return;
    row[(index + step + row.length) % row.length].focus();
    event.preventDefault();
  }
}
