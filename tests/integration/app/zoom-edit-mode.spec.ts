// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesktopAppTestEnvironment, desktopFile, waitFor } from './app-controller-harness.js';
import { installGifDesktopApiFakes } from './desktop-api-fakes.js';
import { ZoomEditComposition } from '../../../src/domain/zoom-edit-composition.js';

// The edit session is replaced so these tests drive entering, keys and leaving through the shipped page,
// with a staged edit set by the test rather than by exact frames from the native player.
const { FakeEditSession, domain } = vi.hoisted(() => {
  // The hoisted fake runs before imports; the real composition of staged edits is filled in below them.
  const domain = { ZoomEditComposition: null };
  const unchanged = Object.freeze({ start: 0, end: 47, lastClipFrame: 47, isChanged: false, changedEnds: () => [] });
  class FakeEditSession {
    static instances = [];
    handlers = new Set();
    snapshot = { picture: 'ready', extension: 'none', extensionPending: false, range: unchanged, loopify: false, preview: { kind: 'hidden' } };
    commands = [];
    disposed = false;

    constructor(request) {
      this.request = request;
      this.snapshot = { ...this.snapshot, loopify: request.entry === 'loopify' };
      FakeEditSession.instances.push(this);
    }

    stagedEdits() {
      return domain.ZoomEditComposition.of([...(this.snapshot.range.isChanged ? ['refine'] : []), ...(this.snapshot.loopify ? ['loopify'] : [])]);
    }

    stagedChanges() {
      return [...this.snapshot.range.changedEnds().map(change => change.endpoint), ...(this.snapshot.loopify ? ['loopify'] : [])];
    }

    toggleLoopify() {
      this.snapshot = { ...this.snapshot, loopify: !this.snapshot.loopify };
      for (const handler of [...this.handlers]) handler(this.snapshot);
      return this.record('toggleLoopify');
    }

    on(name, handler) {
      if (name !== 'changed') return () => undefined;
      this.handlers.add(handler);
      return () => this.handlers.delete(handler);
    }

    stageStart(frame) {
      const changedEnds = () => [{ endpoint: 'start', frameIndex: frame }];
      this.snapshot = { ...this.snapshot, range: Object.freeze({ ...unchanged, start: frame, isChanged: true, changedEnds }) };
      for (const handler of [...this.handlers]) handler(this.snapshot);
    }

    stagedSelection() {
      const { start, end } = this.snapshot.range;
      return { source: { kind: 'clip' }, sessionId: 'session_clip_0001', startFrame: start, endFrame: end };
    }
    saveRefusal() { return null; }
    async dispose() { this.disposed = true; }
    record(name) { this.commands.push(name); return Promise.resolve({ kind: 'done' }); }
    togglePlayback() { return this.record('togglePlayback'); }
    pressStep() { return this.record('pressStep'); }
    releaseStep() { this.commands.push('releaseStep'); }
    async pause() { this.commands.push('pause'); }
    jump() { return this.record('jump'); }
    markStart() { return this.record('markStart'); }
    markEnd() { return this.record('markEnd'); }
    jumpToStart() { return this.record('jumpToStart'); }
    jumpToEnd() { return this.record('jumpToEnd'); }
    toggleLoop() { return this.record('toggleLoop'); }
  }
  return { FakeEditSession, domain };
});
domain.ZoomEditComposition = ZoomEditComposition;

vi.mock('../../../src/app/zoom-edit-mode-session.js', () => ({
  ZoomEditModeSession: { begin: (_deps, request) => new FakeEditSession(request) },
}));

function installZoomEditDesktopApi(desktop) {
  desktop.zoomEdit = {
    openClip: vi.fn(),
    openWindow: vi.fn(),
    anchorWindow: vi.fn(),
    subscribeSaveProgress: vi.fn(() => () => undefined),
    save: vi.fn(),
    cancelSave: vi.fn(async () => ({ ok: true })),
    subscribePreviewProgress: vi.fn(() => () => undefined),
    preview: vi.fn(),
    releasePreview: vi.fn(async () => ({ ok: true })),
  };
}

const press = key => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const screenSelector = () => document.querySelector('#appScreenSelector');
const discardDialog = () => document.getElementById('discardZoomEditDialog');
const discardButton = name => [...discardDialog().querySelectorAll('button')].find(button => button.textContent === name);
const session = () => FakeEditSession.instances.at(-1);

function activateScreen(id) {
  screenSelector().value = id;
  screenSelector().dispatchEvent(new Event('change'));
}

