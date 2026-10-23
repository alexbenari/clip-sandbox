// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AddToCollectionDialogControl } from '../../../src/ui/add-to-collection-dialog-control.js';
import { Collection } from '../../../src/domain/collection.js';
import { Pipeline } from '../../../src/domain/pipeline.js';

function setup() {
  document.body.innerHTML = `
    <dialog id="dialog">
      <label id="nameLabel" hidden>
        <input id="nameInput" type="text" />
      </label>
      <select id="destinationSelect"></select>
      <div id="error"></div>
      <button id="confirmBtn" type="button">Add</button>
      <button id="cancelBtn" type="button">Cancel</button>
    </dialog>
  `;

  const dialog = document.getElementById('dialog');
  dialog.showModal = vi.fn(() => {
    dialog.setAttribute('open', '');
  });
  dialog.close = vi.fn(() => {
    dialog.removeAttribute('open');
  });

  const destinationSelect = document.getElementById('destinationSelect');
  const nameLabel = document.getElementById('nameLabel');
  const nameInput = document.getElementById('nameInput');
  const error = document.getElementById('error');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  const controller = new AddToCollectionDialogControl({
    dialog,
    destinationSelect,
    newCollectionNameLabel: nameLabel,
    newCollectionNameInput: nameInput,
    errorMessageEl: error,
    confirmBtn,
    cancelBtn,
    newChoiceValue: '__new_collection__',
    nameCheck: { problemText: (name) => (!name.trim() ? 'Enter a collection name.' : '') },
  });
  controller.on('confirmed', onConfirm);
  controller.on('cancelled', onCancel);

  return {
    dialog,
    destinationSelect,
    nameLabel,
    nameInput,
    error,
    confirmBtn,
    onConfirm,
    onCancel,
    controller,
  };
}

describe('add-to-collection dialog controller', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('opens with direct destination choices and can start on the new-collection path', () => {
    const {
      dialog,
      destinationSelect,
      nameLabel,
      nameInput,
      confirmBtn,
      controller,
    } = setup();

    controller.open({
      choices: [{ label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' }],
      hasSelection: true,
      startWithNewCollection: true,
    });

    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(destinationSelect.value).toBe('__new_collection__');
    expect([...destinationSelect.options].map(option => option.textContent)).toEqual(['subset', 'New collection…']);
    expect(nameLabel.hasAttribute('hidden')).toBe(false);
    expect(confirmBtn.disabled).toBe(true);
    expect(nameInput).toBe(document.activeElement);
  });

  test('validates new names, clears errors on input, and submits structured destinations', () => {
    const {
      dialog,
      destinationSelect,
      nameLabel,
      nameInput,
      error,
      confirmBtn,
      onConfirm,
      onCancel,
      controller,
    } = setup();

    controller.open({
      choices: [{ label: 'subset', value: 'subset.txt', collectionFilename: 'subset.txt' }],
      hasSelection: true,
      startWithNewCollection: true,
    });

    expect(error.textContent).toBe('Enter a collection name.');
    controller.showValidationError('A collection with that name already exists.', { focusNameInput: true });
    expect(error.textContent).toBe('A collection with that name already exists.');
    expect(nameInput).toBe(document.activeElement);

    nameInput.value = 'highlights';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(error.textContent).toBe('');
    expect(confirmBtn.disabled).toBe(false);

    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'new', name: 'highlights' });

    destinationSelect.value = 'subset.txt';
    destinationSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(nameLabel.hasAttribute('hidden')).toBe(true);
    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    expect(onConfirm).toHaveBeenLastCalledWith({
      kind: 'existing',
      collectionFilename: 'subset.txt',
    });

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('offers every saved collection except the one being viewed as a destination', () => {
    const pipeline = new Pipeline({
      folderName: 'clips',
      collections: ['subset.txt', 'picks.txt', 'archive.txt'].map(filename => Collection.fromFilename({ filename })),
    });

    expect(AddToCollectionDialogControl.buildChoices({ pipeline, activeCollectionFilename: 'subset.txt' })).toEqual([
      { label: 'archive', value: 'archive.txt', collectionFilename: 'archive.txt' },
      { label: 'picks', value: 'picks.txt', collectionFilename: 'picks.txt' },
    ]);
  });
});

