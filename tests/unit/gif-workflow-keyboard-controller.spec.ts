import { describe, expect, it, vi } from 'vitest';

import { GifWorkflowKeyboardController } from '../../src/ui/gif-workflow-keyboard-controller.js';

function player() {
  return { togglePlayback: vi.fn(), pressStep: vi.fn(), releaseStep: vi.fn(), jumpBySeconds: vi.fn() };
}

function capture(withExtract = false) {
  return {
    markStart: vi.fn(), markEnd: vi.fn(), jumpStart: vi.fn(), jumpEnd: vi.fn(),
    startLoop: vi.fn(), lockRange: vi.fn(), canJump: vi.fn(() => true),
    canLoop: vi.fn(() => true), canLock: vi.fn(() => true),
    ...(withExtract ? { extractCurrent: vi.fn(), canExtractCurrent: vi.fn(() => true) } : {}),
  };
}

function event(key: string, target: EventTarget = document.body, options: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  const keyboardEvent = new KeyboardEvent('keydown', { key, bubbles: true, ...options, cancelable: true });
  Object.defineProperty(keyboardEvent, 'target', { configurable: true, value: target });
  return keyboardEvent;
}

describe('GifWorkflowKeyboardController', () => {
  it('routes transport and capture commands only while an active target is installed', () => {
    const transport = player();
    const commands = capture(true);
    const controller = new GifWorkflowKeyboardController();

    controller.activate({ player: transport, capture: commands });
    controller.handleKeyDown(event(' '));
    controller.handleKeyDown(event('q'));
    controller.handleKeyDown(event('w'));
    controller.handleKeyDown(event('a'));
    controller.handleKeyDown(event('s'));
    controller.handleKeyDown(event('z'));
    controller.handleKeyDown(event('x'));
    controller.handleKeyDown(event('e'));
    expect(transport.togglePlayback).toHaveBeenCalledOnce();
    expect(commands.markStart).toHaveBeenCalledOnce();
    expect(commands.markEnd).toHaveBeenCalledOnce();
    expect(commands.jumpStart).toHaveBeenCalledOnce();
    expect(commands.jumpEnd).toHaveBeenCalledOnce();
    expect(commands.startLoop).toHaveBeenCalledOnce();
    expect(commands.lockRange).toHaveBeenCalledOnce();
    expect(commands.extractCurrent).toHaveBeenCalledOnce();

    controller.deactivate();
    controller.handleKeyDown(event(' '));
    expect(transport.togglePlayback).toHaveBeenCalledOnce();
  });

  it('ignores E when the active capture target cannot extract the current range', () => {
    const commands = capture(false);
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: player(), capture: commands });

    controller.handleKeyDown(event('e'));
    expect(commands).not.toHaveProperty('extractCurrent');
  });

  it('starts each held arrow once, ignores browser repeat, and releases each direction independently', () => {
    const transport = player();
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: transport });

    controller.handleKeyDown(event('ArrowLeft'));
    controller.handleKeyDown(event('ArrowLeft', undefined, { repeat: true }));
    controller.handleKeyDown(event('ArrowRight'));
    controller.handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    controller.handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));

    expect(transport.pressStep).toHaveBeenNthCalledWith(1, -1);
    expect(transport.pressStep).toHaveBeenNthCalledWith(2, 1);
    expect(transport.pressStep).toHaveBeenCalledTimes(2);
    expect(transport.releaseStep).toHaveBeenNthCalledWith(1, -1);
    expect(transport.releaseStep).toHaveBeenNthCalledWith(2, 1);
  });

  it('ignores modified shortcuts and editable controls, while keeping Space and arrows on a range input', () => {
    const transport = player();
    const commands = capture();
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: transport, capture: commands });
    const text = document.createElement('input');
    const range = document.createElement('input'); range.type = 'range';

    controller.handleKeyDown(event('q', text));
    controller.handleKeyDown(event(' ', document.body, { ctrlKey: true }));
    controller.handleKeyDown(event(' ', range));
    controller.handleKeyDown(event('ArrowRight', range));

    expect(commands.markStart).not.toHaveBeenCalled();
    expect(transport.togglePlayback).toHaveBeenCalledOnce();
    expect(transport.pressStep).toHaveBeenCalledWith(1);
  });

  it('removes the active target and releases held directions when deactivated', () => {
    const transport = player();
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: transport });
    controller.handleKeyDown(event('ArrowRight'));
    controller.deactivate();
    controller.handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    controller.handleKeyDown(event('q'));

    expect(transport.releaseStep).toHaveBeenCalledWith(1);
    expect(transport.pressStep).toHaveBeenCalledOnce();
  });

  it('releases held stepping on focus loss without deactivating the screen', () => {
    const transport = player();
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: transport });
    controller.handleKeyDown(event('ArrowRight'));

    controller.releaseHeldSteps();
    controller.handleKeyDown(event(' '));

    expect(transport.releaseStep).toHaveBeenCalledWith(1);
    expect(transport.togglePlayback).toHaveBeenCalledOnce();
  });

  it('maps only plain physical top-row digits to jump durations', () => {
    const transport = player();
    const controller = new GifWorkflowKeyboardController();
    controller.activate({ player: transport });
    for (let digit = 1; digit <= 5; digit += 1) {
      controller.handleKeyDown(event(String(digit), document.body, { code: `Digit${digit}` }));
    }
    controller.handleKeyDown(event('1', document.body, { code: 'Numpad1' }));
    controller.handleKeyDown(event('1', document.body, { code: 'Digit1', shiftKey: true }));
    controller.handleKeyDown(event('1', document.body, { code: 'Digit1', repeat: true }));
    const selector = document.createElement('select');
    controller.handleKeyDown(event('1', selector, { code: 'Digit1' }));

    expect(transport.jumpBySeconds.mock.calls.map(call => call[0])).toEqual([1, 2, 5, 7, 10]);
  });
});
