import { afterEach, describe, expect, test, vi } from 'vitest';
import { createContextMenuController } from '../../../src/ui/context-menu-controller.js';

describe('context menu controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setup() {
    document.body.innerHTML = `
      <button id="trigger">Trigger</button>
      <div id="root" hidden><div id="panel"></div></div>
    `;
    const root = document.getElementById('root');
    const panel = document.getElementById('panel');
    const trigger = document.getElementById('trigger');
    const controller = createContextMenuController({ root, panel, document });
    return { root, panel, trigger, controller };
  }

  test('renders supplied items, positions itself, and invokes enabled callbacks only', () => {
    const { root, panel, controller } = setup();
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    controller.open({
      point: { x: 140, y: 160 },
      items: [
        { id: 'primary', label: 'Primary', onSelect: onPrimary },
        { id: 'disabled', label: 'Disabled', disabled: true, onSelect: onSecondary },
      ],
      focusFirst: true,
    });

    expect(root.hidden).toBe(false);
    expect(root.dataset.open).toBe('true');
    expect(panel.style.left).toBe('140px');
    expect(panel.style.top).toBe('160px');
    expect(panel.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(panel.querySelector('[data-item-id="disabled"]').disabled).toBe(true);
    expect(document.activeElement).toBe(panel.querySelector('[data-item-id="primary"]'));

    panel.querySelector('[data-item-id="disabled"]').click();
    expect(onSecondary).not.toHaveBeenCalled();
    expect(root.hidden).toBe(false);

    panel.querySelector('[data-item-id="primary"]').click();
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
  });

  test('closes on outside click and escape', () => {
    const { root, controller } = setup();

    controller.open({
      point: { x: 80, y: 90 },
      items: [{ id: 'primary', label: 'Primary', onSelect: vi.fn() }],
    });
    expect(root.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(root.hidden).toBe(true);

    controller.open({
      point: { x: 80, y: 90 },
      items: [{ id: 'primary', label: 'Primary', onSelect: vi.fn() }],
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.hidden).toBe(true);
  });
});
