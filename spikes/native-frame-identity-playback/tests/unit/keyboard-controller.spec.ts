import { describe, expect, it, vi } from 'vitest';

import { KeyboardController, type IKeyboardCommandTarget } from '../../src/ui/keyboard-controller.js';

describe('keyboard controller', () => {
  it('maps transport and range shortcuts while preventing browser defaults', () => {
    const target = commands();
    const keyboard = new KeyboardController(target);

    for (const key of [' ', 'q', 'w', 'a']) keyboard.handleKeyDown(keyEvent(key));

    expect(target.togglePlayback).toHaveBeenCalledOnce();
    expect(target.markStart).toHaveBeenCalledOnce();
    expect(target.markEnd).toHaveBeenCalledOnce();
    expect(target.toggleRangeLock).toHaveBeenCalledOnce();
  });

  it('starts one held-step sequence and releases it independently of browser repeat', () => {
    const target = commands();
    const keyboard = new KeyboardController(target);

    keyboard.handleKeyDown(keyEvent('ArrowRight'));
    keyboard.handleKeyDown(keyEvent('ArrowRight', { repeat: true }));
    keyboard.handleKeyUp(keyEvent('ArrowRight'));

    expect(target.pressStep).toHaveBeenCalledTimes(1);
    expect(target.pressStep).toHaveBeenCalledWith(1);
    expect(target.releaseStep).toHaveBeenCalledWith(1);
  });

  it('ignores shortcuts originating in editable elements', () => {
    const target = commands();
    const keyboard = new KeyboardController(target);

    keyboard.handleKeyDown(keyEvent('q', { editable: true }));

    expect(target.markStart).not.toHaveBeenCalled();
  });

  it('keeps transport and frame shortcuts active while the timeline has focus', () => {
    const target = commands();
    const keyboard = new KeyboardController(target);

    keyboard.handleKeyDown(keyEvent(' ', { inputType: 'range' }));
    keyboard.handleKeyDown(keyEvent('ArrowRight', { inputType: 'range' }));

    expect(target.togglePlayback).toHaveBeenCalledOnce();
    expect(target.pressStep).toHaveBeenCalledWith(1);
  });
});

function commands(): IKeyboardCommandTarget & Record<string, ReturnType<typeof vi.fn>> {
  return {
    togglePlayback: vi.fn(),
    markStart: vi.fn(),
    markEnd: vi.fn(),
    toggleRangeLock: vi.fn(),
    pressStep: vi.fn(),
    releaseStep: vi.fn(),
  };
}

function keyEvent(
  key: string,
  options: { repeat?: boolean; editable?: boolean; inputType?: string } = {},
): KeyboardEvent {
  return {
    key,
    repeat: options.repeat ?? false,
    target: options.editable || options.inputType
      ? { tagName: 'INPUT', type: options.inputType ?? 'text' }
      : { tagName: 'DIV' },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}
