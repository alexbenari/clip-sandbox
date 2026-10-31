import { DocumentElements } from './document-elements.js';

const CONTEXT_MENU_STYLE_ID = 'contextMenuControlStyles';
const DEFAULT_CONTEXT_MENU_CSS = `
.context-menu-root{
  position:fixed;
  inset:0;
  z-index:80;
  pointer-events:none;
}
.context-menu-root[hidden]{
  display:none !important;
}
.context-menu-panel{
  position:fixed;
  min-width:220px;
  max-width:min(320px, calc(100vw - 24px));
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:8px;
  border-radius:12px;
  border:1px solid rgba(148,163,184,.25);
  background:rgba(2,6,23,.96);
  box-shadow:0 18px 38px rgba(0,0,0,.35);
  pointer-events:auto;
}
.context-menu-panel button{
  width:100%;
  text-align:left;
  padding:9px 10px;
  border-radius:8px;
  border:0;
  background:linear-gradient(180deg, #1e293b, #111827);
  color:#e5e7eb;
  font:inherit;
  box-shadow:none;
  cursor:pointer;
}
.context-menu-item-content{
  display:flex;
  align-items:center;
  gap:8px;
}
.context-menu-item-icon{
  width:16px;
  height:16px;
  flex:0 0 16px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:currentColor;
}
.context-menu-item-label{ min-width:0; }
.context-menu-panel button.context-menu-item-destructive{ color:var(--danger-text, #f87171); }
.context-menu-separator{
  flex:none;
  height:1px;
  margin:2px 4px;
  background:rgba(148,163,184,.2);
}
.context-menu-panel button:hover{ filter:brightness(1.05); }
.context-menu-panel button:disabled{
  cursor:not-allowed;
  background:linear-gradient(180deg, rgba(30,41,59,.5), rgba(17,24,39,.5));
}
.context-menu-panel button:disabled .context-menu-item-icon,
.context-menu-panel button:disabled .context-menu-item-label{ opacity:.5; }
`;

export type ContextMenuIcon = {
  kind: 'svg';
  viewBox?: string;
  paths?: Iterable<string>;
  paint?: 'fill' | 'stroke';
};

export type ContextMenuItem = {
  id?: string;
  label?: string;
  tone?: 'destructive';
  disabled?: boolean;
  icon?: ContextMenuIcon | null;
  onSelect?: () => void;
};

export type ContextMenuSeparator = Readonly<{ separator: true }>;

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export type ContextMenuPoint = {
  x?: number;
  y?: number;
};

type ContextMenuControlOptions = {
  root?: HTMLElement | null;
  panel?: HTMLElement | null;
  document?: Document;
};

export class ContextMenuControl {
  private readonly root: HTMLElement | null;
  private readonly panel: HTMLElement | null;
  private readonly doc: Document;
  private openState: boolean;
  private restoreFocusEl: Element | null;
  private readonly onDocumentPointerDown: (event: MouseEvent) => void;
  private readonly onDocumentKeyDown: (event: KeyboardEvent) => void;

  static forClipMenu(doc: Document): ContextMenuControl {
    const elements = new DocumentElements(doc);
    return new ContextMenuControl({
      root: elements.required('clipContextMenu'),
      panel: elements.required('clipContextMenuPanel'),
      document: doc,
    });
  }

