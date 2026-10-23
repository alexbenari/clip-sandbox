import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogger } from '../../../src/app/activity-logger.js';
import { AppText } from '../../../src/app/app-text.js';
import { ClipCollectionGridControl } from '../../../src/ui/clip-collection-grid-control.js';
import { CollectionScreen } from '../../../src/ui/collection-screen.js';
import { CollectionSelectorControl } from '../../../src/ui/collection-selector-control.js';
import { GifRangesPanelControl } from '../../../src/ui/gif-ranges-panel-control.js';
import { GlobalUtilityCoordinator } from '../../../src/ui/global-utility-coordinator.js';
import { PipelineCatalogControl } from '../../../src/ui/pipeline-catalog-control.js';
import { ZoomOverlayControl } from '../../../src/ui/zoom-overlay-control.js';
import { ActivityIndicatorControl } from '../../../src/ui/activity-indicator-control.js';
import type { IAppScreen } from '../../../src/ui/app-screen.js';
import { ApplicationShellControl } from '../../../src/ui/application-shell-control.js';
import { KeyboardMapControl } from '../../../src/ui/keyboard-map-control.js';
import { AddToCollectionDialogControl } from '../../../src/ui/add-to-collection-dialog-control.js';
import { CollectionConflictControl } from '../../../src/ui/collection-conflict-control.js';
import { ContextMenuControl } from '../../../src/ui/context-menu-control.js';
import { TrashClipsDialogControl } from '../../../src/ui/trash-clips-dialog-control.js';
import { MainToolbarControl } from '../../../src/ui/main-toolbar-control.js';
import { SaveAsNewDialogControl } from '../../../src/ui/save-as-new-dialog-control.js';
import { UnsavedChangesDialogControl } from '../../../src/ui/unsaved-changes-dialog-control.js';
import { shippedPageBody } from '../../support/page-markup.js';

// Each control finds its own parts; these tests run the factories against the shipped page markup.
const pageBody = shippedPageBody();
const click = (id: string): void => { document.getElementById(id)!.click(); };
const text = (id: string): string => document.getElementById(id)!.textContent ?? '';

