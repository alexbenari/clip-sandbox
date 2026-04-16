// @ts-nocheck
const CONTEXT_MENU_STYLE_ID = 'contextMenuControllerStyles';
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
.context-menu-panel button:hover{ filter:brightness(1.05); }
.context-menu-panel button:disabled{
  opacity:.5;
  cursor:not-allowed;
}
`;

function ensureContextMenuStyles(doc) {
  if (doc.getElementById(CONTEXT_MENU_STYLE_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = CONTEXT_MENU_STYLE_ID;
  styleEl.textContent = DEFAULT_CONTEXT_MENU_CSS;
  (doc.head || doc.documentElement).appendChild(styleEl);
}

function focusableItems(panel) {
  return Array.from(panel.querySelectorAll('[role="menuitem"]')).filter((el) => !el.disabled);
}

export class ContextMenuController {
  constructor({
    root,
    panel,
    document: doc = root?.ownerDocument || document,
  } = {}) {
    this.root = root;
    this.panel = panel;
    this.doc = doc;
    this.openState = false;
    this.restoreFocusEl = null;
    this.onDocumentPointerDown = (event) => {
      if (!this.isOpen()) return;
      if (!(event.target instanceof Node)) return;
      if (this.root.contains(event.target)) return;
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
        const items = focusableItems(this.panel);
        if (items.length > 0) items[items.length - 1].focus();
      }
    };

    if (!root || !panel) return;

    ensureContextMenuStyles(doc);
    root.classList.add('context-menu-root');
    panel.classList.add('context-menu-panel');
    panel.setAttribute('role', 'menu');
    doc.addEventListener('mousedown', this.onDocumentPointerDown);
    doc.addEventListener('keydown', this.onDocumentKeyDown);
    this.setOpen(false);
  }

  isOpen() {
    return this.openState;
  }

  setOpen(nextOpen) {
    if (!this.root) return;
    this.openState = !!nextOpen;
    this.root.hidden = !this.openState;
    this.root.dataset.open = this.openState ? 'true' : 'false';
  }

  positionPanel(point = {}) {
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

  renderItems(items = []) {
    if (!this.panel) return;
    this.panel.innerHTML = '';
    for (const item of Array.from(items)) {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item?.label || '';
      button.disabled = !!item?.disabled;
      if (item?.id) button.dataset.itemId = item.id;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        this.close({ restoreFocus: false });
        item?.onSelect?.();
      });
      this.panel.appendChild(button);
    }
  }

  focusFirstItem() {
    const first = focusableItems(this.panel)[0];
    if (first) first.focus();
  }

  moveItemFocus(step) {
    const items = focusableItems(this.panel);
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === this.doc.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus();
  }

  open({ point = {}, items = [], focusFirst = false, restoreFocusTo = null } = {}) {
    if (!this.root || !this.panel) return;
    this.restoreFocusEl = restoreFocusTo || this.doc.activeElement;
    this.renderItems(items);
    this.setOpen(true);
    this.positionPanel(point);
    if (focusFirst) this.focusFirstItem();
  }

  close({ restoreFocus = true } = {}) {
    if (!this.isOpen() || !this.panel) return;
    this.setOpen(false);
    this.panel.innerHTML = '';
    if (restoreFocus && this.restoreFocusEl instanceof HTMLElement) {
      this.restoreFocusEl.focus();
    }
  }

  destroy() {
    if (!this.root || !this.panel) return;
    this.doc.removeEventListener('mousedown', this.onDocumentPointerDown);
    this.doc.removeEventListener('keydown', this.onDocumentKeyDown);
    this.setOpen(false);
    this.panel.innerHTML = '';
  }
}

export function createContextMenuController(options) {
  return new ContextMenuController(options);
}
