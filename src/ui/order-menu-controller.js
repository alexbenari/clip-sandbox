function menuItems(loadOrderBtn, saveBtn, saveAsNewBtn) {
  return [loadOrderBtn, saveBtn, saveAsNewBtn].filter((el) => el instanceof HTMLElement);
}

function focusableItems(loadOrderBtn, saveBtn, saveAsNewBtn) {
  return menuItems(loadOrderBtn, saveBtn, saveAsNewBtn).filter((el) => !el.disabled);
}

export function createOrderMenuController({
  orderMenu,
  orderMenuBtn,
  orderMenuPanel,
  loadOrderBtn,
  saveBtn,
  saveAsNewBtn,
}) {
  if (!orderMenu || !orderMenuBtn || !orderMenuPanel) {
    return {
      isOpen: () => false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }

  function isOpen() {
    return orderMenu.dataset.open === 'true';
  }

  function setOpen(open) {
    orderMenu.dataset.open = open ? 'true' : 'false';
    orderMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function open() {
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function toggle() {
    setOpen(!isOpen());
  }

  function focusFirstItem() {
    const first = focusableItems(loadOrderBtn, saveBtn, saveAsNewBtn)[0];
    if (first) first.focus();
  }

  function moveItemFocus(step) {
    const items = focusableItems(loadOrderBtn, saveBtn, saveAsNewBtn);
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus();
  }

  orderMenuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggle();
  });
  orderMenuBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen()) {
        open();
        focusFirstItem();
      } else {
        close();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open();
      focusFirstItem();
      return;
    }
    if (e.key === 'Escape') {
      if (isOpen()) {
        e.preventDefault();
        close();
      }
    }
  });

  orderMenuPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      orderMenuBtn.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveItemFocus(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveItemFocus(-1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      focusFirstItem();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      const items = focusableItems(loadOrderBtn, saveBtn, saveAsNewBtn);
      if (items.length) items[items.length - 1].focus();
    }
  });

  for (const item of menuItems(loadOrderBtn, saveBtn, saveAsNewBtn)) {
    item.addEventListener('click', () => close());
  }

  orderMenu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!orderMenu.contains(document.activeElement)) close();
    }, 0);
  });

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Node)) return;
    if (!orderMenu.contains(e.target)) close();
  });

  close();

  return { isOpen, open, close, toggle };
}
