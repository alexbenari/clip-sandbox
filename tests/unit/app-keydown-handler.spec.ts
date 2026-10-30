// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { AppKeyDownHandler } from '../../src/app/app-keydown-handler.js';
import { EventSource } from '../../src/app/event-source.js';
import { ZoomEditModeKeyboard } from '../../src/ui/zoom-edit-mode-keyboard.js';

function gridWith({ focusedClipId = null, selectedClipId = null, handlesCardKeys = false } = {}) {
  return {
    handleKeyDown: vi.fn(() => false),
    handleCardKey: vi.fn((event) => {
      if (handlesCardKeys) event.preventDefault();
      return handlesCardKeys;
    }),
    getSelectedClipId: vi.fn(() => selectedClipId),
    focusedClipId: vi.fn(() => focusedClipId),
  };
}

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
    trashClipsDialog: {
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
    grid: gridWith(),
    collectionSave: { saveActive: vi.fn() },
    fullScreen: { isDocumentFullScreen: vi.fn(() => false) },
    keys: new EventSource(),
    utilities: { isOpen: false },
    fullScreenKeys: { onGlobalKeyDown: vi.fn() },
    activeEdit: { isActive: false },
    zoomEditKeys: new ZoomEditModeKeyboard(),
    zoomEditDialogs: [{ isOpen: () => false }],
    ...overrides,
  };
}

