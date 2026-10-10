import { DocumentElements } from './document-elements.js';

type OrderMenuControllerOptions = {
  orderMenu?: HTMLElement | null;
  orderMenuBtn?: HTMLButtonElement | null;
  orderMenuPanel?: HTMLElement | null;
};

export class OrderMenuController {
  private readonly orderMenu: HTMLElement | null;
  private readonly orderMenuBtn: HTMLButtonElement | null;
  private readonly orderMenuPanel: HTMLElement | null;

  static fromDocument(doc: Document): OrderMenuController {
    const elements = new DocumentElements(doc);
    return new OrderMenuController({
      orderMenu: elements.required('orderMenu'),
      orderMenuBtn: elements.required<HTMLButtonElement>('orderMenuBtn'),
      orderMenuPanel: elements.required('orderMenuPanel'),
    });
  }

  constructor({ orderMenu, orderMenuBtn, orderMenuPanel }: OrderMenuControllerOptions) {
    this.orderMenu = orderMenu || null;
    this.orderMenuBtn = orderMenuBtn || null;
    this.orderMenuPanel = orderMenuPanel || null;

    if (!orderMenu || !orderMenuBtn || !orderMenuPanel) return;

    orderMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle();
    });
    orderMenuBtn.addEventListener('keydown', (e) => this.handleButtonKeyDown(e));
    orderMenuPanel.addEventListener('keydown', (e) => this.handlePanelKeyDown(e));
    orderMenuPanel.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('[role="menuitem"]')) this.close();
    });

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
    this.focusableItems()[0]?.focus();
  }

  moveItemFocus(step: number): void {
    const items = this.focusableItems();
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
      this.focusableItems().at(-1)?.focus();
    }
  }

  private focusableItems(): HTMLButtonElement[] {
    return [...this.orderMenuPanel?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? []]
      .filter(element => !element.disabled);
  }
}
