// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesktopAppTestEnvironment, desktopFile, waitFor } from './app-controller-harness.js';
import { installGifDesktopApiFakes } from './desktop-api-fakes.js';

// The edit session is replaced so these tests drive entering, keys and leaving through the shipped page,
// with a staged edit set by the test rather than by exact frames from the native player.
const { FakeEditSession } = vi.hoisted(() => {
  const unchanged = Object.freeze({ start: 0, end: 47, lastClipFrame: 47, isChanged: false });
  class FakeEditSession {
    static instances = [];
    handlers = new Set();
    snapshot = { picture: 'ready', extension: 'none', range: unchanged };
    commands = [];
    disposed = false;

    constructor(request) {
      this.request = request;
      FakeEditSession.instances.push(this);
    }

    on(name, handler) {
      if (name !== 'changed') return () => undefined;
      this.handlers.add(handler);
      return () => this.handlers.delete(handler);
    }

    stageStart(frame) {
      this.snapshot = { ...this.snapshot, range: Object.freeze({ ...unchanged, start: frame, isChanged: true }) };
      for (const handler of [...this.handlers]) handler(this.snapshot);
    }

    stagedSelection() { return null; }
    async dispose() { this.disposed = true; }
    record(name) { this.commands.push(name); return Promise.resolve({ kind: 'done' }); }
    togglePlayback() { return this.record('togglePlayback'); }
    step() { return this.record('step'); }
    jump() { return this.record('jump'); }
    markStart() { return this.record('markStart'); }
    markEnd() { return this.record('markEnd'); }
    jumpToStart() { return this.record('jumpToStart'); }
    jumpToEnd() { return this.record('jumpToEnd'); }
    toggleLoop() { return this.record('toggleLoop'); }
  }
  return { FakeEditSession };
});

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

async function refineFromClipMenu(name) {
  document.querySelector(`#grid .thumb[data-name="${name}"]`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }));
  await waitFor(() => expect(document.querySelector('#clipContextMenu [data-item-id="refine-clip"]')).not.toBeNull());
  document.querySelector('#clipContextMenu [data-item-id="refine-clip"]').click();
  await waitFor(() => expect(document.getElementById('zoomEditSurface')).not.toBeNull());
}

async function editingWithStagedStart() {
  await startWithFolder();
  await refineFromClipMenu('bravo.mp4');
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

  test('Refine in the clip menu opens that clip in Zoom edit mode with the player and the hint line', async () => {
    await startWithFolder();

    await refineFromClipMenu('bravo.mp4');

    expect(session().request).toMatchObject({ filename: 'bravo.mp4', folder: { folderPath: 'C:/clips' }, hasSourceInfo: false, muted: true });
    expect(document.querySelector('#zoomEditSurface .frame-review-player')).not.toBeNull();
    expect(document.querySelector('#zoomEditHint .zoom-edit-hint-keys').textContent).toBe('Q start · W end · A/S jump · Z loop · X save · Esc leave');
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

  test('keys act in the mode instead of browsing Zoom', async () => {
    await startWithFolder();
    await refineFromClipMenu('alpha.mp4');

    press('ArrowRight');
    press('q');

    await waitFor(() => expect(session().commands).toEqual(['step', 'markStart']));
    expect(document.getElementById('zoomEditSurface')).not.toBeNull();
  });

  test('Escape without staged edits returns to Zoom on the same clip, and a second Escape closes Zoom', async () => {
    await startWithFolder();
    await refineFromClipMenu('bravo.mp4');

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
    await refineFromClipMenu('bravo.mp4');

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
