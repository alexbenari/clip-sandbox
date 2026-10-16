// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesktopAppTestEnvironment, desktopFile, openActivityPanel, waitFor } from './app-controller-harness.js';
import { installGifDesktopApiFakes } from './desktop-api-fakes.js';

describe('app controller context menu wiring', () => {
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
        'New collection...',
        'Delete from Disk...',
      ]);
    });
  });

  test('failed disk deletion shows the file and operating system error in More Details', async () => {
    window.clipSandboxDesktop.deleteFiles = vi.fn(async () => ({
      ok: false,
      code: 'partial',
      results: [{
        filename: 'alpha.mp4',
        ok: false,
        code: 'delete-failed',
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
    document.getElementById('deleteFromDiskBtn').click();
    await waitFor(() => expect(document.getElementById('deleteFromDiskDialog').open).toBe(true));
    document.getElementById('confirmDeleteFromDiskBtn').click();

    await waitFor(() => expect(document.querySelector('#activityIndicatorList li')?.textContent).toContain('Failed to delete'));
    const details = document.querySelector('#activityIndicatorList li details');
    expect(details?.querySelector('summary')?.textContent).toBe('More Details');
    expect(details?.textContent).toContain('alpha.mp4');
    expect(details?.textContent).toContain('EBUSY: resource busy or locked');
  });

  test('running Loopify from zoom mode refreshes pipeline view, selects the new clip, and records success history', async () => {
    window.clipSandboxDesktop.createVideoEdit = vi.fn(async () => ({
      ok: true,
      createdFile: {
        name: 'alpha-looped.mp4',
        path: 'C:/clips/alpha-looped.mp4',
        relativePath: 'alpha-looped.mp4',
        mediaSource: 'file:///C:/clips/alpha-looped.mp4',
        type: 'video/mp4',
        lastModifiedMs: Date.now(),
      },
    }));

    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => {
      expect(document.getElementById('zoomVideo')).not.toBeNull();
    });

    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 70,
      clientY: 80,
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull();
    });
    document.querySelector('[data-item-id="zoom-edit-loopify"]').click();

    await waitFor(() => {
      expect(window.clipSandboxDesktop.createVideoEdit).toHaveBeenCalledOnce();
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'alpha-looped.mp4',
        'alpha.mp4',
      ]);
      expect(document.getElementById('zoomVideo').dataset.name).toBe('alpha-looped.mp4');
      expect(document.getElementById('activityIndicatorBtn').dataset.state).toBe('success');
    });

    await openActivityPanel();
    expect(Array.from(document.querySelectorAll('#activityIndicatorList li')).map((el) => el.textContent)).toEqual([
      'Created alpha-looped.mp4.',
      'Loopify started for alpha.mp4.',
      'Loaded pipeline with 1 clip.',
    ]);
  });

  test('Loopify inserts the created clip after the source in collection view without auto-saving', async () => {
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => ({
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [
        {
          name: 'alpha.mp4',
          path: 'C:/clips/alpha.mp4',
          relativePath: 'alpha.mp4',
          mediaSource: 'file:///C:/clips/alpha.mp4',
          type: 'video/mp4',
          lastModifiedMs: Date.now(),
        },
        {
          name: 'bravo.mp4',
          path: 'C:/clips/bravo.mp4',
          relativePath: 'bravo.mp4',
          mediaSource: 'file:///C:/clips/bravo.mp4',
          type: 'video/mp4',
          lastModifiedMs: Date.now(),
        },
        {
          name: 'charlie.mp4',
          path: 'C:/clips/charlie.mp4',
          relativePath: 'charlie.mp4',
          mediaSource: 'file:///C:/clips/charlie.mp4',
          type: 'video/mp4',
          lastModifiedMs: Date.now(),
        },
      ],
    }));
    window.clipSandboxDesktop.createVideoEdit = vi.fn(async () => ({
      ok: true,
      createdFile: {
        name: 'alpha-looped.mp4',
        path: 'C:/clips/alpha-looped.mp4',
        relativePath: 'alpha-looped.mp4',
        mediaSource: 'file:///C:/clips/alpha-looped.mp4',
        type: 'video/mp4',
        lastModifiedMs: Date.now(),
      },
    }));

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
      expect(document.getElementById('saveAsNewBtn').disabled).toBe(false);
    });

    document.getElementById('saveAsNewBtn').click();
    document.getElementById('saveAsNewNameInput').value = 'subset';
    document.getElementById('saveAsNewNameInput').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('confirmSaveAsNewBtn').click();

    await waitFor(() => {
      expect(document.querySelectorAll('#activeCollectionName option')).toHaveLength(2);
      expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => {
      expect(document.getElementById('zoomVideo')).not.toBeNull();
    });

    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 30,
      clientY: 40,
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull();
    });
    document.querySelector('[data-item-id="zoom-edit-loopify"]').click();

    await waitFor(() => {
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'alpha.mp4',
        'alpha-looped.mp4',
        'bravo.mp4',
        'charlie.mp4',
      ]);
      expect(document.getElementById('saveBtn').disabled).toBe(false);
    });

    expect(window.clipSandboxDesktop.saveTextFile).toHaveBeenCalledTimes(1);
  });

  test('Loopify failures auto-open the activity panel and keep the indicator in error state', async () => {
    window.clipSandboxDesktop.createVideoEdit = vi.fn(async () => ({
      ok: false,
      code: 'process-failed',
    }));

    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    }));
    await waitFor(() => {
      expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull();
    });
    document.querySelector('[data-item-id="zoom-edit-loopify"]').click();

    await waitFor(() => {
      expect(document.getElementById('activityIndicatorPanel').hidden).toBe(false);
      expect(document.getElementById('activityIndicatorBtn').dataset.state).toBe('error');
      expect(document.querySelector('#activityIndicatorList li').textContent).toContain('Loopify failed while generating the output clip.');
    });
  });

  test('an error during any full screen element remains in Activity without opening its panel or moving focus', async () => {
    document.getElementById('globalAppBar').insertAdjacentHTML('beforeend', '<button id="keyboardMapBtn"></button>');
    document.body.insertAdjacentHTML('beforeend', '<div id="globalUtilityHost" hidden><section id="keyboardMapPanel" hidden></section></div>');
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

  test('reports created output when application update fails and allows another edit', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    window.clipSandboxDesktop.createVideoEdit = vi.fn(async () => ({ ok: true, createdFile: desktopFile({ name: 'alpha-looped.mp4' }) }));
    const { AppController } = await import('../../../src/app/app-controller.js');
    const { ElectronFolderService } = await import('../../../src/adapters/electron/electron-folder-service.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1));
    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const conversion = vi.spyOn(ElectronFolderService.prototype, 'toRendererFile');
    conversion.mockImplementationOnce(() => { throw new Error('Output refresh failed'); });
    const runEdit = async () => {
      document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      await waitFor(() => expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull());
      document.querySelector('[data-item-id="zoom-edit-loopify"]').click();
    };
    await runEdit();
    await waitFor(() => {
      expect(document.getElementById('activityIndicatorBtn').dataset.state).toBe('error');
      expect(document.getElementById('activityIndicatorList').textContent).toContain('output clip was created');
      expect(document.getElementById('activityIndicatorList').textContent).toContain('alpha-looped.mp4');
    });
    await runEdit();
    await waitFor(() => {
      expect(window.clipSandboxDesktop.createVideoEdit).toHaveBeenCalledTimes(2);
      expect(document.getElementById('zoomVideo').dataset.name).toBe('alpha-looped.mp4');
    });
    conversion.mockRestore();
    pause.mockRestore(); load.mockRestore();
  });

  test('ignores duplicate Loopify requests while one edit is already running', async () => {
    let resolveEdit;
    window.clipSandboxDesktop.createVideoEdit = vi.fn(() => new Promise((resolve) => {
      resolveEdit = resolve;
    }));

    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    document.querySelector('#appScreenSelector').value = 'collection';
    document.querySelector('#appScreenSelector').dispatchEvent(new Event('change'));
    document.getElementById('pickBtn').click();

    await waitFor(() => {
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
    });

    document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => {
      expect(document.getElementById('zoomVideo')).not.toBeNull();
    });

    const openAndClickLoopify = async () => {
      document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 18,
        clientY: 22,
      }));
      await waitFor(() => {
        expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull();
      });
      document.querySelector('[data-item-id="zoom-edit-loopify"]').click();
    };

    await openAndClickLoopify();
    await openAndClickLoopify();

    expect(window.clipSandboxDesktop.createVideoEdit).toHaveBeenCalledTimes(1);

    resolveEdit({
      ok: true,
      createdFile: {
        name: 'alpha-looped.mp4',
        path: 'C:/clips/alpha-looped.mp4',
        relativePath: 'alpha-looped.mp4',
        mediaSource: 'file:///C:/clips/alpha-looped.mp4',
        type: 'video/mp4',
        lastModifiedMs: Date.now(),
      },
    });

    await waitFor(() => {
      expect(document.getElementById('activityIndicatorBtn').dataset.state).toBe('success');
    });
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

  test('save failure does not continue from delete preflight into delete confirmation', async () => {
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
    document.getElementById('deleteFromDiskBtn').click();

    await waitFor(() => {
      expect(document.getElementById('deletePreflightDialog').open).toBe(true);
      expect(document.getElementById('deleteFromDiskDialog').open).toBe(false);
    });

    document.getElementById('confirmDeletePreflightBtn').click();

    await waitFor(() => {
      expect(window.clipSandboxDesktop.saveTextFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'subset.txt' }));
      expect(document.getElementById('deletePreflightDialog').open).toBe(true);
      expect(document.getElementById('deleteFromDiskDialog').open).toBe(false);
      expect(window.clipSandboxDesktop.deleteFiles).not.toHaveBeenCalled();
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((el) => el.dataset.name)).toEqual([
        'bravo.mp4',
        'charlie.mp4',
      ]);
    });
  });
});