async function startWithFolder() {
  const { AppController } = await import('../../../src/app/app-controller.js');
  new AppController().init();
  activateScreen('collection');
  document.getElementById('pickBtn').click();
  await waitFor(() => expect(document.querySelectorAll('#grid .thumb')).toHaveLength(2));
}

async function refineFromZoom(name) {
  document.querySelector(`#grid .thumb[data-name="${name}"]`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await waitFor(() => expect(document.getElementById('zoomVideo')).not.toBeNull());
  press('r');
  await waitFor(() => expect(document.getElementById('zoomEditSurface')).not.toBeNull());
}

async function editingWithStagedStart() {
  await startWithFolder();
  await refineFromZoom('bravo.mp4');
  session().stageStart(6);
}

describe('Zoom edit mode in the Collection view', () => {
  const environment = new DesktopAppTestEnvironment();

  beforeEach(() => {
    environment.setUp();
    FakeEditSession.instances = [];
    installGifDesktopApiFakes(window.clipSandboxDesktop);
    installZoomEditDesktopApi(window.clipSandboxDesktop);
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => ({
      canceled: false,
      folderPath: 'C:/clips',
      folderName: 'clips',
      files: [desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' })],
    }));
  });
  afterEach(() => environment.tearDown());

  test('R in Zoom opens the zoomed clip in Zoom edit mode with the player and the hint line', async () => {
    await startWithFolder();

    await refineFromZoom('bravo.mp4');

    expect(session().request).toMatchObject({ filename: 'bravo.mp4', folder: { folderPath: 'C:/clips' }, hasSourceInfo: false, muted: true });
    expect(document.querySelector('#zoomEditSurface .frame-review-player')).not.toBeNull();
    expect(document.querySelector('#zoomEditHint .zoom-edit-hint-keys').textContent).toBe('Q start · W end · A/S jump · Z loop · L loopify · X save · Esc leave');
    expect(document.getElementById('zoomVideo')).toBeNull();
  });

  test('Refine in Zoom’s edit menu enters the mode on the zoomed clip', async () => {
    await startWithFolder();
    document.querySelector('#grid .thumb[data-name="alpha.mp4"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => expect(document.getElementById('zoomVideo')).not.toBeNull());

    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 70, clientY: 80 }));
    await waitFor(() => expect(document.querySelector('[data-item-id="zoom-edit-refine"]')).not.toBeNull());
    document.querySelector('[data-item-id="zoom-edit-refine"]').click();

    await waitFor(() => expect(document.getElementById('zoomEditSurface')).not.toBeNull());
    expect(session().request.filename).toBe('alpha.mp4');
  });

  async function loopifyFromZoomMenu(name) {
    document.querySelector(`#grid .thumb[data-name="${name}"]`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => expect(document.getElementById('zoomVideo')).not.toBeNull());
    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 70, clientY: 80 }));
    await waitFor(() => expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull());
    document.querySelector('[data-item-id="zoom-edit-loopify"]').click();
    await waitFor(() => expect(document.getElementById('zoomEditSurface')).not.toBeNull());
  }

  test('Loopify in Zoom’s edit menu enters the mode with Loopify staged, saying the clip is saved without sound', async () => {
    await startWithFolder();

    await loopifyFromZoomMenu('alpha.mp4');

    expect(session().request).toMatchObject({ filename: 'alpha.mp4', entry: 'loopify' });
    expect(document.querySelector('#zoomEditHint [role="status"]').textContent).toBe('Loopify staged · saved without sound');
  });

  test('L stages Loopify in the mode', async () => {
    await startWithFolder();
    await refineFromZoom('alpha.mp4');

    press('l');

    await waitFor(() => expect(session().commands).toEqual(['toggleLoopify']));
    expect(document.querySelector('#zoomEditHint [role="status"]').textContent).toBe('Loopify staged · saved without sound');
  });

  test('Escape with only Loopify staged asks first, naming Loopify', async () => {
    await startWithFolder();
    await loopifyFromZoomMenu('alpha.mp4');

    press('Escape');

    await waitFor(() => expect(discardDialog().open).toBe(true));
    expect(discardDialog().querySelector('h2').textContent).toBe('Discard Loopify?');
  });

  test('keys act in the mode instead of browsing Zoom', async () => {
    await startWithFolder();
    await refineFromZoom('alpha.mp4');

    press('ArrowRight');
    press('q');

    await waitFor(() => expect(session().commands).toEqual(['pressStep', 'markStart']));
    expect(document.getElementById('zoomEditSurface')).not.toBeNull();
  });

  test('releasing a held arrow key tells the session to stop stepping', async () => {
    await startWithFolder();
    await refineFromZoom('alpha.mp4');
    press('ArrowLeft');

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));

    await waitFor(() => expect(session().commands).toEqual(['pressStep', 'releaseStep']));
  });

  test('Escape without staged edits returns to Zoom on the same clip, and a second Escape closes Zoom', async () => {
    await startWithFolder();
    await refineFromZoom('bravo.mp4');

    press('Escape');
    await waitFor(() => expect(document.getElementById('zoomVideo')?.dataset.name).toBe('bravo.mp4'));
    expect(document.getElementById('zoomEditSurface')).toBeNull();
    press('Escape');

    await waitFor(() => expect(document.getElementById('zoomOverlay')).toBeNull());
  });

  test('Escape with a staged edit asks first, and Keep editing keeps the staged edit in the mode', async () => {
    await editingWithStagedStart();

    press('Escape');
    await waitFor(() => expect(discardDialog().open).toBe(true));
    expect(discardDialog().querySelector('h2').textContent).toBe('Discard the new start?');
    discardButton('Keep editing').click();

    expect(discardDialog().open).toBe(false);
    expect(document.getElementById('zoomEditSurface')).not.toBeNull();
    expect(session().snapshot.range.start).toBe(6);
    expect(session().disposed).toBe(false);
  });

  test('Discard leaves the mode and Zoom shows the clip again', async () => {
    await editingWithStagedStart();
    press('Escape');
    await waitFor(() => expect(discardDialog().open).toBe(true));

    discardButton('Discard').click();

    await waitFor(() => expect(document.getElementById('zoomVideo')?.dataset.name).toBe('bravo.mp4'));
    expect(session().disposed).toBe(true);
  });

  test('a backdrop click with a staged edit asks before closing Zoom', async () => {
    await editingWithStagedStart();

    document.getElementById('zoomOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => expect(discardDialog().open).toBe(true));
    expect(document.getElementById('zoomOverlay')).not.toBeNull();
    discardButton('Discard').click();
    await waitFor(() => expect(document.getElementById('zoomOverlay')).toBeNull());
  });

  test('a screen change with a staged edit is held until Discard, then completed', async () => {
    await editingWithStagedStart();

    activateScreen('settings');
    await waitFor(() => expect(discardDialog().open).toBe(true));
    expect(screenSelector().value).toBe('collection');
    discardButton('Discard').click();

    await waitFor(() => expect(screenSelector().value).toBe('settings'));
    expect(document.getElementById('zoomOverlay')).toBeNull();
  });

  test('a screen change without a staged edit leaves the mode before the other screen shows', async () => {
    await startWithFolder();
    await refineFromZoom('bravo.mp4');

    activateScreen('gif-extraction');

    await waitFor(() => expect(screenSelector().value).toBe('gif-extraction'));
    expect(discardDialog().open).toBe(false);
    expect(session().disposed).toBe(true);
    expect(document.querySelector('.gif-workflow-player-host .frame-review-player')).not.toBeNull();
  });

  test('a screen change with a staged edit stays on Collection when the user keeps editing', async () => {
    await editingWithStagedStart();

    activateScreen('settings');
    await waitFor(() => expect(discardDialog().open).toBe(true));
    discardButton('Keep editing').click();

    expect(screenSelector().value).toBe('collection');
    expect(document.getElementById('zoomEditSurface')).not.toBeNull();
  });
});

