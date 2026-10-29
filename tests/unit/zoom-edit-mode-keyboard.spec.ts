import { describe, expect, it } from 'vitest';

import type { ZoomEditModeCommand } from '../../src/app/zoom-edit-mode-keys.js';
import { ZoomEditModeKeyboard } from '../../src/ui/zoom-edit-mode-keyboard.js';

function keyboard() {
  const keys = new ZoomEditModeKeyboard();
  const commands: ZoomEditModeCommand[] = [];
  keys.on('commandRequested', command => commands.push(command));
  return { keys, commands };
}

function press(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, ...init });
}

describe('ZoomEditModeKeyboard', () => {
  it.each<[string, KeyboardEventInit, ZoomEditModeCommand]>([
    ['Space', { key: ' ', code: 'Space' }, { kind: 'toggle-playback' }],
    ['Left', { key: 'ArrowLeft', code: 'ArrowLeft' }, { kind: 'step', direction: -1 }],
    ['Right', { key: 'ArrowRight', code: 'ArrowRight' }, { kind: 'step', direction: 1 }],
    ['1', { key: '1', code: 'Digit1' }, { kind: 'jump', seconds: 1 }],
    ['2', { key: '2', code: 'Digit2' }, { kind: 'jump', seconds: 2 }],
    ['3', { key: '3', code: 'Digit3' }, { kind: 'jump', seconds: 5 }],
    ['4', { key: '4', code: 'Digit4' }, { kind: 'jump', seconds: 7 }],
    ['5', { key: '5', code: 'Digit5' }, { kind: 'jump', seconds: 10 }],
    ['Q', { key: 'q', code: 'KeyQ' }, { kind: 'mark-start' }],
    ['W', { key: 'w', code: 'KeyW' }, { kind: 'mark-end' }],
    ['A', { key: 'a', code: 'KeyA' }, { kind: 'jump-to-start' }],
    ['S', { key: 's', code: 'KeyS' }, { kind: 'jump-to-end' }],
    ['Z', { key: 'z', code: 'KeyZ' }, { kind: 'toggle-loop' }],
    ['X', { key: 'x', code: 'KeyX' }, { kind: 'save' }],
    ['Escape', { key: 'Escape', code: 'Escape' }, { kind: 'leave' }],
  ])('%s requests its command and keeps the key from the page', (_name, init, command) => {
    const { keys, commands } = keyboard();
    const event = press(init);

    expect(keys.handleKeyDown(event)).toBe(true);

    expect(commands).toEqual([command]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('reads a capital letter typed with Caps Lock as its key', () => {
    const { keys, commands } = keyboard();

    keys.handleKeyDown(press({ key: 'Q', code: 'KeyQ' }));

    expect(commands).toEqual([{ kind: 'mark-start' }]);
  });

  it('jumps by the digit key position, whatever character the keyboard layout gives it', () => {
    const { keys, commands } = keyboard();

    keys.handleKeyDown(press({ key: '&', code: 'Digit1' }));

    expect(commands).toEqual([{ kind: 'jump', seconds: 1 }]);
  });

  it('takes one step for a held arrow key, however often the key repeats', () => {
    const { keys, commands } = keyboard();

    keys.handleKeyDown(press({ key: 'ArrowRight' }));
    const repeated = press({ key: 'ArrowRight', repeat: true });
    keys.handleKeyDown(repeated);

    expect(commands).toEqual([{ kind: 'step', direction: 1 }]);
    expect(repeated.defaultPrevented).toBe(true);
  });

  it.each([
    ['Ctrl', { key: 's', ctrlKey: true }],
    ['Alt', { key: 'ArrowLeft', altKey: true }],
    ['Meta', { key: 'q', metaKey: true }],
    ['Shift with a digit', { key: '!', code: 'Digit1', shiftKey: true }],
  ])('leaves a key pressed with %s alone', (_name, init) => {
    const { keys, commands } = keyboard();
    const event = press(init);

    expect(keys.handleKeyDown(event)).toBe(false);

    expect(commands).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a key the mode does not use alone', () => {
    const { keys, commands } = keyboard();
    const event = press({ key: 'f', code: 'KeyF' });

    expect(keys.handleKeyDown(event)).toBe(false);

    expect(commands).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});
