// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const baseDom = `
  <header class="toolbar" id="toolbar">
    <button id="pickBtn">Browse Folder…</button>
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Actions</button>
      <div id="orderMenuPanel" role="menu">
        <button id="saveBtn" disabled>Save</button>
        <button id="saveAsNewBtn" disabled>Save as Collection</button>
        <button id="addToCollectionBtn" disabled>Add Selected to Collection...</button>
        <button id="deleteFromDiskBtn" disabled>Delete Selected from Disk...</button>
      </div>
    </div>
    <button id="toggleTitlesBtn">Hide Titles</button>
    <button id="fsBtn">Full Screen</button>
    <select id="activeCollectionName" disabled>
      <option value="">Local Video Grid Reviewer</option>
    </select>
    <div class="toolbar-status">
      <span class="count" id="count"></span>
      <div id="activityIndicatorRoot">
        <button id="activityIndicatorBtn" aria-expanded="false" aria-controls="activityIndicatorPanel"></button>
        <section id="activityIndicatorPanel" hidden>
          <ul id="activityIndicatorList"></ul>
        </section>
      </div>
    </div>
  </header>
  <section id="collectionConflict" hidden>
    <p id="collectionConflictSummary"></p>
    <pre id="collectionConflictList"></pre>
    <button id="applyCollectionConflictBtn">Apply</button>
    <button id="cancelCollectionConflictBtn">Cancel</button>
  </section>
  <section id="saveAsNewDialog" hidden>
    <input id="saveAsNewNameInput" />
    <div id="saveAsNewError"></div>
    <button id="confirmSaveAsNewBtn">Confirm</button>
    <button id="cancelSaveAsNewBtn">Cancel</button>
  </section>
  <dialog id="addToCollectionDialog">
    <select id="addToCollectionSelect"></select>
    <label id="addToCollectionNameLabel" hidden>
      <input id="addToCollectionNameInput" />
    </label>
    <div id="addToCollectionError"></div>
    <button id="confirmAddToCollectionBtn">Confirm</button>
    <button id="cancelAddToCollectionBtn">Cancel</button>
  </dialog>
  <dialog id="unsavedChangesDialog">
    <p id="unsavedChangesText"></p>
    <button id="confirmUnsavedChangesBtn">Save</button>
    <button id="discardUnsavedChangesBtn">Discard</button>
    <button id="cancelUnsavedChangesBtn">Cancel</button>
  </dialog>
  <dialog id="deletePreflightDialog">
    <p id="deletePreflightText"></p>
    <button id="confirmDeletePreflightBtn">Save and Continue</button>
    <button id="discardDeletePreflightBtn">Continue Without Saving</button>
    <button id="cancelDeletePreflightBtn">Cancel</button>
  </dialog>
  <dialog id="deleteFromDiskDialog">
    <p id="deleteFromDiskSummary"></p>
    <pre id="deleteFromDiskPreview"></pre>
    <button id="confirmDeleteFromDiskBtn">Delete</button>
    <button id="cancelDeleteFromDiskBtn">Cancel</button>
  </dialog>
  <div id="clipContextMenu" hidden><div id="clipContextMenuPanel"></div></div>
  <div id="gridWrap"><div id="grid" style="gap:10px"></div></div>
  <div id="zoomLayerRoot"></div>
`;

function waitFor(assertion, { timeout = 250, interval = 10 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      try {
        resolve(assertion());
      } catch (error) {
        if (Date.now() - start >= timeout) {
          reject(error);
          return;
        }
        setTimeout(check, interval);
      }
    }
    check();
  });
}

async function openActivityPanel() {
  document.getElementById('activityIndicatorBtn').click();
  await waitFor(() => {
    expect(document.getElementById('activityIndicatorPanel').hidden).toBe(false);
  });
}

describe('app controller context menu wiring', () => {
  let originalCreateObjectURL;
  let originalRevokeObjectURL;
  let originalPlay;
  let originalPause;
  let originalLoad;
  let originalDocumentAddEventListener;
  let originalWindowAddEventListener;
  let documentAddEventListenerSpy;
  let windowAddEventListenerSpy;
  const documentListeners = [];
  const windowListeners = [];

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = baseDom;
    document.title = '';
    window.clipSandboxDesktop = {
      pickFolder: vi.fn(async () => ({
        canceled: false,
        folderPath: 'C:/clips',
        folderName: 'clips',
        files: [{
          name: 'alpha.mp4',
          path: 'C:/clips/alpha.mp4',
          relativePath: 'alpha.mp4',
          mediaSource: 'file:///C:/clips/alpha.mp4',
          type: 'video/mp4',
          lastModifiedMs: Date.now(),
        }],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
      appendTextFile: vi.fn(async () => ({ mode: 'saved' })),
      createVideoEdit: vi.fn(async () => ({ ok: false, code: 'missing-binary' })),
      deleteFiles: vi.fn(async () => ({ ok: true, code: 'deleted', results: [] })),
    };
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalPlay = HTMLMediaElement.prototype.play;
    originalPause = HTMLMediaElement.prototype.pause;
    originalLoad = HTMLMediaElement.prototype.load;
    originalDocumentAddEventListener = document.addEventListener.bind(document);
    originalWindowAddEventListener = window.addEventListener.bind(window);
    URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
    URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
    documentListeners.length = 0;
    windowListeners.length = 0;
    documentAddEventListenerSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      documentListeners.push({ type, listener, options });
      return originalDocumentAddEventListener(type, listener, options);
    });
    windowAddEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      windowListeners.push({ type, listener, options });
      return originalWindowAddEventListener(type, listener, options);
    });
  });

  afterEach(() => {
    for (const { type, listener, options } of documentListeners) {
      document.removeEventListener(type, listener, options);
    }
    for (const { type, listener, options } of windowListeners) {
      window.removeEventListener(type, listener, options);
    }
    documentAddEventListenerSpy?.mockRestore();
    windowAddEventListenerSpy?.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
    HTMLMediaElement.prototype.load = originalLoad;
    delete window.clipSandboxDesktop;
    document.body.innerHTML = '';
  });

  test('right-clicking a selected clip opens the app context menu', async () => {
    const { initApp } = await import('../../../src/app/app-controller.js');
    initApp();
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

    const { initApp } = await import('../../../src/app/app-controller.js');
    initApp();
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

    const { initApp } = await import('../../../src/app/app-controller.js');
    initApp();
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

    const { initApp } = await import('../../../src/app/app-controller.js');
    initApp();
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
      expect(document.querySelector('#activityIndicatorList li').textContent).toBe('Loopify failed while generating the output clip.');
    });
  });

  test('ignores duplicate Loopify requests while one edit is already running', async () => {
    let resolveEdit;
    window.clipSandboxDesktop.createVideoEdit = vi.fn(() => new Promise((resolve) => {
      resolveEdit = resolve;
    }));

    const { initApp } = await import('../../../src/app/app-controller.js');
    initApp();
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
});