  constructor({
    root,
    panel,
    document: doc = root?.ownerDocument || document,
  }: ContextMenuControlOptions = {}) {
    this.root = root || null;
    this.panel = panel || null;
    this.doc = doc;
    this.openState = false;
    this.restoreFocusEl = null;
    this.onDocumentPointerDown = (event) => {
      if (!this.isOpen()) return;
      if (!(event.target instanceof Node)) return;
      if (this.root?.contains(event.target)) return;
      this.close({ restoreFocus: false });
    };
    this.onDocumentKeyDown = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveItemFocus(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveItemFocus(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        this.focusFirstItem();
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        const items = this.focusableItems();
        if (items.length > 0) items[items.length - 1].focus();
      }
    };

    if (!root || !panel) return;

    this.ensureStyles();
    root.classList.add('context-menu-root');
    panel.classList.add('context-menu-panel');
    panel.setAttribute('role', 'menu');
    doc.addEventListener('mousedown', this.onDocumentPointerDown);
    doc.addEventListener('keydown', this.onDocumentKeyDown);
    this.setOpen(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  setOpen(nextOpen: boolean): void {
    if (!this.root) return;
    this.openState = !!nextOpen;
    this.root.hidden = !this.openState;
    this.root.dataset.open = this.openState ? 'true' : 'false';
  }

  positionPanel(point: ContextMenuPoint = {}): void {
    if (!this.panel) return;
    const margin = 12;
    const viewportWidth = this.doc.defaultView?.innerWidth || 1280;
    const viewportHeight = this.doc.defaultView?.innerHeight || 720;
    const panelWidth = this.panel.offsetWidth || 240;
    const panelHeight = this.panel.offsetHeight || 120;
    const left = Math.max(margin, Math.min((point.x ?? margin), viewportWidth - panelWidth - margin));
    const top = Math.max(margin, Math.min((point.y ?? margin), viewportHeight - panelHeight - margin));
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }

  renderItems(entries: Iterable<ContextMenuEntry> = []): void {
    if (!this.panel) return;
    this.panel.innerHTML = '';
    for (const entry of Array.from(entries)) {
      this.panel.appendChild('separator' in entry ? this.createSeparatorElement() : this.createItemElement(entry));
    }
  }

  focusFirstItem(): void {
    const first = this.focusableItems()[0];
    if (first) first.focus();
  }

  moveItemFocus(step: number): void {
    const items = this.focusableItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === this.doc.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus();
  }

  open({ point = {}, items = [], focusFirst = false, restoreFocusTo = null }: {
    point?: ContextMenuPoint;
    items?: Iterable<ContextMenuEntry>;
    focusFirst?: boolean;
    restoreFocusTo?: Element | null;
  } = {}): void {
    if (!this.root || !this.panel) return;
    this.restoreFocusEl = restoreFocusTo || this.doc.activeElement;
    this.renderItems(items);
    this.setOpen(true);
    this.positionPanel(point);
    if (focusFirst) this.focusFirstItem();
  }

  close({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
    if (!this.isOpen() || !this.panel) return;
    this.setOpen(false);
    this.panel.innerHTML = '';
    if (restoreFocus && this.restoreFocusEl instanceof HTMLElement) {
      this.restoreFocusEl.focus();
    }
  }

  dispose(): void {
    if (!this.root || !this.panel) return;
    this.doc.removeEventListener('mousedown', this.onDocumentPointerDown);
    this.doc.removeEventListener('keydown', this.onDocumentKeyDown);
    this.setOpen(false);
    this.panel.innerHTML = '';
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(CONTEXT_MENU_STYLE_ID)) return;
    const styleEl = this.doc.createElement('style');
    styleEl.id = CONTEXT_MENU_STYLE_ID;
    styleEl.textContent = DEFAULT_CONTEXT_MENU_CSS;
    (this.doc.head || this.doc.documentElement).appendChild(styleEl);
  }

  private focusableItems(): HTMLElement[] {
    if (!this.panel) return [];
    return Array.from(this.panel.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .filter(element => !('disabled' in element) || !element.disabled);
  }

  private createItemElement(item: ContextMenuItem): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    if (item.tone === 'destructive') button.classList.add('context-menu-item-destructive');
    const content = this.doc.createElement('span');
    content.className = 'context-menu-item-content';
    const iconEl = this.createIconElement(item.icon);
    if (iconEl) {
      const iconWrap = this.doc.createElement('span');
      iconWrap.className = 'context-menu-item-icon';
      iconWrap.appendChild(iconEl);
      content.appendChild(iconWrap);
    }
    const labelEl = this.doc.createElement('span');
    labelEl.className = 'context-menu-item-label';
    labelEl.textContent = item.label || '';
    content.appendChild(labelEl);
    button.appendChild(content);
    button.disabled = !!item.disabled;
    if (item.id) button.dataset.itemId = item.id;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      this.close({ restoreFocus: false });
      item.onSelect?.();
    });
    return button;
  }

  private createSeparatorElement(): HTMLElement {
    const separator = this.doc.createElement('div');
    separator.className = 'context-menu-separator';
    separator.setAttribute('role', 'separator');
    return separator;
  }

  private createIconElement(icon: ContextMenuIcon | null | undefined): SVGSVGElement | null {
    if (!icon || icon.kind !== 'svg') return null;
    const svgEl = this.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', icon.viewBox || '0 0 16 16');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.setAttribute('focusable', 'false');
    const stroked = icon.paint === 'stroke';
    if (stroked) {
      svgEl.setAttribute('fill', 'none');
      svgEl.setAttribute('stroke', 'currentColor');
      svgEl.setAttribute('stroke-width', '1.6');
      svgEl.setAttribute('stroke-linecap', 'round');
      svgEl.setAttribute('stroke-linejoin', 'round');
    }
    for (const pathData of Array.from(icon.paths || [])) {
      const pathEl = this.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathData);
      if (!stroked) pathEl.setAttribute('fill', 'currentColor');
      svgEl.appendChild(pathEl);
    }
    return svgEl;
  }
}
