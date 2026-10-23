// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  TrashClipsDialogControl,
} from '../../../src/ui/trash-clips-dialog-control.js';
import { AppText } from '../../../src/app/app-text.js';

const appText = new AppText();

describe('Recycle Bin dialog control', () => {
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
        <button id="confirmTrashBtn">Move to Recycle Bin</button>
        <button id="cancelTrashBtn">Cancel</button>
      </dialog>
    `;

    return {
      appText,
      preflightDialog: setupDialog('preflightDialog'),
      confirmDialog: setupDialog('confirmDialog'),
      preflightTextEl: document.getElementById('preflightText'),
      confirmSummaryEl: document.getElementById('confirmSummary'),
      confirmPreviewEl: document.getElementById('confirmPreview'),
      confirmPreflightBtn: document.getElementById('confirmPreflightBtn'),
      discardPreflightBtn: document.getElementById('discardPreflightBtn'),
      cancelPreflightBtn: document.getElementById('cancelPreflightBtn'),
      confirmTrashBtn: document.getElementById('confirmTrashBtn'),
      cancelTrashBtn: document.getElementById('cancelTrashBtn'),
    };
  }

  test('opens preflight and confirm dialogs and dispatches callbacks', () => {
    const parts = setup();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const controller = new TrashClipsDialogControl(parts);

    controller.openPreflight({ text: 'Save first?', onSave, onDiscard, onCancel });
    expect(parts.preflightTextEl.textContent).toBe('Save first?');
    expect(controller.isPreflightOpen()).toBe(true);

    parts.confirmPreflightBtn.click();
    expect(onSave).toHaveBeenCalledOnce();

    controller.openPreflight({ text: 'Save first?', onSave, onDiscard, onCancel });
    parts.discardPreflightBtn.click();
    expect(onDiscard).toHaveBeenCalledOnce();

    controller.openConfirm({ summary: 'Move 2 clips?', preview: 'a.mp4', onConfirm, onCancel });
    expect(parts.confirmSummaryEl.textContent).toBe('Move 2 clips?');
    expect(parts.confirmPreviewEl.textContent).toBe('a.mp4');
    expect(controller.isConfirmOpen()).toBe(true);

    parts.confirmTrashBtn.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test('handles escape for whichever Recycle Bin dialog is open', () => {
    const parts = setup();
    const onCancel = vi.fn();
    const controller = new TrashClipsDialogControl(parts);

    controller.openPreflight({ text: 'Save first?', onCancel });
    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();

    controller.openConfirm({ summary: 'Move 2 clips?', preview: 'a.mp4', onCancel });
    expect(controller.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  test('builds confirmation copy from the Recycle Bin request', () => {
    const parts = setup();
    const onConfirm = vi.fn();
    const controller = new TrashClipsDialogControl(parts);

    controller.openConfirmForTrashRequest({
      selectedClipNames: ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4', 'e.mp4', 'f.mp4'],
      affectedSavedCollectionCount: 2,
    }, { onConfirm });

    expect(parts.confirmSummaryEl.textContent).toBe('Move 6 clips to the Recycle Bin? This also removes them from 2 saved collections in this pipeline.');
    expect(parts.confirmPreviewEl.textContent).toContain('a.mp4');
    expect(parts.confirmPreviewEl.textContent).toContain('…and 1 more');
    parts.confirmTrashBtn.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

