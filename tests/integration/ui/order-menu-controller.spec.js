import { describe, expect, test } from 'vitest';
import { createOrderMenuController } from '../../../src/ui/order-menu-controller.js';

function setupDom() {
  document.body.innerHTML = `
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Order</button>
      <div id="orderMenuPanel" role="menu">
        <button id="loadOrderBtn" role="menuitem">Load</button>
        <button id="saveBtn" role="menuitem">Save</button>
      </div>
    </div>
  `;
  const orderMenu = document.getElementById('orderMenu');
  const orderMenuBtn = document.getElementById('orderMenuBtn');
  const orderMenuPanel = document.getElementById('orderMenuPanel');
  const loadOrderBtn = document.getElementById('loadOrderBtn');
  const saveBtn = document.getElementById('saveBtn');
  createOrderMenuController({ orderMenu, orderMenuBtn, orderMenuPanel, loadOrderBtn, saveBtn });
  return { orderMenu, orderMenuBtn, loadOrderBtn, saveBtn };
}

describe('order menu controller', () => {
  test('click toggles open state and aria-expanded', () => {
    const { orderMenu, orderMenuBtn } = setupDom();
    expect(orderMenu.dataset.open).toBe('false');
    expect(orderMenuBtn.getAttribute('aria-expanded')).toBe('false');

    orderMenuBtn.click();
    expect(orderMenu.dataset.open).toBe('true');
    expect(orderMenuBtn.getAttribute('aria-expanded')).toBe('true');

    orderMenuBtn.click();
    expect(orderMenu.dataset.open).toBe('false');
    expect(orderMenuBtn.getAttribute('aria-expanded')).toBe('false');
  });

  test('keyboard enter opens and focuses first item', () => {
    const { orderMenu, orderMenuBtn, loadOrderBtn } = setupDom();
    orderMenuBtn.focus();
    orderMenuBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(orderMenu.dataset.open).toBe('true');
    expect(loadOrderBtn).toBe(document.activeElement);
  });

  test('arrow keys navigate and escape closes', () => {
    const { orderMenu, orderMenuBtn, loadOrderBtn, saveBtn } = setupDom();
    orderMenuBtn.focus();
    orderMenuBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(loadOrderBtn).toBe(document.activeElement);

    loadOrderBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(saveBtn).toBe(document.activeElement);

    saveBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(orderMenu.dataset.open).toBe('false');
    expect(orderMenuBtn).toBe(document.activeElement);
  });
});
