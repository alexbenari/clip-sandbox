// @ts-nocheck
export class StatusBarControl {
  constructor({ statusEl, win = window } = {}) {
    this.statusEl = statusEl;
    this.win = win;
    this.statusTimer = null;
  }

  show(message, timeout = 2500) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.hidden = false;
    this.win.clearTimeout(this.statusTimer);
    this.statusTimer = this.win.setTimeout(() => {
      this.statusEl.hidden = true;
    }, timeout);
  }
}

export function createStatusBarControl(options) {
  return new StatusBarControl(options);
}
