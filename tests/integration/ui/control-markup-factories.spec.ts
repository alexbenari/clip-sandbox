import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogger } from '../../../src/app/activity-logger.js';
import { AppText } from '../../../src/app/app-text.js';
import { ActivityIndicatorControl } from '../../../src/ui/activity-indicator-control.js';
import { AddToCollectionDialogController } from '../../../src/ui/add-to-collection-dialog-controller.js';
import { CollectionConflictController } from '../../../src/ui/collection-conflict-controller.js';
import { ContextMenuController } from '../../../src/ui/context-menu-controller.js';
import { DeleteFromDiskDialogController } from '../../../src/ui/delete-from-disk-dialog-controller.js';
import { SaveAsNewDialogController } from '../../../src/ui/save-as-new-dialog-controller.js';
import { UnsavedChangesDialogController } from '../../../src/ui/unsaved-changes-dialog-controller.js';

// Each control finds its own parts; these tests run the factories against the shipped page markup.
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const pageBody = indexHtml.slice(indexHtml.indexOf('<body>') + '<body>'.length, indexHtml.indexOf('<script type="module">'));
const click = (id: string): void => { document.getElementById(id)!.click(); };
const text = (id: string): string => document.getElementById(id)!.textContent ?? '';

describe('controls built from the page markup', () => {
  beforeEach(() => { document.body.innerHTML = pageBody; });

  it('Save as Collection reports the entered name', () => {
    const dialog = SaveAsNewDialogController.fromDocument(document, { validateName: () => '' });
    const confirmed = vi.fn();
    dialog.on('confirmed', confirmed);

    dialog.open();
    const nameInput = document.getElementById('saveAsNewNameInput') as HTMLInputElement;
    nameInput.value = 'picks';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    click('confirmSaveAsNewBtn');

    expect(confirmed).toHaveBeenCalledWith('picks');
  });

  it('Add to Collection reports the chosen collection', () => {
    const dialog = AddToCollectionDialogController.fromDocument(document, { newChoiceValue: '__new__' });
    const confirmed = vi.fn();
    dialog.on('confirmed', confirmed);

    dialog.renderChoices([{ label: 'picks', value: 'picks.txt', collectionFilename: 'picks.txt' }]);
    click('confirmAddToCollectionBtn');

    expect(confirmed).toHaveBeenCalledWith({ kind: 'existing', collectionFilename: 'picks.txt' });
  });

  it('the unsaved-changes prompt shows its message and answers Save', () => {
    const onSave = vi.fn();
    UnsavedChangesDialogController.fromDocument(document).open({ message: 'Save first?', onSave });

    expect(text('unsavedChangesText')).toBe('Save first?');
    click('confirmUnsavedChangesBtn');
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('the delete dialogs show their text and answer Save and Delete', () => {
    const dialogs = DeleteFromDiskDialogController.fromDocument(document, { appText: new AppText() });
    const onSave = vi.fn();
    const onConfirm = vi.fn();

    dialogs.openPreflight({ text: 'Save before deleting?', onSave });
    expect(text('deletePreflightText')).toBe('Save before deleting?');
    click('confirmDeletePreflightBtn');
    dialogs.openConfirm({ summary: 'Delete 1 clip?', preview: 'alpha.mp4', onConfirm });
    expect(text('deleteFromDiskSummary')).toBe('Delete 1 clip?');
    expect(text('deleteFromDiskPreview')).toBe('alpha.mp4');
    click('confirmDeleteFromDiskBtn');

    expect(onSave).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('the collection conflict shows its summary and answers Apply', () => {
    const onApply = vi.fn();
    const conflict = CollectionConflictController.fromDocument(document, { appText: new AppText() });

    conflict.show({ summary: '1 clip is missing.', list: 'alpha.mp4', onApply });
    expect(conflict.isVisible()).toBe(true);
    expect(text('collectionConflictSummary')).toBe('1 clip is missing.');
    click('applyCollectionConflictBtn');

    expect(onApply).toHaveBeenCalledOnce();
  });

  it('the clip context menu renders its items in the clip menu', () => {
    const onSelect = vi.fn();
    const menu = ContextMenuController.forClipMenu(document);

    menu.renderItems([{ id: 'refine', label: 'Refine', onSelect }]);
    menu.setOpen(true);
    document.querySelector<HTMLElement>('#clipContextMenuPanel [data-item-id="refine"]')!.click();

    expect(onSelect).toHaveBeenCalledOnce();
    menu.destroy();
  });

  it('the Activity indicator describes its own utility surface', () => {
    const activity = ActivityIndicatorControl.fromDocument(document, { logger: new ActivityLogger() });

    expect(activity.utilitySurface()).toMatchObject({
      label: 'Activity and Errors',
      trigger: document.getElementById('activityIndicatorBtn'),
      panel: document.getElementById('activityIndicatorPanel'),
    });
    activity.destroy();
  });

  it('reports a required part that is missing from the page', () => {
    document.body.innerHTML = '';

    expect(() => UnsavedChangesDialogController.fromDocument(document)).toThrow('Required element #unsavedChangesDialog was not found.');
  });
});
