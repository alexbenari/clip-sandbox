import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardMapControl } from '../../src/ui/keyboard-map-control.js';
import { GlobalUtilityCoordinator } from '../../src/ui/global-utility-coordinator.js';

const coordinators: GlobalUtilityCoordinator[] = [];
afterEach(() => { coordinators.splice(0).forEach(coordinator => coordinator.destroy()); document.body.replaceChildren(); });

function fixture() {
  const host = document.createElement('div'); host.id = 'utilities';
  const utilities = ['keyboard', 'activity'].map(id => {
    const trigger = document.createElement('button'); trigger.textContent = id;
    const panel = document.createElement('section'); panel.tabIndex = -1;
    document.body.append(trigger, panel);
    return { id, label: id, trigger, panel, focusInitial: () => panel.focus() };
  });
  document.body.append(host);
  const coordinator = new GlobalUtilityCoordinator(host, utilities);
  coordinators.push(coordinator);
  return { coordinator, host, keyboard: utilities[0], activity: utilities[1] };
}

describe('global utility coordination', () => {
  it('returns focus to the invoker when the visible close control is clicked', () => {
    const { coordinator, host, keyboard } = fixture();
    const content = new KeyboardMapControl(keyboard.panel, [], () => coordinator.close());
    content.render({ label: 'Collection', shortcuts: [] });
    const close = keyboard.panel.querySelector<HTMLButtonElement>('button')!;
    coordinator.open('keyboard');
    close.focus();
    close.click();
    expect(host.hidden).toBe(true);
    expect(document.activeElement).toBe(keyboard.trigger);
  });
  it('transfers directly between utilities using one host and restores the latest invoker', () => {
    const { coordinator, host, keyboard, activity } = fixture();
    keyboard.trigger.click();
    expect(document.activeElement).toBe(keyboard.panel);
    const oldFocus = vi.spyOn(keyboard.trigger, 'focus');
    activity.trigger.click();
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(activity.panel);
    expect(keyboard.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(activity.panel);
    expect(oldFocus).not.toHaveBeenCalled();
    expect(keyboard.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(activity.trigger.getAttribute('aria-expanded')).toBe('true');
    coordinator.close();
    expect(document.activeElement).toBe(activity.trigger);
    expect(host.hidden).toBe(true);
  });
  it('consumes Escape before screen handlers and supports immediate reopening', () => {
    const { coordinator, host, keyboard } = fixture();
    const screenHandler = vi.fn();
    document.addEventListener('keydown', screenHandler);
    keyboard.trigger.click();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    keyboard.panel.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(screenHandler).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(keyboard.trigger);
    keyboard.trigger.click();
    expect(coordinator.isOpen).toBe(true);
    expect(host.hidden).toBe(false);
    document.removeEventListener('keydown', screenHandler);
  });
  it('dismisses outside interaction without stealing its focus', () => {
    const { coordinator, keyboard } = fixture();
    const outside = document.createElement('button'); document.body.append(outside);
    keyboard.trigger.click();
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    outside.focus();
    expect(coordinator.isOpen).toBe(false);
    expect(document.activeElement).toBe(outside);
    keyboard.trigger.click();
    outside.focus();
    expect(coordinator.isOpen).toBe(false);
  });
  it('cancels entrance animation on replacement and disposal without queued closes', () => {
    const { coordinator, host, keyboard, activity } = fixture();
    const cancel = vi.fn();
    host.animate = vi.fn(() => ({ cancel } as unknown as Animation));
    keyboard.trigger.click(); activity.trigger.click(); keyboard.trigger.click();
    expect(host.firstElementChild).toBe(keyboard.panel);
    expect(cancel).toHaveBeenCalledTimes(2);
    coordinator.destroy();
    activity.trigger.click();
    expect(coordinator.isOpen).toBe(false);
    expect(host.hidden).toBe(true);
  });
});
