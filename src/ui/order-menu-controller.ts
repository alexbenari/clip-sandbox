function menuItems(...items: Array<HTMLElement | null | undefined>): HTMLButtonElement[] {
  return items.filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
}

function focusableItems(...items: Array<HTMLElement | null | undefined>): HTMLButtonElement[] {
  return menuItems(...items).filter((el) => !el.disabled);
}

type OrderMenuControllerOptions = {
  orderMenu?: HTMLElement | null;
  orderMenuBtn?: HTMLButtonElement | null;
  orderMenuPanel?: HTMLElement | null;
  loadOrderBtn?: HTMLButtonElement | null;
  saveBtn?: HTMLButtonElement | null;
  saveAsNewBtn?: HTMLButtonElement | null;
  addToCollectionBtn?: HTMLButtonElement | null;
  deleteFromDiskBtn?: HTMLButtonElement | null;
};

export class OrderMenuController {
  orderMenu: HTMLElement | null;
  orderMenuBtn: HTMLButtonElement | null;
  orderMenuPanel: HTMLElement | null;
  loadOrderBtn: HTMLButtonElement | null;
  saveBtn: HTMLButtonElement | null;
  saveAsNewBtn: HTMLButtonElement | null;
  addToCollectionBtn: HTMLButtonElement | null;
  deleteFromDiskBtn: HTMLButtonElement | null;

  constructor({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
  }: OrderMenuControllerOptions) {
    this.orderMenu = orderMenu || null;
    this.orderMenuBtn = orderMenuBtn || null;
    this.orderMenuPanel = orderMenuPanel || null;
    this.loadOrderBtn = loadOrderBtn || null;
    this.saveBtn = saveBtn || null;
    this.saveAsNewBtn = saveAsNewBtn || null;
    this.addToCollectionBtn = addToCollectionBtn || null;
    this.deleteFromDiskBtn = deleteFromDiskBtn || null;

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

  isOpen(): boolean {
    return this.orderMenu?.dataset.open === 'true';
  }

  setOpen(open: boolean): void {
    if (!this.orderMenu || !this.orderMenuBtn) return;
    this.orderMenu.dataset.open = open ? 'true' : 'false';
    this.orderMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  open(): void {
    this.setOpen(true);
  }

  close(): void {
    this.setOpen(false);
  }

  toggle(): void {
    this.setOpen(!this.isOpen());
  }

  focusFirstItem(): void {
    const first = focusableItems(
      this.loadOrderBtn,
      this.saveBtn,
      this.saveAsNewBtn,
      this.addToCollectionBtn,
      this.deleteFromDiskBtn,
    )[0];
    if (first) first.focus();
  }

  moveItemFocus(step: number): void {
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

  handleButtonKeyDown(e: KeyboardEvent): void {
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

  handlePanelKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      this.orderMenuBtn?.focus();
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

export function createOrderMenuController(options: OrderMenuControllerOptions): OrderMenuController {
  return new OrderMenuController(options);
}
