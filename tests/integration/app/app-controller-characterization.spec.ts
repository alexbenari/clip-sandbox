// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesktopAppTestEnvironment, desktopFile, waitFor } from './app-controller-harness.js';
import { collectionRefineApi, installGifDesktopApiFakes, installPipelineCatalogFakes } from './desktop-api-fakes.js';

// Records what AppController does today for flows the other app-level tests do not reach.
// Both GIF sessions are replaced so these tests can observe AppController's wiring around them.
const { FakeGifSession } = vi.hoisted(() => {
  const emptySnapshot = Object.freeze({
    lifecycle: 'empty', source: null, reviewState: null, capture: null,
    draftThumbnail: Object.freeze({ kind: 'empty' }), ranges: Object.freeze([]), selectedRangeId: null,
    refinement: null, extractionAvailable: false, extractionBatch: null, captureAvailable: false,
    capturesLoading: false, message: null, previewTarget: null, previewRevision: 0,
  });
  class FakeGifSession {
    static instances = [];
    constructor(kind, options = {}) {
      this.kind = kind;
      this.options = options;
      this.destinations = [];
      this.openCollectionSource = vi.fn(async () => undefined);
      this.importCollectionRange = vi.fn(async () => ({ kind: 'started' }));
      FakeGifSession.instances.push(this);
    }
    get snapshot() { return emptySnapshot; }
    get reviewSession() { return null; }
    get refinementDraft() { return null; }
    subscribe(listener) { listener(emptySnapshot); return () => undefined; }
    setExtractionDestination(destination) { this.destinations.push(destination); }
    abandonRefinement() { return null; }
    async beginRefinement() { return { kind: 'rejected', message: 'Not used by these tests.' }; }
    canExtractRange() { return false; }
    canRemoveRange() { return false; }
    canRemoveDraft() { return false; }
    async dispose() {}
  }
  return { FakeGifSession };
});
vi.mock('../../../src/app/gif-extraction-session.js', () => ({
  GifExtractionSession: class extends FakeGifSession { constructor(frameReview, thumbnails, options) { super('gif-extraction', options); } },
}));
vi.mock('../../../src/app/collection-clip-refinement-session.js', () => ({
  CollectionClipRefinementSession: class extends FakeGifSession { constructor(frameReview, thumbnails, options) { super('collection-refinement', options); } },
}));
class FakeFolder {
  constructor(folderPath, entries) {
    this.folderPath = folderPath;
    this.entries = new Map(Object.entries(entries));
  }

  write(name, text = null) {
    this.entries.set(name, text);
  }

  textOf(name) {
    return this.entries.get(name) ?? '';
  }

  listing() {
    return {
      canceled: false,
      folderPath: this.folderPath,
      folderName: this.folderPath.split('/').pop(),
      files: Array.from(this.entries, ([name, text]) => desktopFile({
        name, path: `${this.folderPath}/${name}`, mediaSource: `file:///${this.folderPath}/${name}`, text: text ?? undefined,
      })),
    };
  }
}

function gridClipNames() {
  return Array.from(document.querySelectorAll('#grid .thumb')).map(card => card.dataset.name);
}

function selectView(value) {
  const selector = document.getElementById('activeCollectionName');
  selector.value = value;
  selector.dispatchEvent(new Event('change', { bubbles: true }));
}

async function showSavedCollection(filename) {
  selectView(filename);
  await waitFor(() => expect(document.title).toBe(filename.replace(/\.txt$/, '')));
}

function activateScreen(id) {
  const selector = document.querySelector('#appScreenSelector');
  selector.value = id;
  selector.dispatchEvent(new Event('change'));
}

function activityText() {
  return document.getElementById('activityIndicatorList').textContent;
}

function saveViewAsCollection(name) {
  document.getElementById('saveAsNewBtn').click();
  document.getElementById('saveAsNewNameInput').value = name;
  document.getElementById('saveAsNewNameInput').dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('confirmSaveAsNewBtn').click();
}

function removeFirstClipFromView() {
  document.querySelector('#grid .thumb').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
}

function openContextMenuOnFirstClip() {
  const card = document.querySelector('#grid .thumb');
  card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 60 }));
}

function contextMenuItem(label) {
  return Array.from(document.querySelectorAll('#clipContextMenu [role="menuitem"]')).find(item => item.textContent === label);
}

