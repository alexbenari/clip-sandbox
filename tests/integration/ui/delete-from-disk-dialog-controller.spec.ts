// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createDeleteFromDiskDialogController,
} from '../../../src/ui/delete-from-disk-dialog-controller.js';

describe('delete-from-disk dialog controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setupDialog(id) {
    const dialog = document.getElementById(id);
    dialog.showModal = vi.fn(() => {
      dialog.setAttribute('open', '');
    });
    dialog.close = vi.fn(() => {
      dialog.removeAttribute('open');
    });
    return dialog;
  }

  function setup() {
    document.body.innerHTML = `
      <dialog id="preflightDialog">
        <p id="preflightText"></p>
        <button id="confirmPreflightBtn">Save</button>
        <button id="discardPreflightBtn">Discard</button>
        <button id="cancelPreflightBtn">Cancel</button>
      </dialog>
      <dialog id="confirmDialog">
        <p id="confirmSummary"></p>
        <pre id="confirmPreview"></pre>
        <button id="confirmDeleteBtn">Delete</button>
        <button id="cancelDeleteBtn">Cancel</button>
      </dialog>
    `;

    return {
      preflightDialog: setupDialog('preflightDialog'),
      confirmDialog: setupDialog('confirmDialog'),
      preflightTextEl: document.getElementById('preflightText'),
      confirmSummaryEl: document.getElementById('confirmSummary'),
      confirmPreviewEl: document.getElementById('confirmPreview'),
      confirmPreflightBtn: document.getElementById('confirmPreflightBtn'),
      discardPreflightBtn: document.getElementById('discardPreflightBtn'),
      cancelPreflightBtn: document.getElementById('cancelPreflightBtn'),
      confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
      cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    };
  }

  test('opens preflight and confirm dialogs and dispatches callbacks', () => {
    const parts = setup();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const controller = createDeleteFromDiskDialogController(parts);

    controller.openPreflight({ text: 'Save first?', onSave, onDiscard, onCancel });
    expect(parts.preflightTextEl.textContent).toBe('Save first?');
    expect(controller.isPreflightOpen()).toBe(true);

    parts.confirmPreflightBtn.click();
    expect(onSave).toHaveBeenCalledOnce();

    controller.openPreflight({ text: 'Save first?', onSave, onDiscard, onCancel });
    parts.discardPreflightBtn.click();
    expect(onDiscard).toHaveBeenCalledOnce();

    controller.openConfirm({ summary: 'Delete 2 clips?', preview: 'a.mp4', onConfirm, onCancel });
    expect(parts.confirmSummaryEl.textContent).toBe('Delete 2 clips?');
    expect(parts.confirmPreviewEl.textContent).toBe('a.mp4');
    expect(controller.isConfirmOpen()).toBe(true);

    parts.confirmDeleteBtn.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test('handles escape for whichever delete dialog is open', () => {
    const parts = setup();
    const onCancel = vi.fn();
    const controller = createDeleteFromDiskDialogController(parts);

    controller.openPreflight({ text: 'Save first?', onCancel });
    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();

    controller.openConfirm({ summary: 'Delete 2 clips?', preview: 'a.mp4', onCancel });
    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  test('builds confirmation copy from the delete request', () => {
    const parts = setup();
    const onConfirm = vi.fn();
    const controller = createDeleteFromDiskDialogController(parts);

    controller.openConfirmForDeleteRequest({
      selectedClipNames: ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4', 'e.mp4', 'f.mp4'],
      affectedSavedCollectionCount: 2,
    }, { onConfirm });

    expect(parts.confirmSummaryEl.textContent).toBe('Delete 6 clips from disk? This also removes them from 2 saved collections in this pipeline.');
    expect(parts.confirmPreviewEl.textContent).toContain('a.mp4');
    expect(parts.confirmPreviewEl.textContent).toContain('...and 1 more');
    parts.confirmDeleteBtn.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

