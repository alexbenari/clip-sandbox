import WaPopover from '@awesome.me/webawesome/dist/components/popover/popover.js';

function element<T extends HTMLElement>(selector: string, type: { new (...args: never[]): T }): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing shell fixture: ${selector}`);
  return found;
}

class ShellPanel {
  constructor(private readonly split: HTMLElement, private readonly panel: HTMLElement) {
    panel.querySelector('.fold')?.addEventListener('click', () => this.fold(true));
    panel.querySelector('.reveal')?.addEventListener('click', () => this.fold(false));
  }
  private fold(folded: boolean): void {
    const content = this.panel.querySelector<HTMLElement>('.panel-content');
    const fold = this.panel.querySelector<HTMLButtonElement>('.fold');
    const reveal = this.panel.querySelector<HTMLButtonElement>('.reveal');
    if (!content || !fold || !reveal) throw new Error('Incomplete panel');
    const transfer = this.panel.contains(document.activeElement);
    this.split.classList.toggle('folded', folded);
    content.inert = folded;
    content.setAttribute('aria-hidden', String(folded));
    reveal.hidden = !folded;
    fold.setAttribute('aria-expanded', String(!folded));
    reveal.setAttribute('aria-expanded', String(!folded));
    if (transfer) (folded ? reveal : fold).focus();
    window.dispatchEvent(new CustomEvent('shell-panel-request', { detail: { duration: folded ? 240 : 280 } }));
  }
}

class ShellUtilities {
  private desired: HTMLButtonElement | null = null;
  private invoking: HTMLButtonElement | null = null;
  private closing = false;
  private pendingFocus: HTMLButtonElement | null = null;
  constructor(private readonly popover: WaPopover, private readonly triggers: HTMLButtonElement[]) {
    for (const trigger of triggers) trigger.addEventListener('click', event => {
      event.stopImmediatePropagation();
      this.request(this.desired === trigger ? null : trigger);
    });
    popover.addEventListener('wa-hide', () => {
      this.closing = true;
      this.pendingFocus = null;
      this.desired = null;
      this.syncAria();
      this.invoking?.focus({ preventScroll: true });
    });
    popover.addEventListener('wa-after-hide', () => {
      this.closing = false;
      if (this.desired) this.show(this.desired);
      else this.invoking?.focus({ preventScroll: true });
    });
    popover.addEventListener('wa-reposition', () => this.focusPending());
    popover.addEventListener('wa-after-show', () => this.focusPending());
    const resize = new ResizeObserver(() => this.alignToTrigger());
    resize.observe(element('#utility-anchor', HTMLElement));
    window.addEventListener('pagehide', () => resize.disconnect(), { once: true });
  }
  private alignToTrigger(): void {
    if (this.invoking) this.popover.skidding = this.invoking.getBoundingClientRect().right - element('#utility-anchor', HTMLElement).getBoundingClientRect().right;
  }
  private focusPending(): void {
    if (this.pendingFocus?.checkVisibility() && this.popover.open && !this.closing) {
      this.pendingFocus.focus({ preventScroll: true });
      this.pendingFocus = null;
    }
  }
  private syncAria(): void {
    for (const trigger of this.triggers) trigger.setAttribute('aria-expanded', String(trigger === this.desired));
  }
  private request(trigger: HTMLButtonElement | null): void {
    this.desired = trigger;
    if (this.closing) return;
    if (trigger) this.show(trigger);
    else this.popover.open = false;
  }
  private show(trigger: HTMLButtonElement): void {
    this.invoking = trigger;
    this.alignToTrigger();
    const keyboard = trigger.id === 'keyboard-trigger';
    element('#keyboard-content', HTMLElement).hidden = !keyboard;
    element('#activity-content', HTMLElement).hidden = keyboard;
    this.syncAria();
    this.popover.open = true;
    const content = element(keyboard ? '#keyboard-content' : '#activity-content', HTMLElement);
    this.pendingFocus = content.querySelector<HTMLButtonElement>('button');
    requestAnimationFrame(() => this.focusPending());
  }
}

class ShellScreens {
  private animation: Animation | undefined;
  constructor() {
    element('#collection-screen', HTMLButtonElement).addEventListener('click', () => this.activate(true));
    element('#settings-screen', HTMLButtonElement).addEventListener('click', () => this.activate(false));
  }
  private activate(collection: boolean): void {
    const workspace = element('#workspace', HTMLElement);
    this.animation?.cancel();
    for (const [selector, active] of [['#collection-view', collection], ['#settings-view', !collection]] as const) {
      const view = element(selector, HTMLElement);
      view.hidden = !active;
      view.inert = !active;
    }
    element('.command-bar', HTMLElement).hidden = !collection;
    element('#collection-screen', HTMLButtonElement).setAttribute('aria-pressed', String(collection));
    element('#settings-screen', HTMLButtonElement).setAttribute('aria-pressed', String(!collection));
    element('#keyboard-content .context strong', HTMLElement).textContent = collection ? 'Collection' : 'Settings';
    element('#keyboard-content dl', HTMLElement).hidden = !collection;
    element(collection ? '#workspace-action' : '#folder-setting', HTMLElement).focus();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.animation = workspace.animate([{ opacity: .7 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    window.dispatchEvent(new Event('shell-screen-change'));
  }
}

for (const split of document.querySelectorAll<HTMLElement>('.local-split')) {
  const panel = split.querySelector<HTMLElement>(':scope > aside');
  if (!panel) throw new Error('Missing panel');
  new ShellPanel(split, panel);
}
new ShellScreens();
// Register our triggers before Web Awesome binds its automatic click handlers.
new ShellUtilities(element('#utility', WaPopover), [element('#keyboard-trigger', HTMLButtonElement), element('#activity-trigger', HTMLButtonElement)]);
document.documentElement.dataset.shellReady = 'true';