describe('AppController characterization', () => {
  const environment = new DesktopAppTestEnvironment();
  let folder;

  beforeEach(() => {
    environment.setUp();
    folder = new FakeFolder('C:/clips', { 'alpha.mp4': null, 'bravo.mp4': null });
    const desktop = window.clipSandboxDesktop;
    desktop.pickFolder = vi.fn(async () => folder.listing());
    desktop.refreshFolder = vi.fn(async () => folder.listing());
    desktop.saveTextFile = vi.fn(async ({ filename, text }) => {
      folder.write(filename, text);
      return { mode: 'saved' };
    });
    environment.serveFileText(name => folder.textOf(name));
  });

  afterEach(() => environment.tearDown());

  async function startCollectionScreen() {
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    activateScreen('collection');
  }

  async function openFolder(expectedClips) {
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(gridClipNames()).toEqual(expectedClips));
  }

  async function gifSessions() {

    return {
      extraction: FakeGifSession.instances.findLast(session => session.kind === 'gif-extraction'),
      collectionRefinement: FakeGifSession.instances.findLast(session => session.kind === 'collection-refinement'),
    };
  }

  describe('a collection listing a clip that is missing from the folder', () => {
    beforeEach(() => {
      folder.write('subset.txt', 'alpha.mp4\nmissing.mp4\n');
    });

    test('Apply shows the clips that exist and reports the skipped entry', async () => {
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);

      selectView('subset.txt');
      await waitFor(() => expect(document.getElementById('collectionConflict').hidden).toBe(false));
      expect(document.getElementById('collectionConflictList').textContent).toContain('missing.mp4');
      document.getElementById('applyCollectionConflictBtn').click();

      await waitFor(() => {
        expect(gridClipNames()).toEqual(['alpha.mp4']);
        expect(document.getElementById('activeCollectionName').value).toBe('subset.txt');
        expect(activityText()).toContain('Loaded 1 clip from the collection. Skipped 1 missing entry.');
      });
    });

    test('Cancel keeps the pipeline view', async () => {
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);

      selectView('subset.txt');
      await waitFor(() => expect(document.getElementById('collectionConflict').hidden).toBe(false));
      document.getElementById('cancelCollectionConflictBtn').click();

      await waitFor(() => {
        expect(gridClipNames()).toEqual(['alpha.mp4', 'bravo.mp4']);
        expect(document.getElementById('activeCollectionName').value).toBe('__pipeline__');
      });
    });
  });

  describe('opening a Pipelines catalog entry while the collection view has unsaved changes', () => {
    let archive;

    beforeEach(() => {
      archive = new FakeFolder('C:/pipelines/archive', { 'charlie.mp4': null });
      installPipelineCatalogFakes(window.clipSandboxDesktop, {
        entries: [{ id: 'catalog_archive_0001', name: 'archive' }],
        openEntry: () => archive.listing(),
      });
      document.getElementById('appShell').insertAdjacentHTML('beforeend', '<div id="pipelinesPanelHost"></div>');
    });

    async function requestCatalogLoadFromGifScreen() {
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);
      saveViewAsCollection('subset');
      await waitFor(() => expect(document.getElementById('activeCollectionName').value).toBe('subset.txt'));
      removeFirstClipFromView();
      await waitFor(() => expect(gridClipNames()).toEqual(['bravo.mp4']));
      activateScreen('gif-extraction');
      await waitFor(() => expect(document.querySelector('[aria-label="Load archive"]')).not.toBeNull());
      document.querySelector('[aria-label="Load archive"]').click();
      await waitFor(() => expect(document.getElementById('unsavedChangesDialog').open).toBe(true));
    }

    test('Discard opens the catalog pipeline and shows the Collection screen', async () => {
      await requestCatalogLoadFromGifScreen();

      document.getElementById('discardUnsavedChangesBtn').click();

      await waitFor(() => {
        expect(gridClipNames()).toEqual(['charlie.mp4']);
        expect(document.querySelector('#appScreenSelector').value).toBe('collection');
      });
    });

    test('Cancel keeps the current folder', async () => {
      await requestCatalogLoadFromGifScreen();

      document.getElementById('cancelUnsavedChangesBtn').click();

      await waitFor(() => expect(document.getElementById('unsavedChangesDialog').open).toBe(false));
      expect(window.clipSandboxDesktop.openPipelineCatalogEntry).not.toHaveBeenCalled();
      expect(gridClipNames()).toEqual(['bravo.mp4']);
    });
  });

  describe('an extraction that publishes into the open folder', () => {
    beforeEach(() => {
      installGifDesktopApiFakes(window.clipSandboxDesktop);
      folder = new FakeFolder('C:/clips', {
        'Movie-001.mp4': null, 'Movie-002.mp4': null, 'Movie.txt': 'Movie-001.mp4\nMovie-002.mp4\n',
      });
    });

    function publishMovie003(session) {
      folder.write('Movie-003.mp4');
      folder.write('Movie.txt', 'Movie-001.mp4\nMovie-002.mp4\nMovie-003.mp4\n');
      return session.options.publications.onFolderContentsPublished('C:/clips');
    }

    test('refreshes a clean view and keeps the selected collection', async () => {
      await startCollectionScreen();
      await openFolder(['Movie-001.mp4', 'Movie-002.mp4']);
      await showSavedCollection('Movie.txt');
      const { extraction } = await gifSessions();

      await publishMovie003(extraction);

      await waitFor(() => {
        expect(gridClipNames()).toEqual(['Movie-001.mp4', 'Movie-002.mp4', 'Movie-003.mp4']);
        expect(document.getElementById('activeCollectionName').value).toBe('Movie.txt');
      });
    });

    test('waits until the unsaved view is saved before re-reading the folder', async () => {
      await startCollectionScreen();
      await openFolder(['Movie-001.mp4', 'Movie-002.mp4']);
      await showSavedCollection('Movie.txt');
      removeFirstClipFromView();
      await waitFor(() => expect(gridClipNames()).toEqual(['Movie-002.mp4']));
      const { extraction } = await gifSessions();
      const readsBeforePublication = window.clipSandboxDesktop.refreshFolder.mock.calls.length;

      await publishMovie003(extraction);
      expect(window.clipSandboxDesktop.refreshFolder.mock.calls.length).toBe(readsBeforePublication);
      document.getElementById('saveBtn').click();

      await waitFor(() => {
        expect(window.clipSandboxDesktop.refreshFolder.mock.calls.length).toBe(readsBeforePublication + 1);
        expect(gridClipNames()).toEqual(['Movie-002.mp4']);
        expect(document.getElementById('activeCollectionName').value).toBe('Movie.txt');
      });
    });
  });

  describe('starting to refine a collection clip', () => {
    let resolveSource;

    beforeEach(() => {
      const lookups = [];
      resolveSource = result => lookups.shift()(result);
      installGifDesktopApiFakes(window.clipSandboxDesktop, {
        collectionRefine: collectionRefineApi({ resolve: () => new Promise(resolve => lookups.push(resolve)) }),
      });
    });

    async function chooseRefineOnFirstClip() {
      openContextMenuOnFirstClip();
      await waitFor(() => expect(contextMenuItem('Refine')?.disabled).toBe(false));
      contextMenuItem('Refine').click();
    }

    test('is refused while the view has unsaved changes', async () => {
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);
      saveViewAsCollection('subset');
      await waitFor(() => expect(document.getElementById('activeCollectionName').value).toBe('subset.txt'));
      removeFirstClipFromView();
      await waitFor(() => expect(gridClipNames()).toEqual(['bravo.mp4']));

      await chooseRefineOnFirstClip();

      await waitFor(() => expect(activityText()).toContain('Save or discard the current changes before refining a clip.'));
      expect(window.clipSandboxDesktop.collectionRefine.resolve).not.toHaveBeenCalled();
      expect(document.querySelector('#appScreenSelector').value).toBe('collection');
    });

    test('returns to Collection when the source lookup is cancelled', async () => {
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);
      const { collectionRefinement } = await gifSessions();

      await chooseRefineOnFirstClip();
      await waitFor(() => expect(document.querySelector('#appScreenSelector').value).toBe('collection-refine'));
      resolveSource({ kind: 'cancelled' });

      await waitFor(() => expect(document.querySelector('#appScreenSelector').value).toBe('collection'));
      expect(collectionRefinement.destinations).toEqual([]);
      expect(collectionRefinement.openCollectionSource).not.toHaveBeenCalled();
    });

    test('returns to Collection without opening the movie when the selected collection changes during the source lookup', async () => {
      folder.write('subset.txt', 'alpha.mp4\n');
      await startCollectionScreen();
      await openFolder(['alpha.mp4', 'bravo.mp4']);
      const { collectionRefinement } = await gifSessions();
      const selector = document.getElementById('activeCollectionName');

      await chooseRefineOnFirstClip();
      await waitFor(() => expect(window.clipSandboxDesktop.collectionRefine.resolve).toHaveBeenCalledOnce());
      selector.value = 'subset.txt';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => expect(gridClipNames()).toEqual(['alpha.mp4']));
      resolveSource({
        kind: 'resolved',
        source: { name: 'Movie.mkv', sourceHandle: 'source_0123456789abcdef' },
        range: { start: { frameIndex: 1, frameInfoHash: '0000000000000001' }, end: { frameIndex: 2, frameInfoHash: '0000000000000002' }, endInclusive: true },
      });

      await waitFor(() => expect(document.querySelector('#appScreenSelector').value).toBe('collection'));
      expect(collectionRefinement.openCollectionSource).not.toHaveBeenCalled();
      expect(collectionRefinement.destinations).toEqual([]);
    });
  });
});
