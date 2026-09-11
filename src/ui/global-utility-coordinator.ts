import type { IShortcutDescriptor } from './app-screen.js';

export const GLOBAL_UTILITY_SHORTCUTS: readonly IShortcutDescriptor[] = [
  { description: 'Close the open app-bar utility', sequences: [['Escape']] },
];

type GlobalUtility = {
  id: string;
  label: string;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  focusInitial(): void;
};

export class GlobalUtilityCoordinator {
  private active: GlobalUtility | null = null;
  private readonly utilities = new Map<string, GlobalUtility>();
  private readonly listeners: (() => void)[] = [];
  private entrance: Animation | undefined;
  private readonly doc: Document;
  private readonly onResize = (): void => { this.position(); };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.active && !this.contains(event.target)) this.close(false);
  };
  private readonly onFocusIn = (event: FocusEvent): void => {
    if (this.active && !this.contains(event.target)) this.close(false);
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.active && event.key === 'Escape') {
      this.close();
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  constructor(private readonly host: HTMLElement, utilities: readonly GlobalUtility[]) {
    this.doc = host.ownerDocument;
    for (const utility of utilities) {
      if (this.utilities.has(utility.id)) throw new Error(`Duplicate global utility: ${utility.id}`);
      this.utilities.set(utility.id, utility);
      utility.panel.hidden = true;
      utility.trigger.setAttribute('aria-controls', host.id);
      utility.trigger.setAttribute('aria-expanded', 'false');
      utility.trigger.setAttribute('aria-haspopup', 'dialog');
      const toggle = () => { this.active === utility ? this.close() : this.open(utility.id); };
      utility.trigger.addEventListener('click', toggle);
      this.listeners.push(() => utility.trigger.removeEventListener('click', toggle));
    }
    host.hidden = true;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'false');
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    this.doc.addEventListener('pointerdown', this.onPointerDown);
    this.doc.addEventListener('focusin', this.onFocusIn);
    this.doc.defaultView?.addEventListener('resize', this.onResize);
  }

  get isOpen(): boolean { return this.active !== null; }

  open(id: string): void {
    const incoming = this.utilities.get(id);
    if (!incoming) throw new Error(`Unknown global utility: ${id}`);
    if (incoming === this.active) return;
    this.entrance?.cancel();
    if (this.active) {
      this.active.panel.hidden = true;
      this.active.trigger.setAttribute('aria-expanded', 'false');
    }
    this.active = incoming;
    this.host.replaceChildren(incoming.panel);
    incoming.panel.hidden = false;
    incoming.trigger.setAttribute('aria-expanded', 'true');
    this.host.setAttribute('aria-label', incoming.label);
    this.host.hidden = false;
    this.position();
    incoming.focusInitial();
    if (!this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.entrance = this.host.animate?.([{ opacity: 0.75 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
    }
  }

  close(restoreFocus = true): void {
    const outgoing = this.active;
    if (!outgoing) return;
    this.active = null;
    this.entrance?.cancel();
    this.entrance = undefined;
    outgoing.panel.hidden = true;
    outgoing.trigger.setAttribute('aria-expanded', 'false');
    this.host.hidden = true;
    if (restoreFocus) outgoing.trigger.focus({ preventScroll: true });
  }

  private contains(target: EventTarget | null): boolean {
    return target instanceof Node && (this.host.contains(target) || [...this.utilities.values()].some(utility => utility.trigger.contains(target)));
  }

  private position(): void {
    if (!this.active) return;
    const view = this.doc.defaultView;
    if (!view) return;
    const anchor = this.active.trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.right - this.host.offsetWidth, view.innerWidth - this.host.offsetWidth - 12));
    this.host.style.left = `${left}px`;
    this.host.style.top = `${anchor.bottom + 10}px`;
    this.host.style.maxHeight = `${Math.max(0, view.innerHeight - anchor.bottom - 22)}px`;
  }

  destroy(): void {
    this.close(false);
    for (const remove of this.listeners) remove();
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.doc.removeEventListener('pointerdown', this.onPointerDown);
    this.doc.removeEventListener('focusin', this.onFocusIn);
    this.doc.defaultView?.removeEventListener('resize', this.onResize);
  }
}
