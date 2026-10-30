// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesktopAppTestEnvironment, desktopFile, openActivityPanel, waitFor } from './app-controller-harness.js';
import { installGifDesktopApiFakes } from './desktop-api-fakes.js';

describe('AppController Collection and Zoom workflows', () => {
  const environment = new DesktopAppTestEnvironment();

  beforeEach(() => environment.setUp());
  afterEach(() => environment.tearDown());

  test('starts without the saved-captures desktop API and reports movie opening as unavailable', async () => {
    installGifDesktopApiFakes(window.clipSandboxDesktop);
    delete window.clipSandboxDesktop.clipCaptures;
    const { AppController } = await import('../../../src/app/app-controller.js');

    new AppController().init();
    document.querySelector('[data-command="open-movie"]').click();

    expect(document.querySelector('.gif-workflow-command-status').textContent).toBe('Movie opening is currently unavailable.');
    expect(window.clipSandboxDesktop.frameReview.chooseSource).not.toHaveBeenCalled();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1));
  });

  test('opening a folder marks the clips that came from a movie', async () => {
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => ({
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' })],
    }));
    window.clipSandboxDesktop.clipSourceMovies = {
      read: vi.fn(async ({ filenames }) => ({
        clips: filenames.map(filename => (filename === 'alpha.mp4'
          ? { filename, kind: 'movie', movieFileName: 'Sample Feature.mkv' }
          : { filename, kind: 'none' })),
      })),
    };
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));

    document.getElementById('pickBtn').click();

    await waitFor(() => expect(document.querySelector('#grid .thumb[data-name="alpha.mp4"] .source-glyph')?.title).toBe('From Sample Feature'));
    expect(document.querySelector('#grid .thumb[data-name="bravo.mp4"] .source-glyph')).toBeNull();
  });

  test('right-clicking a selected clip opens the app context menu', async () => {
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
    });

    const card = document.querySelector('#grid .thumb');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('gridWrap').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 50,
      clientY: 60,
    }));

    await waitFor(() => {
      const items = document.querySelectorAll('#clipContextMenu [role="menuitem"]');
      expect(items).toHaveLength(2);
      expect(Array.from(items).map((item) => item.textContent)).toEqual([
        'New collection…',
        'Move selected to Recycle Bin…',
      ]);
    });
  });

  test('right-clicking a clip outside the selection moves that clip to the Recycle Bin from the menu', async () => {
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => ({
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' })],
    }));
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(document.querySelectorAll('#grid .thumb')).toHaveLength(2));

    document.querySelector('#grid .thumb[data-name="alpha.mp4"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('#grid .thumb[data-name="bravo.mp4"]').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 50,
      clientY: 60,
    }));
    await waitFor(() => expect(document.querySelector('#clipContextMenu [data-item-id="trash-selected"]')).not.toBeNull());
    document.querySelector('#clipContextMenu [data-item-id="trash-selected"]').click();
    await waitFor(() => expect(document.getElementById('trashClipsDialog').open).toBe(true));
    document.getElementById('confirmTrashClipsBtn').click();

    await waitFor(() => expect(window.clipSandboxDesktop.trashFiles).toHaveBeenCalledWith({
      folderPath: 'C:/clips',
      filenames: ['bravo.mp4'],
    }));
  });

  test('a failed move to the Recycle Bin shows the file and operating system error in More details', async () => {
    window.clipSandboxDesktop.trashFiles = vi.fn(async () => ({
      ok: false,
      code: 'partial',
      results: [{
        filename: 'alpha.mp4',
        ok: false,
        code: 'trash-failed',
        error: { message: "EBUSY: resource busy or locked, unlink 'C:/clips/alpha.mp4'" },
      }],
    }));
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1));

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('trashSelectedBtn').click();
    await waitFor(() => expect(document.getElementById('trashClipsDialog').open).toBe(true));
    document.getElementById('confirmTrashClipsBtn').click();

    await waitFor(() => expect(document.querySelector('#activityIndicatorList li')?.textContent).toContain('Could not move the selected clips to the Recycle Bin.'));
    const details = document.querySelector('#activityIndicatorList li details');
    expect(details?.querySelector('summary')?.textContent).toBe('More details');
    expect(details?.textContent).toContain('alpha.mp4');
    expect(details?.textContent).toContain('EBUSY: resource busy or locked');
  });

  test('an error during any full screen element remains in Activity without opening its panel or moving focus', async () => {
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => { throw new Error('Folder unavailable'); });
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    const playerRoot = document.createElement('section');
    playerRoot.tabIndex = -1;
    document.body.append(playerRoot);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => playerRoot });
    try {
      playerRoot.focus();
      document.getElementById('pickBtn').click();
      await waitFor(() => expect(document.getElementById('activityIndicatorBtn').dataset.state).toBe('error'));
      expect(document.getElementById('activityIndicatorPanel').hidden).toBe(true);
      expect(document.activeElement).toBe(playerRoot);
      expect(document.getElementById('activityIndicatorList').textContent).toContain('Folder unavailable');
    } finally {
      delete document.fullscreenElement;
    }
    document.getElementById('activityIndicatorBtn').click();
    expect(document.getElementById('activityIndicatorPanel').hidden).toBe(false);
  });

  test('save failure does not continue a pending collection switch', async () => {
    const folder = {
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [
        desktopFile({ name: 'alpha.mp4' }),
        desktopFile({ name: 'bravo.mp4' }),
        desktopFile({ name: 'charlie.mp4' }),
      ],
    };
    const savedCollections = new Map();
    environment.serveFileText(name => savedCollections.get(name));
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => folder);
    window.clipSandboxDesktop.refreshFolder = vi.fn(async () => ({
      ...folder,
      files: [...folder.files, ...Array.from(savedCollections, ([name, text]) => desktopFile({ name, text }))],
    }));

    const saveFailure = new Error('disk full');
    let subsetSaveAttempts = 0;
    window.clipSandboxDesktop.saveTextFile = vi.fn(async ({ filename, text }) => {
      if (filename === 'subset.txt') {
        subsetSaveAttempts += 1;
        if (subsetSaveAttempts > 1) throw saveFailure;
      }
      savedCollections.set(filename, text);
      return { mode: 'saved' };
    });

    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'alpha.mp4',
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });

    document.getElementById('saveAsNewBtn').click();
    document.getElementById('saveAsNewNameInput').value = 'subset';
    document.getElementById('saveAsNewNameInput').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('confirmSaveAsNewBtn').click();

    await waitFor(() => {
      expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
      expect(document.getElementById('saveBtn').disabled).toBe(false);
    });

    document.getElementById('saveAsNewBtn').click();
    document.getElementById('saveAsNewNameInput').value = 'picks';
    document.getElementById('saveAsNewNameInput').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('confirmSaveAsNewBtn').click();

    await waitFor(() => {
      expect(document.getElementById('activeCollectionName').value).toBe('picks.txt');
    });

    document.getElementById('activeCollectionName').value = 'subset.txt';
    document.getElementById('activeCollectionName').dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'alpha.mp4',
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
      expect(document.getElementById('saveBtn').disabled).toBe(false);
    });

    document.getElementById('activeCollectionName').value = 'picks.txt';
    document.getElementById('activeCollectionName').dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(document.getElementById('unsavedChangesDialog').open).toBe(true);
    });

    document.getElementById('confirmUnsavedChangesBtn').click();

    await waitFor(() => {
      expect(window.clipSandboxDesktop.saveTextFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'subset.txt' }));
      expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
      expect(document.getElementById('unsavedChangesDialog').open).toBe(true);
      expect(document.title).toBe('subset');
    });
  });

  test('save failure does not continue from the Recycle Bin preflight into its confirmation', async () => {
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => ({
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [
        desktopFile({ name: 'alpha.mp4' }),
        desktopFile({ name: 'bravo.mp4' }),
        desktopFile({ name: 'charlie.mp4' }),
      ],
    }));

    const saveFailure = new Error('disk full');
    let subsetSaveAttempts = 0;
    window.clipSandboxDesktop.saveTextFile = vi.fn(async ({ filename }) => {
      if (filename === 'subset.txt') {
        subsetSaveAttempts += 1;
        if (subsetSaveAttempts > 1) throw saveFailure;
      }
      return { mode: 'saved' };
    });

    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'alpha.mp4',
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });

    document.getElementById('saveAsNewBtn').click();
    document.getElementById('saveAsNewNameInput').value = 'subset';
    document.getElementById('saveAsNewNameInput').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('confirmSaveAsNewBtn').click();

    await waitFor(() => {
      expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('trashSelectedBtn').click();

    await waitFor(() => {
      expect(document.getElementById('trashPreflightDialog').open).toBe(true);
      expect(document.getElementById('trashClipsDialog').open).toBe(false);
    });

    document.getElementById('confirmTrashPreflightBtn').click();

    await waitFor(() => {
      expect(window.clipSandboxDesktop.saveTextFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'subset.txt' }));
      expect(document.getElementById('trashPreflightDialog').open).toBe(true);
      expect(document.getElementById('trashClipsDialog').open).toBe(false);
      expect(window.clipSandboxDesktop.trashFiles).not.toHaveBeenCalled();
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });
  });

  describe('operating the clip grid from the keyboard', () => {
    const clipNames = () => Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name);
    const card = (name) => document.querySelector(`#grid .thumb[data-name="${name}"]`);
    const press = (key, modifiers = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      (document.activeElement ?? document.body).dispatchEvent(event);
      return event;
    };
    const isShown = (id) => !document.getElementById(id).hidden;

    async function openFolder({ collection = null } = {}) {
      const folder = {
        canceled: false,
        folderPath: 'C:/clips',
        folderName: 'clips',
        files: [
          desktopFile({ name: 'alpha.mp4' }),
          desktopFile({ name: 'bravo.mp4' }),
          desktopFile({ name: 'charlie.mp4' }),
          desktopFile({ name: 'picks.txt', text: 'alpha.mp4\nbravo.mp4\ncharlie.mp4\n' }),
        ],
      };
      window.clipSandboxDesktop.pickFolder = vi.fn(async () => folder);
      window.clipSandboxDesktop.refreshFolder = vi.fn(async () => folder);
      const { AppController } = await import('../../../src/app/app-controller.js');
      new AppController().init();
      document.querySelector('#appScreenSelector').value = 'collection';
      document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
      document.getElementById('pickBtn').click();
      await waitFor(() => expect(clipNames()).toEqual(['alpha.mp4', 'bravo.mp4', 'charlie.mp4']));
      if (!collection) return;
      document.getElementById('activeCollectionName').value = collection;
      document.getElementById('activeCollectionName').dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => expect(document.title).toBe('picks'));
    }

    test('moving a clip with Alt+Arrow marks the collection unsaved and offers Save', async () => {
      await openFolder({ collection: 'picks.txt' });
      expect(isShown('unsavedChangesMarker')).toBe(false);
      expect(isShown('saveChangesBtn')).toBe(false);
      card('alpha.mp4').focus();

      press('ArrowRight');
      press('ArrowLeft', { altKey: true });

      expect(clipNames()).toEqual(['bravo.mp4', 'alpha.mp4', 'charlie.mp4']);
      expect(document.activeElement).toBe(card('bravo.mp4'));
      expect(isShown('unsavedChangesMarker')).toBe(true);
      expect(isShown('saveChangesBtn')).toBe(true);
    });

    test('Ctrl+S saves the reordered collection and clears the unsaved marker', async () => {
      await openFolder({ collection: 'picks.txt' });
      card('alpha.mp4').focus();
      press('ArrowRight', { altKey: true });

      const save = press('s', { ctrlKey: true });

      expect(save.defaultPrevented).toBe(true);
      await waitFor(() => {
        expect(window.clipSandboxDesktop.saveTextFile).toHaveBeenCalledWith({
          folderPath: 'C:/clips', filename: 'picks.txt', text: 'bravo.mp4\nalpha.mp4\ncharlie.mp4\n',
        });
        expect(isShown('unsavedChangesMarker')).toBe(false);
        expect(isShown('saveChangesBtn')).toBe(false);
      });
    });

    test('in the folder view the toolbar Save button opens Save as collection', async () => {
      await openFolder();
      card('charlie.mp4').focus();
      press('ArrowLeft', { altKey: true });
      press('ArrowLeft', { altKey: true });
      await waitFor(() => expect(clipNames()).toEqual(['charlie.mp4', 'alpha.mp4', 'bravo.mp4']));

      document.getElementById('saveChangesBtn').click();

      await waitFor(() => expect(document.getElementById('saveAsNewDialog').hidden).toBe(false));
    });

    test('Shift+F10 opens the menu of the focused clip with its first item focused, and Escape returns to the clip', async () => {
      await openFolder();
      card('alpha.mp4').focus();
      press('ArrowRight');

      press('F10', { shiftKey: true });

      await waitFor(() => expect(document.activeElement?.closest('#clipContextMenu')).not.toBeNull());
      expect(document.querySelector('#grid .thumb.selected')).toBe(card('bravo.mp4'));
      press('Escape');
      expect(document.activeElement).toBe(card('bravo.mp4'));
    });

    test('Enter opens the focused clip in Zoom and Escape returns focus to it', async () => {
      await openFolder();
      card('alpha.mp4').focus();
      press('ArrowRight');

      press('Enter');

      expect(document.querySelector('#zoomOverlay video')?.getAttribute('src')).toBe('file:///C:/clips/bravo.mp4');
      press('Escape');
      expect(document.querySelector('#zoomOverlay')).toBeNull();
      expect(document.activeElement).toBe(card('bravo.mp4'));
    });
  });
});

