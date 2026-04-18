// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { createAppKeyDownHandler } from '../../src/app/app-keydown-handler.js';

function createContext(overrides = {}) {
  return {
    saveAsNewDialogController: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    addToCollectionDialogController: {
      isOpen: vi.fn(() => false),
      close: vi.fn(),
    },
    deleteFromDiskDialogController: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    unsavedChangesDialogController: {
      handleGlobalKeyDown: vi.fn(() => false),
      isOpen: vi.fn(() => false),
    },
    zoomOverlay: {
      isOpen: vi.fn(() => false),
      toggleMuted: vi.fn(),
    },
    gridController: {
      handleKeyDown: vi.fn(() => false),
      getSelectedClipId: vi.fn(() => null),
    },
    isEditableTarget: vi.fn(() => false),
    isFullscreen: vi.fn(() => false),
    closeZoom: vi.fn(),
    browseZoomByOffset: vi.fn(),
    openZoomForClipId: vi.fn(),
    ...overrides,
  };
}

describe('app keydown handler', () => {
  test('honors handler precedence for dialog controllers before other shortcuts', () => {
    const context = createContext({
      saveAsNewDialogController: {
        handleGlobalKeyDown: vi.fn(() => true),
        isOpen: vi.fn(() => true),
      },
    });
    const handleKeyDown = createAppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handleKeyDown(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(context.openZoomForClipId).not.toHaveBeenCalled();
  });

  test('blocks non-dialog shortcuts while any dialog is open', () => {
    const context = createContext({
      addToCollectionDialogController: {
        isOpen: vi.fn(() => true),
        close: vi.fn(),
      },
      gridController: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_1'),
      },
    });
    const handleKeyDown = createAppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handleKeyDown(event)).toBe(true);
    expect(context.openZoomForClipId).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('ignores grid shortcuts for editable targets', () => {
    const input = document.createElement('input');
    const context = createContext({
      isEditableTarget: vi.fn(() => true),
      gridController: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_1'),
      },
    });
    const handleKeyDown = createAppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    expect(handleKeyDown(event)).toBe(true);
    expect(context.openZoomForClipId).not.toHaveBeenCalled();
  });

  test('routes zoom navigation shortcuts through the ordered rule set', () => {
    const context = createContext({
      zoomOverlay: {
        isOpen: vi.fn(() => true),
        toggleMuted: vi.fn(),
      },
    });
    const handleKeyDown = createAppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      cancelable: true,
    });

    expect(handleKeyDown(event)).toBe(true);
    expect(context.browseZoomByOffset).toHaveBeenCalledWith(1);
    expect(event.defaultPrevented).toBe(true);
  });

  test('opens zoom for the current selection when the plain z shortcut applies', () => {
    const context = createContext({
      gridController: {
        handleKeyDown: vi.fn(() => false),
        getSelectedClipId: vi.fn(() => 'clip_7'),
      },
    });
    const handleKeyDown = createAppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handleKeyDown(event)).toBe(true);
    expect(context.openZoomForClipId).toHaveBeenCalledWith('clip_7');
    expect(event.defaultPrevented).toBe(true);
  });
});
