// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createUnsavedChangesDialogController } from '../../../src/ui/unsaved-changes-dialog-controller.js';

describe('unsaved changes dialog controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setup() {
    document.body.innerHTML = `
      <dialog id="dialog">
        <p id="message"></p>
        <button id="confirmBtn">Save</button>
        <button id="discardBtn">Discard</button>
        <button id="cancelBtn">Cancel</button>
      </dialog>
    `;
    const dialog = document.getElementById('dialog');
    dialog.showModal = vi.fn(() => {
      dialog.setAttribute('open', '');
    });
    dialog.close = vi.fn(() => {
      dialog.removeAttribute('open');
    });
    return {
      dialog,
      message: document.getElementById('message'),
      confirmBtn: document.getElementById('confirmBtn'),
      discardBtn: document.getElementById('discardBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
    };
  }

  test('opens with message and routes save/discard/cancel actions', () => {
    const { dialog, message, confirmBtn, discardBtn, cancelBtn } = setup();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const controller = createUnsavedChangesDialogController({
      dialog,
      messageEl: message,
      confirmBtn,
      discardBtn,
      cancelBtn,
    });

    controller.open({
      message: 'Unsaved changes.',
      onSave,
      onDiscard,
      onCancel,
    });
    expect(message.textContent).toBe('Unsaved changes.');
    expect(controller.isOpen()).toBe(true);

    confirmBtn.click();
    expect(onSave).toHaveBeenCalledOnce();

    controller.open({ message: 'Unsaved changes.', onSave, onDiscard, onCancel });
    discardBtn.click();
    expect(onDiscard).toHaveBeenCalledOnce();

    controller.open({ message: 'Unsaved changes.', onSave, onDiscard, onCancel });
    cancelBtn.click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('handles escape through global keydown', () => {
    const { dialog, message, confirmBtn, discardBtn, cancelBtn } = setup();
    const onCancel = vi.fn();
    const controller = createUnsavedChangesDialogController({
      dialog,
      messageEl: message,
      confirmBtn,
      discardBtn,
      cancelBtn,
    });

    controller.open({ message: 'Unsaved changes.', onCancel });
    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(controller.isOpen()).toBe(false);
  });
});

