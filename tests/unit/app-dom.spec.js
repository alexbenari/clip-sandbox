import { describe, it, beforeEach, expect } from 'vitest';

const baseDom = `
  <header class="toolbar" id="toolbar">
    <button id="pickBtn"></button>
    <input type="file" id="folderInput" webkitdirectory directory multiple />
    <input type="file" id="orderFileInput" />
    <div id="orderMenu" data-open="false">
      <button id="orderMenuBtn" aria-expanded="false">Collection</button>
      <div id="orderMenuPanel" role="menu">
        <button id="loadOrderBtn">Load</button>
        <button id="saveBtn" disabled>Save</button>
        <button id="saveAsNewBtn" disabled>Save as New</button>
      </div>
    </div>
    <button id="toggleTitlesBtn"></button>
    <button id="fsBtn"></button>
    <span id="activeCollectionName"></span>
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
  <div id="gridWrap">
    <div id="grid" style="gap:10px"></div>
  </div>
  <div class="footerbar" id="status" hidden></div>
`;

beforeEach(() => {
  document.body.innerHTML = baseDom;
  document.title = '';
});

describe('initApp DOM wiring', () => {
  it('initializes count text, titles button, and active collection label', async () => {
    const { initApp } = await import('../../app.js');
    initApp();
    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide Titles');
    expect(document.getElementById('activeCollectionName').textContent).toBe('Local Video Grid Reviewer');
    expect(document.title).toBe('Local Video Grid Reviewer');
  });
});
