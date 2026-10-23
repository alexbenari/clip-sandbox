// @ts-nocheck
import { describe, expect, test } from 'vitest';
import { OrderMenuControl } from '../../../src/ui/order-menu-control.js';

function setupDom() {
  document.body.innerHTML = `
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Actions</button>
      <div id="orderMenuPanel" role="menu">
        <button id="loadOrderBtn" role="menuitem">Load</button>
        <button id="saveBtn" role="menuitem">Save</button>
        <button id="saveAsNewBtn" role="menuitem">Save as collection…</button>
        <button id="addToCollectionBtn" role="menuitem">Add selected to collection…</button>
        <div role="separator"></div>
        <button id="trashSelectedBtn" role="menuitem">Move selected to Recycle Bin…</button>
      </div>
    </div>
  `;
  const orderMenu = document.getElementById('orderMenu');
  const orderMenuBtn = document.getElementById('orderMenuBtn');
  const orderMenuPanel = document.getElementById('orderMenuPanel');
  const loadOrderBtn = document.getElementById('loadOrderBtn');
  const saveBtn = document.getElementById('saveBtn');
  const saveAsNewBtn = document.getElementById('saveAsNewBtn');
  const addToCollectionBtn = document.getElementById('addToCollectionBtn');
  const trashSelectedBtn = document.getElementById('trashSelectedBtn');
  const control = new OrderMenuControl({ orderMenu, orderMenuBtn, orderMenuPanel });
  return { control, orderMenu, orderMenuBtn, loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, trashSelectedBtn };
}

describe('order menu control', () => {
  test('a click outside the menu closes it', () => {
    const { orderMenu, orderMenuBtn } = setupDom();
    orderMenuBtn.click();

    document.body.click();

    expect(orderMenu.dataset.open).toBe('false');
  });

  test('stops reacting to clicks once destroyed', () => {
    const { control, orderMenu, orderMenuBtn } = setupDom();
    orderMenuBtn.click();
    control.destroy();

    document.body.click();
    orderMenuBtn.click();

    expect(orderMenu.dataset.open).toBe('true');
  });

  test('choosing an item closes the menu', () => {
    const { orderMenu, orderMenuBtn, saveAsNewBtn } = setupDom();
    orderMenuBtn.click();

    saveAsNewBtn.click();

    expect(orderMenu.dataset.open).toBe('false');
  });

  test('keyboard navigation skips disabled items', () => {
    const { orderMenuBtn, loadOrderBtn, saveBtn, saveAsNewBtn } = setupDom();
    loadOrderBtn.disabled = true;
    saveBtn.disabled = true;

    orderMenuBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(saveAsNewBtn).toBe(document.activeElement);
  });

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

  test('arrow keys navigate through all items and escape closes', () => {
    const { orderMenu, orderMenuBtn, loadOrderBtn, saveBtn, saveAsNewBtn, addToCollectionBtn, trashSelectedBtn } = setupDom();
    orderMenuBtn.focus();
    orderMenuBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(loadOrderBtn).toBe(document.activeElement);

    loadOrderBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(saveBtn).toBe(document.activeElement);

    saveBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(saveAsNewBtn).toBe(document.activeElement);

    saveAsNewBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(addToCollectionBtn).toBe(document.activeElement);

    addToCollectionBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(trashSelectedBtn).toBe(document.activeElement);

    trashSelectedBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(orderMenu.dataset.open).toBe('false');
    expect(orderMenuBtn).toBe(document.activeElement);
  });
});

