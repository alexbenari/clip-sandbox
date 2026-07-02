export class StatusBarControl {
  statusEl: HTMLElement | null;
  win: Window;
  statusTimer: number | null;

  constructor({ statusEl, win = window }: { statusEl?: HTMLElement | null; win?: Window } = {}) {
    this.statusEl = statusEl || null;
    this.win = win;
    this.statusTimer = null;
  }

  show(message: string, timeout = 2500): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.hidden = false;
    if (this.statusTimer) this.win.clearTimeout(this.statusTimer);
    const statusEl = this.statusEl;
    this.statusTimer = this.win.setTimeout(() => {
      statusEl.hidden = true;
    }, timeout);
  }
}

export function createStatusBarControl(options?: ConstructorParameters<typeof StatusBarControl>[0]): StatusBarControl {
  return new StatusBarControl(options);
}
