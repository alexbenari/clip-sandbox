// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createSaveAsNewDialogController } from '../../../src/ui/save-as-new-dialog-controller.js';

describe('save-as-new dialog controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setup() {
    document.body.innerHTML = `
      <section id="dialog" hidden>
        <h2 id="title"></h2>
        <p id="text"></p>
        <input id="nameInput" />
        <div id="error"></div>
        <button id="confirmBtn">Confirm</button>
        <button id="cancelBtn">Cancel</button>
      </section>
    `;

    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const controller = createSaveAsNewDialogController({
      dialog: document.getElementById('dialog'),
      titleEl: document.getElementById('title'),
      textEl: document.getElementById('text'),
      nameInput: document.getElementById('nameInput'),
      errorMessageEl: document.getElementById('error'),
      confirmBtn: document.getElementById('confirmBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
      validateName: (name) => {
        if (!name.trim()) return 'Name is required.';
        if (name.includes(':')) return 'Collection names cannot contain: < > : " / \\ | ? *';
        return '';
      },
      onConfirm,
      onCancel,
    });

    return {
      dialog: document.getElementById('dialog'),
      title: document.getElementById('title'),
      text: document.getElementById('text'),
      nameInput: document.getElementById('nameInput'),
      error: document.getElementById('error'),
      confirmBtn: document.getElementById('confirmBtn'),
      cancelBtn: document.getElementById('cancelBtn'),
      onConfirm,
      onCancel,
      controller,
    };
  }

  test('opens, validates input, and confirms with the entered name', () => {
    const { dialog, title, text, nameInput, error, confirmBtn, onConfirm, controller } = setup();

    controller.open({ isPipelineMode: true });
    expect(dialog.hidden).toBe(false);
    expect(title.textContent).toBe('Save current pipeline view as a collection');
    expect(text.textContent).toBe('Enter a collection name. The app will add .txt automatically.');
    expect(confirmBtn.textContent).toBe('Save Collection');
    expect(error.textContent).toBe('Name is required.');
    expect(confirmBtn.disabled).toBe(true);

    nameInput.value = 'highlights';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(error.textContent).toBe('');
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    expect(onConfirm).toHaveBeenCalledWith('highlights');
  });

  test('keeps confirm enabled for non-empty invalid names so submit-time validation can run', () => {
    const { nameInput, error, confirmBtn, onConfirm, controller, title } = setup();

    controller.open({ isPipelineMode: false });
    expect(title.textContent).toBe('Save current collection as another collection');
    nameInput.value = 'bad:name';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(error.textContent).toContain('cannot contain');
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    expect(onConfirm).toHaveBeenCalledWith('bad:name');
  });

  test('handles escape and external validation errors', () => {
    const { nameInput, error, onCancel, controller } = setup();

    controller.open();
    controller.showValidationError('Already exists.', { focusInput: true });
    expect(error.textContent).toBe('Already exists.');
    expect(document.activeElement).toBe(nameInput);

    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(controller.isOpen()).toBe(false);
  });
});