describe('app keydown handler', () => {
  test('handles Collection keys before full-screen keys, and none while a utility is open', () => {
    const context = createContext({
      grid: gridWith({ selectedClipId: 'clip_7' }),
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
      grid: gridWith({ selectedClipId: 'clip_1' }),
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.openClipById).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('leaves letters typed into an open dialog to the dialog instead of the full-screen keys', () => {
    const context = createContext({
      saveAsNewDialog: { handleGlobalKeyDown: vi.fn(() => false), isOpen: vi.fn(() => true) },
    });
    new AppKeyDownHandler(context);
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'f', cancelable: true });
    Object.defineProperty(event, 'target', { value: input });

    context.keys.emit('keyPressed', event);

    expect(context.fullScreenKeys.onGlobalKeyDown).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('leaves keys typed into an editable field to that field instead of the full-screen keys', () => {
    const context = createContext();
    new AppKeyDownHandler(context);
    const select = document.createElement('select');
    const event = new KeyboardEvent('keydown', { key: 'f', cancelable: true });
    Object.defineProperty(event, 'target', { value: select });

    context.keys.emit('keyPressed', event);

    expect(context.fullScreenKeys.onGlobalKeyDown).not.toHaveBeenCalled();
  });

  test('ignores grid shortcuts for editable targets', () => {
    const input = document.createElement('input');
    const context = createContext({
      grid: gridWith({ selectedClipId: 'clip_1' }),
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
      grid: gridWith({ selectedClipId: 'clip_7' }),
    });
    const handler = new AppKeyDownHandler(context);
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });

    expect(handler.handle(event)).toBe(true);
    expect(context.zoom.openClipById).toHaveBeenCalledWith('clip_7');
    expect(event.defaultPrevented).toBe(true);
  });

  function keyOn(target, key, modifiers = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  }

  test('passes a key pressed on a card to the grid instead of the full-screen keys', () => {
    const context = createContext({ grid: gridWith({ handlesCardKeys: true }) });
    new AppKeyDownHandler(context);
    const event = keyOn(document.createElement('div'), 'ArrowDown');

    context.keys.emit('keyPressed', event);

    expect(context.grid.handleCardKey).toHaveBeenCalledWith(event);
    expect(context.fullScreenKeys.onGlobalKeyDown).not.toHaveBeenCalled();
  });

  test.each([
    ['Zoom is open', { zoom: { isOpen: vi.fn(() => true), close: vi.fn(), toggleMuted: vi.fn(), browseByOffset: vi.fn(), openClipById: vi.fn() } }],
    ['the Collection is full screen', { fullScreen: { isDocumentFullScreen: vi.fn(() => true) } }],
    ['a dialog is open', { trashClipsDialog: { handleGlobalKeyDown: vi.fn(() => false), isOpen: vi.fn(() => true) } }],
  ])('keeps grid keys away from the cards while %s', (_case, overrides) => {
    const context = createContext({ ...overrides, grid: gridWith({ handlesCardKeys: true }) });
    new AppKeyDownHandler(context);

    context.keys.emit('keyPressed', keyOn(document.createElement('div'), 'ArrowDown'));

    expect(context.grid.handleCardKey).not.toHaveBeenCalled();
  });

  test.each(['Enter', 'z'])('%s opens the focused clip in Zoom rather than the selected one', (key) => {
    const context = createContext({ grid: gridWith({ focusedClipId: 'clip_3', selectedClipId: 'clip_1' }) });
    new AppKeyDownHandler(context);
    const event = keyOn(document.createElement('div'), key);

    context.keys.emit('keyPressed', event);

    expect(context.zoom.openClipById).toHaveBeenCalledWith('clip_3');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Enter with nothing focused opens the selected clip in Zoom', () => {
    const context = createContext({ grid: gridWith({ selectedClipId: 'clip_1' }) });
    new AppKeyDownHandler(context);

    context.keys.emit('keyPressed', keyOn(document.body, 'Enter'));

    expect(context.zoom.openClipById).toHaveBeenCalledWith('clip_1');
  });

  test('Enter on a button presses the button instead of opening Zoom', () => {
    const context = createContext({ grid: gridWith({ selectedClipId: 'clip_1' }) });
    new AppKeyDownHandler(context);
    const event = keyOn(document.createElement('button'), 'Enter');

    context.keys.emit('keyPressed', event);

    expect(context.zoom.openClipById).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('Ctrl+S saves the view and keeps the key from the browser', () => {
    const context = createContext();
    new AppKeyDownHandler(context);
    const event = keyOn(document.body, 's', { ctrlKey: true });

    context.keys.emit('keyPressed', event);

    expect(context.collectionSave.saveActive).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  test.each([
    ['a dialog is open', { saveAsNewDialog: { handleGlobalKeyDown: vi.fn(() => false), isOpen: vi.fn(() => true) } }, document.body],
    ['a utility is open', { utilities: { isOpen: true } }, document.body],
    ['Zoom is open', { zoom: { isOpen: vi.fn(() => true), close: vi.fn(), toggleMuted: vi.fn(), browseByOffset: vi.fn(), openClipById: vi.fn() } }, document.body],
    ['typing in a field', {}, document.createElement('input')],
  ])('Ctrl+S does not save while %s', (_case, overrides, target) => {
    const context = createContext(overrides);
    new AppKeyDownHandler(context);

    context.keys.emit('keyPressed', keyOn(target, 's', { ctrlKey: true }));

    expect(context.collectionSave.saveActive).not.toHaveBeenCalled();
  });

  describe('Zoom edit mode', () => {
    const openZoom = () => ({ isOpen: vi.fn(() => true), close: vi.fn(), toggleMuted: vi.fn(), browseByOffset: vi.fn(), openClipById: vi.fn() });

    function inZoom({ editing, dialogOpen = false }) {
      const context = createContext({
        zoom: openZoom(),
        activeEdit: { isActive: editing },
        zoomEditDialogs: [{ isOpen: () => false }, { isOpen: () => dialogOpen }],
      });
      const commands = [];
      context.zoomEditKeys.on('commandRequested', command => commands.push(command));
      new AppKeyDownHandler(context);
      return { context, commands };
    }

    test.each([
      ['a', { kind: 'jump-to-start' }],
      ['ArrowLeft', { kind: 'press-step', direction: -1 }],
      ['ArrowRight', { kind: 'press-step', direction: 1 }],
      ['Escape', { kind: 'leave' }],
    ])('%s acts in Zoom edit mode instead of keeping its Zoom meaning', (key, command) => {
      const { context, commands } = inZoom({ editing: true });

      context.keys.emit('keyPressed', keyOn(document.body, key));

      expect(commands).toEqual([command]);
      expect(context.zoom.toggleMuted).not.toHaveBeenCalled();
      expect(context.zoom.browseByOffset).not.toHaveBeenCalled();
      expect(context.zoom.close).not.toHaveBeenCalled();
    });

    test('a key Zoom edit mode does not use neither closes Zoom nor reaches the full-screen keys', () => {
      const { context, commands } = inZoom({ editing: true });

      context.keys.emit('keyPressed', keyOn(document.body, 'f'));

      expect(commands).toEqual([]);
      expect(context.zoom.close).not.toHaveBeenCalled();
      expect(context.fullScreenKeys.onGlobalKeyDown).not.toHaveBeenCalled();
    });

    test('keys pressed while its save or discard dialog is open stay with the dialog', () => {
      const { context, commands } = inZoom({ editing: true, dialogOpen: true });
      const event = keyOn(document.body, 'Escape');

      context.keys.emit('keyPressed', event);

      expect(commands).toEqual([]);
      expect(context.zoom.close).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    test('outside the mode A toggles Zoom audio', () => {
      const { context, commands } = inZoom({ editing: false });

      context.keys.emit('keyPressed', keyOn(document.body, 'a'));

      expect(context.zoom.toggleMuted).toHaveBeenCalledOnce();
      expect(commands).toEqual([]);
    });

    test.each([['ArrowLeft', -1], ['ArrowRight', 1]])('outside the mode %s moves Zoom to the neighboring clip', (key, offset) => {
      const { context, commands } = inZoom({ editing: false });

      context.keys.emit('keyPressed', keyOn(document.body, key));

      expect(context.zoom.browseByOffset).toHaveBeenCalledWith(offset);
      expect(commands).toEqual([]);
    });

    test('outside the mode Escape closes Zoom', () => {
      const { context } = inZoom({ editing: false });

      context.keys.emit('keyPressed', keyOn(document.body, 'Escape'));

      expect(context.zoom.close).toHaveBeenCalledOnce();
    });
  });
});
