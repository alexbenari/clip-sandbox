import { describe, it, beforeEach, expect } from 'vitest';

const baseDom = `
  <header class="toolbar" id="toolbar">
    <button id="pickBtn"></button>
    <input type="file" id="folderInput" webkitdirectory directory multiple />
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Collection</button>
      <div id="orderMenuPanel" role="menu">
        <button id="saveBtn" disabled>Save</button>
        <button id="saveAsNewBtn" disabled>Save as New</button>
      </div>
    </div>
    <button id="toggleTitlesBtn"></button>
    <button id="fsBtn"></button>
    <select id="activeCollectionName" disabled>
      <option value="">Local Video Grid Reviewer</option>
    </select>
    <div class="spacer"></div>
    <span class="count" id="count"></span>
  </header>
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
  <div class="footerbar" id="status" hidden></div>
  <div id="zoomLayerRoot"></div>
`;

beforeEach(() => {
  document.body.innerHTML = baseDom;
  document.title = '';
});

describe('initApp DOM wiring', () => {
  it('initializes count text, titles button, and active collection label', async () => {
    const { initApp } = await import('../../app.js');
    initApp();
    const collectionSelect = document.getElementById('activeCollectionName');
    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide Titles');
    expect(collectionSelect.tagName).toBe('SELECT');
    expect(collectionSelect.disabled).toBe(true);
    expect(collectionSelect.options[0].textContent).toBe('Local Video Grid Reviewer');
    expect(document.title).toBe('Local Video Grid Reviewer');
    expect(document.getElementById('zoomLayerRoot')).not.toBeNull();
  });
});
