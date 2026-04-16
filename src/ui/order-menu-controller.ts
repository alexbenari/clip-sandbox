// @ts-nocheck
function menuItems(loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, deleteFromDiskBtn) {
  return [loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, deleteFromDiskBtn].filter((el) => el instanceof HTMLElement);
}

function focusableItems(loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, deleteFromDiskBtn) {
  return menuItems(loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, deleteFromDiskBtn).filter((el) => !el.disabled);
}

export class OrderMenuController {
  constructor({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
  }) {
    this.orderMenu = orderMenu;
    this.orderMenuBtn = orderMenuBtn;
    this.orderMenuPanel = orderMenuPanel;
    this.loadOrderBtn = loadOrderBtn;
    this.saveBtn = saveBtn;
    this.saveAsNewBtn = saveAsNewBtn;
    this.addToCollectionBtn = addToCollectionBtn;
    this.deleteFromDiskBtn = deleteFromDiskBtn;

    if (!orderMenu || !orderMenuBtn || !orderMenuPanel) return;

    orderMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle();
    });
    orderMenuBtn.addEventListener('keydown', (e) => this.handleButtonKeyDown(e));
    orderMenuPanel.addEventListener('keydown', (e) => this.handlePanelKeyDown(e));

    for (const item of menuItems(loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, deleteFromDiskBtn)) {
      item.addEventListener('click', () => this.close());
    }

    orderMenu.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!orderMenu.contains(document.activeElement)) this.close();
      }, 0);
    });

    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node)) return;
      if (!orderMenu.contains(e.target)) this.close();
    });

    this.close();
  }

  isOpen() {
    return this.orderMenu?.dataset.open === 'true';
  }

  setOpen(open) {
    if (!this.orderMenu || !this.orderMenuBtn) return;
    this.orderMenu.dataset.open = open ? 'true' : 'false';
    this.orderMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  open() {
    this.setOpen(true);
  }

  close() {
    this.setOpen(false);
  }

  toggle() {
    this.setOpen(!this.isOpen());
  }

  focusFirstItem() {
    const first = focusableItems(
      this.loadOrderBtn,
      this.saveBtn,
      this.saveAsNewBtn,
      this.addToCollectionBtn,
      this.deleteFromDiskBtn,
    )[0];
    if (first) first.focus();
  }

  moveItemFocus(step) {
    const items = focusableItems(
      this.loadOrderBtn,
      this.saveBtn,
      this.saveAsNewBtn,
      this.addToCollectionBtn,
      this.deleteFromDiskBtn,
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus();
  }

  handleButtonKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!this.isOpen()) {
        this.open();
        this.focusFirstItem();
      } else {
        this.close();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.open();
      this.focusFirstItem();
      return;
    }
    if (e.key === 'Escape' && this.isOpen()) {
      e.preventDefault();
      this.close();
    }
  }

  handlePanelKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      this.orderMenuBtn.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveItemFocus(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveItemFocus(-1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      this.focusFirstItem();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      const items = focusableItems(
        this.loadOrderBtn,
        this.saveBtn,
        this.saveAsNewBtn,
        this.addToCollectionBtn,
        this.deleteFromDiskBtn,
      );
      if (items.length) items[items.length - 1].focus();
    }
  }
}

export function createOrderMenuController(options) {
  return new OrderMenuController(options);
}
