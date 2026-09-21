// @ts-nocheck
import { describe, it, beforeEach, expect } from 'vitest';

const baseDom = `
  <div id="appShell">
    <header id="globalAppBar">
      <select id="appScreenSelector" aria-label="App screen" hidden>
        <option value="collection" selected>Collection</option>
      </select>
      <div id="activityIndicatorRoot">
        <button id="activityIndicatorBtn" aria-expanded="false" aria-controls="activityIndicatorPanel"></button>
        <section id="activityIndicatorPanel" hidden>
          <ul id="activityIndicatorList"></ul>
        </section>
      </div>
    </header>
    <div id="workspaceRow">
      <div id="screenCommandHost">
        <header class="toolbar" id="toolbar">
    <button id="pickBtn"></button>
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Actions</button>
      <div id="orderMenuPanel" role="menu">
        <button id="saveBtn" disabled>Save</button>
        <button id="saveAsNewBtn" disabled>Save as Collection</button>
      </div>
    </div>
    <button id="toggleTitlesBtn"></button>
    <button id="fsBtn"></button>
    <select id="activeCollectionName" disabled>
      <option value="">Clip Sandbox</option>
    </select>
          <div class="toolbar-status">
            <span class="count" id="count"></span>
          </div>
        </header>
      </div>
      <div id="mainScreenHost">
        <section id="collectionScreen">
          <section id="collectionConflict" hidden>
            <p id="collectionConflictSummary"></p>
            <pre id="collectionConflictList"></pre>
            <button id="applyCollectionConflictBtn"></button>
            <button id="cancelCollectionConflictBtn"></button>
          </section>
          <section id="saveAsNewDialog" hidden>
            <input id="saveAsNewNameInput" />
            <div id="saveAsNewError"></div>
            <button id="confirmSaveAsNewBtn"></button>
            <button id="cancelSaveAsNewBtn"></button>
          </section>
          <dialog id="unsavedChangesDialog">
            <p id="unsavedChangesText"></p>
            <button id="confirmUnsavedChangesBtn"></button>
            <button id="discardUnsavedChangesBtn"></button>
            <button id="cancelUnsavedChangesBtn"></button>
          </dialog>
          <div id="gridWrap">
            <div id="grid" style="gap:10px"></div>
          </div>
        </section>
      </div>
    </div>
    <div id="clipContextMenu" hidden><div id="clipContextMenuPanel"></div></div>
    <div id="zoomLayerRoot"></div>
  </div>
`;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  document.body.innerHTML = baseDom;
  document.title = '';
  window.clipSandboxDesktop = { loadAppSettings: async () => ({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false } }) };
});

describe('AppController DOM wiring', () => {
  it('initializes count text, titles button, and active source label', async () => {
    const { AppController } = await import('../../src/app/app-controller.js');
    new AppController().init();
    const collectionSelect = document.getElementById('activeCollectionName');
    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide Titles');
    expect(collectionSelect.tagName).toBe('SELECT');
    expect(collectionSelect.disabled).toBe(true);
    expect(collectionSelect.options[0].textContent).toBe('No pipeline loaded');
    expect(document.title).toBe('Clip Sandbox');
    expect(document.getElementById('zoomLayerRoot')).not.toBeNull();
    expect(document.getElementById('collectionScreen')).not.toBeNull();
    expect(document.getElementById('appScreenSelector').value).toBe('collection');
    expect(document.getElementById('appScreenSelector').hidden).toBe(false);
    expect([...document.querySelectorAll('#appScreenSelector option')].map(option => option.textContent)).toEqual([
      'Collection', 'GIF Extraction', 'Settings',
    ]);
    expect(document.getElementById('toolbar').parentElement.id).toBe('screenCommandHost');
    expect(document.getElementById('activityIndicatorRoot').parentElement.id).toBe('globalAppBar');
    expect(document.getElementById('refineGifScreen').hidden).toBe(true);
    const screenSelector = document.getElementById('appScreenSelector');
    screenSelector.value = 'gif-extraction';
    screenSelector.dispatchEvent(new Event('change'));
    expect(document.getElementById('gifExtractionScreen').hidden).toBe(false);
    expect(document.querySelector('#screenCommandHost [data-command="open-movie"]')).not.toBeNull();
    expect(document.querySelectorAll('.frame-review-player input[type="range"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-contextual="true"]')).toHaveLength(0);
  });
});