describe('controls built from the page markup', () => {
  beforeEach(() => { document.body.innerHTML = pageBody; });

  it('Save as Collection reports the entered name', () => {
    const dialog = SaveAsNewDialogControl.fromDocument(document, { nameCheck: { problemText: () => '' } });
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
    const dialog = AddToCollectionDialogControl.fromDocument(document, { newChoiceValue: '__new__' });
    const confirmed = vi.fn();
    dialog.on('confirmed', confirmed);

    dialog.renderChoices([{ label: 'picks', value: 'picks.txt', collectionFilename: 'picks.txt' }]);
    click('confirmAddToCollectionBtn');

    expect(confirmed).toHaveBeenCalledWith({ kind: 'existing', collectionFilename: 'picks.txt' });
  });

  it('the unsaved-changes prompt shows its message and answers Save', () => {
    const onSave = vi.fn();
    UnsavedChangesDialogControl.fromDocument(document).open({ message: 'Save first?', onSave });

    expect(text('unsavedChangesText')).toBe('Save first?');
    click('confirmUnsavedChangesBtn');
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('the Recycle Bin dialogs show their text and answer Save and Move to Recycle Bin', () => {
    const dialogs = TrashClipsDialogControl.fromDocument(document, { appText: new AppText() });
    const onSave = vi.fn();
    const onConfirm = vi.fn();

    dialogs.openPreflight({ text: 'Save first?', onSave });
    expect(text('trashPreflightText')).toBe('Save first?');
    click('confirmTrashPreflightBtn');
    dialogs.openConfirm({ summary: 'Move 1 clip?', preview: 'alpha.mp4', onConfirm });
    expect(text('trashClipsSummary')).toBe('Move 1 clip?');
    expect(text('trashClipsPreview')).toBe('alpha.mp4');
    expect(text('confirmTrashClipsBtn')).toBe('Move to Recycle Bin');
    click('confirmTrashClipsBtn');

    expect(onSave).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('the Actions menu ends with the Recycle Bin command, set apart by a separator', () => {
    const entries = Array.from(document.getElementById('orderMenuPanel')!.children);

    expect(entries.slice(-2).map(entry => entry.getAttribute('role'))).toEqual(['separator', 'menuitem']);
    expect(entries.at(-1)!.textContent).toBe('Move selected to Recycle Bin…');
  });

  it('the collection conflict shows its summary and answers Apply', () => {
    const onApply = vi.fn();
    const conflict = CollectionConflictControl.fromDocument(document, { appText: new AppText() });

    conflict.show({ summary: '1 clip is missing.', list: 'alpha.mp4', onApply });
    expect(conflict.isVisible()).toBe(true);
    expect(text('collectionConflictSummary')).toBe('1 clip is missing.');
    click('applyCollectionConflictBtn');

    expect(onApply).toHaveBeenCalledOnce();
  });

  it('the clip context menu renders its items in the clip menu', () => {
    const onSelect = vi.fn();
    const menu = ContextMenuControl.forClipMenu(document);

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
    const shell = ApplicationShellControl.fromDocument(document, { screens });
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
    const grid = ClipCollectionGridControl.fromDocument(document, { fullScreen: { isDocumentFullScreen: () => false } });

    expect(document.getElementById('gridWrap')!.classList.contains('clip-collection-grid-root')).toBe(true);
    expect(document.getElementById('grid')!.classList.contains('clip-collection-grid')).toBe(true);
    expect(grid.normalizeFullscreenSlots(1)).toBe(2);
    grid.dispose();
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

    const conflict = CollectionConflictControl.fromDocument(document, { appText: new AppText() });
    const saveAsNew = SaveAsNewDialogControl.fromDocument(document);
    const unsavedChanges = UnsavedChangesDialogControl.fromDocument(document);

    expect(conflict.isVisible()).toBe(false);
    expect(saveAsNew.isOpen()).toBe(false);
    expect(unsavedChanges.isOpen()).toBe(false);
  });

  it('the collection selector reports a choice made in the page selector', () => {
    const selector = CollectionSelectorControl.fromDocument(document, { appText: new AppText() });
    const selectionRequested = vi.fn();
    selector.on('selectionRequested', selectionRequested);
    const select = document.getElementById('activeCollectionName') as HTMLSelectElement;
    select.disabled = false;
    select.append(new Option('picks', 'picks.txt'));

    select.value = 'picks.txt';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(selectionRequested).toHaveBeenCalledWith('picks.txt');
    selector.destroy();
  });

  it('Zoom opens its overlay in the page Zoom layer', () => {
    const media = [
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined),
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined),
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockReturnValue(undefined),
    ];
    const zoom = ZoomOverlayControl.fromDocument(document, { audioPreference: { current: { singleClipAudioDefault: false } } });

    zoom.open({ clipId: 'clip_1', src: 'file:///C:/clips/alpha.mp4', name: 'alpha.mp4' });

    expect(document.getElementById('zoomLayerRoot')!.querySelector('#zoomOverlay')).not.toBeNull();
    zoom.close();
    for (const spy of media) spy.mockRestore();
  });

  it('the Pipelines catalog and the captured ranges panel use the page hosts, and are absent without them', () => {
    const session = { subscribe: vi.fn(() => vi.fn()) };
    const catalog = PipelineCatalogControl.fromDocument(document, { catalog: { listPipelineCatalog: vi.fn(), pipelineCatalogDetails: vi.fn() } as never });
    const ranges = GifRangesPanelControl.fromDocument(document, session as never);
    const host = document.createElement('div');
    ranges!.mount(host);

    expect(catalog).not.toBeNull();
    expect(host.firstElementChild?.id).toBe('gifRangesPanel');
    catalog!.destroy();
    ranges!.destroy();

    document.body.innerHTML = '';
    expect(PipelineCatalogControl.fromDocument(document, { catalog: {} as never })).toBeNull();
    expect(GifRangesPanelControl.fromDocument(document, session as never)).toBeNull();
  });

  it('the utility coordinator uses the page utility host', () => {
    const keyboardMap = KeyboardMapControl.fromDocument(document, { globalShortcuts: [] });
    keyboardMap.render({ label: 'Collection', shortcuts: [] });

    expect(GlobalUtilityCoordinator.isAvailableIn(document)).toBe(true);
    const utilities = GlobalUtilityCoordinator.fromDocument(document, [{ id: 'keyboard', ...keyboardMap.utilitySurface()! }]);
    utilities!.open('keyboard');

    expect(document.getElementById('keyboardMapPanel')!.hidden).toBe(false);
    utilities!.destroy();
    document.body.innerHTML = '';
    expect(GlobalUtilityCoordinator.isAvailableIn(document)).toBe(false);
  });

  it('reports a required part that is missing from the page', () => {
    document.body.innerHTML = '';

    expect(() => UnsavedChangesDialogControl.fromDocument(document)).toThrow('Required element #unsavedChangesDialog was not found.');
  });
});
