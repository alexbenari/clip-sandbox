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

export function createContextMenuController({
  root,
  panel,
  document: doc = root?.ownerDocument || document,
} = {}) {
  if (!root || !panel) {
    return {
      open: () => {},
      close: () => {},
      isOpen: () => false,
      destroy: () => {},
    };
  }

  ensureContextMenuStyles(doc);
  root.classList.add('context-menu-root');
  panel.classList.add('context-menu-panel');
  panel.setAttribute('role', 'menu');

  let openState = false;
  let restoreFocusEl = null;

  function isOpen() {
    return openState;
  }

  function setOpen(nextOpen) {
    openState = !!nextOpen;
    root.hidden = !openState;
    root.dataset.open = openState ? 'true' : 'false';
  }

  function positionPanel(point = {}) {
    const margin = 12;
    const viewportWidth = doc.defaultView?.innerWidth || 1280;
    const viewportHeight = doc.defaultView?.innerHeight || 720;
    const panelWidth = panel.offsetWidth || 240;
    const panelHeight = panel.offsetHeight || 120;
    const left = Math.max(margin, Math.min((point.x ?? margin), viewportWidth - panelWidth - margin));
    const top = Math.max(margin, Math.min((point.y ?? margin), viewportHeight - panelHeight - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function renderItems(items = []) {
    panel.innerHTML = '';
    for (const item of Array.from(items)) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item?.label || '';
      button.disabled = !!item?.disabled;
      if (item?.id) button.dataset.itemId = item.id;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        close({ restoreFocus: false });
        item?.onSelect?.();
      });
      panel.appendChild(button);
    }
  }

  function focusFirstItem() {
    const first = focusableItems(panel)[0];
    if (first) first.focus();
  }

  function moveItemFocus(step) {
    const items = focusableItems(panel);
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === doc.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus();
  }

  function open({ point = {}, items = [], focusFirst = false, restoreFocusTo = null } = {}) {
    restoreFocusEl = restoreFocusTo || doc.activeElement;
    renderItems(items);
    setOpen(true);
    positionPanel(point);
    if (focusFirst) focusFirstItem();
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen()) return;
    setOpen(false);
    panel.innerHTML = '';
    if (restoreFocus && restoreFocusEl instanceof HTMLElement) {
      restoreFocusEl.focus();
    }
  }

  function onDocumentPointerDown(event) {
    if (!isOpen()) return;
    if (!(event.target instanceof Node)) return;
    if (root.contains(event.target)) return;
    close({ restoreFocus: false });
  }

  function onDocumentKeyDown(event) {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveItemFocus(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveItemFocus(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusFirstItem();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const items = focusableItems(panel);
      if (items.length > 0) items[items.length - 1].focus();
    }
  }

  doc.addEventListener('mousedown', onDocumentPointerDown);
  doc.addEventListener('keydown', onDocumentKeyDown);

  setOpen(false);

  function destroy() {
    doc.removeEventListener('mousedown', onDocumentPointerDown);
    doc.removeEventListener('keydown', onDocumentKeyDown);
    setOpen(false);
    panel.innerHTML = '';
  }

  return {
    open,
    close,
    isOpen,
    destroy,
  };
}