describe('Saving in Zoom edit mode', () => {
  const environment = new DesktopAppTestEnvironment();
  const savedAt = 1_700_000_000_000;
  const clipNames = () => [...document.querySelectorAll('#grid .thumb')].map(card => card.dataset.name);
  const card = name => document.querySelector(`#grid .thumb[data-name="${name}"]`);
  const isShown = id => !document.getElementById(id).hidden;
  const savedEntry = name => ({
    name, path: `C:/clips/${name}`, mediaSource: `file:///C:/clips/${name}?modified=${savedAt}`, type: 'video/mp4', size: 2048, lastModifiedMs: savedAt,
  });

  beforeEach(() => {
    environment.setUp();
    FakeEditSession.instances = [];
    installGifDesktopApiFakes(window.clipSandboxDesktop);
    installZoomEditDesktopApi(window.clipSandboxDesktop);
  });
  afterEach(() => environment.tearDown());

  function folderWith(files) {
    const folder = { canceled: false, folderPath: 'C:/clips', folderName: 'clips', files };
    window.clipSandboxDesktop.pickFolder = vi.fn(async () => folder);
    window.clipSandboxDesktop.refreshFolder = vi.fn(async () => folder);
  }

  function saveAnswers(result) {
    window.clipSandboxDesktop.zoomEdit.save.mockImplementation(async ({ operationId }) => ({ ok: true, operationId, result }));
  }

  async function openFolder(expectedNames, { collection = null } = {}) {
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    activateScreen('collection');
    document.getElementById('pickBtn').click();
    await waitFor(() => expect(clipNames()).toEqual(expectedNames));
    if (!collection) return;
    document.getElementById('activeCollectionName').value = collection;
    document.getElementById('activeCollectionName').dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => expect(document.getElementById('activeCollectionName').value).toBe(collection));
  }

  async function refineAndSave(name, choice) {
    await refineFromZoom(name);
    session().stageStart(6);
    press('x');
    await waitFor(() => expect(document.getElementById('saveEditsDialog').open).toBe(true));
    document.getElementById(choice === 'Keep both' ? 'keepBothEditedClipBtn' : 'replaceEditedClipBtn').click();
  }

  test('Keep both in a saved collection’s view adds the refined clip right after its original and marks the view unsaved', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' }), desktopFile({ name: 'charlie.mp4' }),
      desktopFile({ name: 'picks.txt', text: 'charlie.mp4\nbravo.mp4\nalpha.mp4\n' })]);
    saveAnswers({ outcome: 'kept-both', filename: 'bravo-refined.mp4', entry: savedEntry('bravo-refined.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4', 'charlie.mp4'], { collection: 'picks.txt' });
    await waitFor(() => expect(clipNames()).toEqual(['charlie.mp4', 'bravo.mp4', 'alpha.mp4']));

    await refineAndSave('bravo.mp4', 'Keep both');

    await waitFor(() => expect(clipNames()).toEqual(['charlie.mp4', 'bravo.mp4', 'bravo-refined.mp4', 'alpha.mp4']));
    expect(isShown('unsavedChangesMarker')).toBe(true);
    expect(document.getElementById('zoomVideo').dataset.name).toBe('bravo-refined.mp4');
    expect(window.clipSandboxDesktop.saveTextFile).not.toHaveBeenCalled();
  });

  test('Loopify saved with Keep both in a saved collection’s view loops the whole clip, after asking with its loss, next to its original', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' }), desktopFile({ name: 'picks.txt', text: 'bravo.mp4\nalpha.mp4\n' })]);
    saveAnswers({ outcome: 'kept-both', filename: 'bravo-looped.mp4', entry: savedEntry('bravo-looped.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4'], { collection: 'picks.txt' });
    await waitFor(() => expect(clipNames()).toEqual(['bravo.mp4', 'alpha.mp4']));
    card('bravo.mp4').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => expect(document.getElementById('zoomVideo')).not.toBeNull());
    document.getElementById('zoomVideo').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 70, clientY: 80 }));
    await waitFor(() => expect(document.querySelector('[data-item-id="zoom-edit-loopify"]')).not.toBeNull());
    document.querySelector('[data-item-id="zoom-edit-loopify"]').click();
    await waitFor(() => expect(document.getElementById('zoomEditSurface')).not.toBeNull());

    press('x');
    await waitFor(() => expect(document.getElementById('saveEditsDialog').open).toBe(true));
    const explanation = document.getElementById('saveEditsExplanation').textContent;
    document.getElementById('keepBothEditedClipBtn').click();

    await waitFor(() => expect(clipNames()).toEqual(['bravo.mp4', 'bravo-looped.mp4', 'alpha.mp4']));
    expect(explanation).toContain('The looped clip is saved without sound.');
    expect(window.clipSandboxDesktop.zoomEdit.save.mock.calls[0][0]).toMatchObject({ filename: 'bravo.mp4', startFrame: 0, endFrame: 47, edits: ['loopify'] });
    expect(isShown('unsavedChangesMarker')).toBe(true);
    expect(window.clipSandboxDesktop.saveTextFile).not.toHaveBeenCalled();
  });

  test('Keep both in the folder’s full list adds the refined clip where its name sorts, leaving the list saved', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' }), desktopFile({ name: 'charlie.mp4' })]);
    saveAnswers({ outcome: 'kept-both', filename: 'bravo-refined.mp4', entry: savedEntry('bravo-refined.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4', 'charlie.mp4']);

    await refineAndSave('bravo.mp4', 'Keep both');

    await waitFor(() => expect(clipNames()).toEqual(['alpha.mp4', 'bravo-refined.mp4', 'bravo.mp4', 'charlie.mp4']));
    expect(isShown('unsavedChangesMarker')).toBe(false);
  });

  test('Replace shows the new file under the same name in the grid and in Zoom', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' })]);
    saveAnswers({ outcome: 'replaced', filename: 'bravo.mp4', entry: savedEntry('bravo.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4']);

    await refineAndSave('bravo.mp4', 'Replace');

    const newAddress = `file:///C:/clips/bravo.mp4?modified=${savedAt}`;
    await waitFor(() => expect(card('bravo.mp4').dataset.mediaSource).toBe(newAddress));
    expect(clipNames()).toEqual(['alpha.mp4', 'bravo.mp4']);
    expect(document.getElementById('zoomVideo').getAttribute('src')).toBe(newAddress);
  });

  test('Replace rebuilds a view kept from earlier, so it shows the new file too', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' }), desktopFile({ name: 'picks.txt', text: 'bravo.mp4\n' })]);
    saveAnswers({ outcome: 'replaced', filename: 'bravo.mp4', entry: savedEntry('bravo.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4'], { collection: 'picks.txt' });
    await waitFor(() => expect(clipNames()).toEqual(['bravo.mp4']));
    await refineAndSave('bravo.mp4', 'Replace');
    await waitFor(() => expect(card('bravo.mp4').dataset.mediaSource).toBe(`file:///C:/clips/bravo.mp4?modified=${savedAt}`));
    document.getElementById('zoomOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.clipSandboxDesktop.refreshFolder = vi.fn(async () => ({
      canceled: false, folderPath: 'C:/clips', folderName: 'clips',
      files: [desktopFile({ name: 'alpha.mp4' }), savedEntry('bravo.mp4'), desktopFile({ name: 'picks.txt', text: 'bravo.mp4\n' })],
    }));

    document.getElementById('activeCollectionName').value = '__pipeline__';
    document.getElementById('activeCollectionName').dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(clipNames()).toEqual(['alpha.mp4', 'bravo.mp4']));
    expect(card('bravo.mp4').querySelector('video').getAttribute('src')).toBe(`file:///C:/clips/bravo.mp4?modified=${savedAt}`);
  });

  test('Replace reads the source movie of the new file again', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.mp4' })]);
    const movies = { 'bravo.mp4': 'Sample Feature.mkv' };
    window.clipSandboxDesktop.clipSourceMovies = {
      read: vi.fn(async ({ filenames }) => ({
        clips: filenames.map(filename => (movies[filename] ? { filename, kind: 'movie', movieFileName: movies[filename] } : { filename, kind: 'none' })),
      })),
    };
    saveAnswers({ outcome: 'replaced', filename: 'bravo.mp4', entry: savedEntry('bravo.mp4') });
    await openFolder(['alpha.mp4', 'bravo.mp4']);
    await waitFor(() => expect(card('bravo.mp4').querySelector('.source-glyph')?.title).toBe('From Sample Feature'));
    movies['bravo.mp4'] = 'Other Feature.mkv';

    await refineAndSave('bravo.mp4', 'Replace');

    await waitFor(() => expect(card('bravo.mp4').querySelector('.source-glyph')?.title).toBe('From Other Feature'));
  });

  test('Replacing a .webm clip renames it in the view and in every collection that listed it', async () => {
    folderWith([desktopFile({ name: 'alpha.mp4' }), desktopFile({ name: 'bravo.webm', type: 'video/webm' }),
      desktopFile({ name: 'picks.txt', text: 'bravo.webm\nalpha.mp4\n' }), desktopFile({ name: 'others.txt', text: 'alpha.mp4\n' })]);
    saveAnswers({ outcome: 'replaced', filename: 'bravo.mp4', replacedFilename: 'bravo.webm', entry: savedEntry('bravo.mp4') });
    await openFolder(['alpha.mp4', 'bravo.webm']);

    await refineAndSave('bravo.webm', 'Replace');

    await waitFor(() => expect(clipNames()).toEqual(['alpha.mp4', 'bravo.mp4']));
    await waitFor(() => expect(window.clipSandboxDesktop.saveTextFile.mock.calls).toEqual([
      [{ folderPath: 'C:/clips', filename: 'picks.txt', text: 'bravo.mp4\nalpha.mp4\n' }],
    ]));
    expect(isShown('unsavedChangesMarker')).toBe(false);
  });
});
