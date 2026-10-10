import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogger } from '../../../src/app/activity-logger.js';
import { AppText } from '../../../src/app/app-text.js';
import { ClipCollectionGridController } from '../../../src/ui/clip-collection-grid-controller.js';
import { CollectionScreen } from '../../../src/ui/collection-screen.js';
import { ActivityIndicatorControl } from '../../../src/ui/activity-indicator-control.js';
import type { IAppScreen } from '../../../src/ui/app-screen.js';
import { ApplicationShellController } from '../../../src/ui/application-shell-controller.js';
import { KeyboardMapControl } from '../../../src/ui/keyboard-map-control.js';
import { AddToCollectionDialogController } from '../../../src/ui/add-to-collection-dialog-controller.js';
import { CollectionConflictController } from '../../../src/ui/collection-conflict-controller.js';
import { ContextMenuController } from '../../../src/ui/context-menu-controller.js';
import { DeleteFromDiskDialogController } from '../../../src/ui/delete-from-disk-dialog-controller.js';
import { MainToolbarControl } from '../../../src/ui/main-toolbar-control.js';
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

  it('the main toolbar reports its commands and navigates its Actions menu', () => {
    const toolbar = MainToolbarControl.fromDocument(document, { appText: new AppText() });
    const saveAsNewRequested = vi.fn();
    toolbar.on('saveAsNewRequested', saveAsNewRequested);

    toolbar.render({ clipCount: 2, hasPipeline: true, hasSequence: true, isPipelineMode: true });
    expect(text('count')).toBe('2 clips');
    document.getElementById('orderMenuBtn')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.getElementById('orderMenu')!.dataset.open).toBe('true');
    expect(document.activeElement).toBe(document.getElementById('saveAsNewBtn'));
    click('saveAsNewBtn');

    expect(saveAsNewRequested).toHaveBeenCalledOnce();
    expect(document.getElementById('orderMenu')!.dataset.open).toBe('false');
    toolbar.destroy();
  });

  it('the application shell mounts its screens and reports the Settings button', () => {
    const screen = (id: string): IAppScreen => ({
      id, label: id, selectorStatus: 'fixed', root: document.createElement('section'), commands: null, shortcuts: [],
      panelContributions: [], focusInitial: vi.fn(),
    });
    const screens: [IAppScreen, IAppScreen] = [screen('collection'), screen('settings')];
    const shell = ApplicationShellController.fromDocument(document, { screens });
    const settingsRequested = vi.fn();
    shell.on('settingsRequested', settingsRequested);

    shell.start();
    click('settingsBtn');

    expect(screens.every(({ root }) => root.parentElement === document.getElementById('mainScreenHost'))).toBe(true);
    expect([...(document.getElementById('appScreenSelector') as HTMLSelectElement).options].map(option => option.value))
      .toEqual(['collection', 'settings']);
    expect(settingsRequested).toHaveBeenCalledOnce();
    shell.destroy();
  });

  it('the keyboard map describes its own utility surface', () => {
    const keyboardMap = KeyboardMapControl.fromDocument(document, { globalShortcuts: [] });

    expect(keyboardMap.utilitySurface()).toMatchObject({
      label: 'Keyboard shortcuts',
      trigger: document.getElementById('keyboardMapBtn'),
      panel: document.getElementById('keyboardMapPanel'),
    });
  });

  it('the clip grid takes over the page grid and owns its layout rules', () => {
    const grid = ClipCollectionGridController.fromDocument(document, { fullScreen: { isDocumentFullScreen: () => false } });

    expect(document.getElementById('gridWrap')!.classList.contains('clip-collection-grid-root')).toBe(true);
    expect(document.getElementById('grid')!.classList.contains('clip-collection-grid')).toBe(true);
    expect(grid.normalizeFullscreenSlots(1)).toBe(2);
    grid.destroy();
  });

  it('the Collection screen finds its root and command bar', () => {
    const screen = CollectionScreen.fromDocument(document, {
      grid: { focusSelectedClip: () => false, beginWorkspaceResize: vi.fn(), endWorkspaceResize: vi.fn() },
      toolbar: { focusBrowse: vi.fn() },
    });

    expect(screen.root).toBe(document.getElementById('collectionScreen'));
    expect(screen.commands).toBe(document.getElementById('toolbar'));
  });

  it('dialogs and the collection conflict start closed', () => {
    document.getElementById('collectionConflict')!.hidden = false;
    (document.getElementById('saveAsNewDialog') as HTMLElement).hidden = false;
    document.getElementById('unsavedChangesDialog')!.setAttribute('open', '');

    const conflict = CollectionConflictController.fromDocument(document, { appText: new AppText() });
    const saveAsNew = SaveAsNewDialogController.fromDocument(document);
    const unsavedChanges = UnsavedChangesDialogController.fromDocument(document);

    expect(conflict.isVisible()).toBe(false);
    expect(saveAsNew.isOpen()).toBe(false);
    expect(unsavedChanges.isOpen()).toBe(false);
  });

  it('reports a required part that is missing from the page', () => {
    document.body.innerHTML = '';

    expect(() => UnsavedChangesDialogController.fromDocument(document)).toThrow('Required element #unsavedChangesDialog was not found.');
  });
});
