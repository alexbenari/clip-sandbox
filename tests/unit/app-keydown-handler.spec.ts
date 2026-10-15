// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { AppKeyDownHandler } from '../../src/app/app-keydown-handler.js';
import { EventSource } from '../../src/app/event-source.js';

function createContext(overrides = {}) {
  return {
    saveAsNewDialog: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    addToCollectionDialog: {
      isOpen: vi.fn(() => false),
      close: vi.fn(),
    },
    deleteFromDiskDialog: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    unsavedChangesDialog: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    zoom: {
      isOpen: vi.fn(() => false),
      close: vi.fn(),
      toggleMuted: vi.fn(),
      browseByOffset: vi.fn(),
      openClipById: vi.fn(),
    },
    grid: {
      handleKeyDown: vi.fn(() => false),
      getSelectedClipId: vi.fn(() => null),
    },
    fullScreen: { isDocumentFullScreen: vi.fn(() => false) },
    keys: new EventSource(),
    utilities: { isOpen: false },
    fullScreenKeys: { onGlobalKeyDown: vi.fn() },
    ...overrides,
  };
}

describe('app keydown handler', () => {
  test('handles Collection keys before full-screen keys, and none while a utility is open', () => {
    const context = createContext({
      grid: { handleKeyDown: vi.fn(() => false), getSelectedClipId: vi.fn(() => 'clip_7') },
    });
    const handler = new AppKeyDownHandler(context);

    const zoomKey = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    context.keys.emit('keyPressed', zoomKey);
    expect(context.zoom.openClipById).toHaveBeenCalledWith('clip_7');
    expect(context.fullScreenKeys.onGlobalKeyDown).not.toHaveBeenCalled();

    const digit = new KeyboardEvent('keydown', { key: '3', cancelable: true });
    context.keys.emit('keyPressed', digit);
    expect(context.fullScreenKeys.onGlobalKeyDown).toHaveBeenCalledWith(digit);

    context.utilities.isOpen = true;
    context.keys.emit('keyPressed', new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
    expect(context.zoom.openClipById).toHaveBeenCalledOnce();

    context.utilities.isOpen = false;
    handler.dispose();
    context.keys.emit('keyPressed', new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
    expect(context.zoom.openClipById).toHaveBeenCalledOnce();
  });

  test('honors handler precedence for dialog controllers before other shortcuts', () => {
    const context = createContext({
      saveAsNewDialog: {
        handleGlobalKeyDown: vi.fn(() => true),
        isOpen: vi.fn(() => true),
      },
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handler.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(context.zoom.openClipById).not.toHaveBeenCalled();
  });

  test('blocks non-dialog shortcuts while any dialog is open', () => {
    const context = createContext({
      addToCollectionDialog: {
        isOpen: vi.fn(() => true),
        close: vi.fn(),
      },
      grid: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_1'),
      },
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.openClipById).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores grid shortcuts for editable targets', () => {
    const input = document.createElement('input');
    const context = createContext({
      grid: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_1'),
      },
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.openClipById).not.toHaveBeenCalled();
  });

  test('routes zoom navigation shortcuts through the ordered rule set', () => {
    const context = createContext({
      zoom: {
        isOpen: vi.fn(() => true),
        close: vi.fn(),
        toggleMuted: vi.fn(),
        browseByOffset: vi.fn(),
        openClipById: vi.fn(),
      },
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      cancelable: true,
    });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.browseByOffset).toHaveBeenCalledWith(1);
    expect(event.defaultPrevented).toBe(true);
  });

  test('opens zoom for the current selection when the plain z shortcut applies', () => {
    const context = createContext({
      grid: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_7'),
      },
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.openClipById).toHaveBeenCalledWith('clip_7');
    expect(event.defaultPrevented).toBe(true);
  });
});
