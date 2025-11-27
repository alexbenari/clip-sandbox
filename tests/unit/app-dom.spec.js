// Guard for environments where Vitest worker globals are missing (Windows oddity)
if (!globalThis.__vitest_worker__) {
  globalThis.__vitest_worker__ = { on() {}, send() {}, rpc: {} };
}

// Guard in case Vitest worker globals are missing
if (!globalThis.__vitest_worker__) {
  globalThis.__vitest_worker__ = { on() {}, send() {}, rpc: {} };
}

import { describe, it, beforeEach, expect } from 'vitest';

// Minimal DOM scaffold to allow init without real layout
const baseDom = `
  <header class="toolbar" id="toolbar">
    <button id="pickBtn"></button>
    <input type="file" id="folderInput" webkitdirectory directory multiple />
    <input type="file" id="orderFileInput" />
    <button id="loadOrderBtn"></button>
    <button id="saveBtn" disabled></button>
    <button id="toggleTitlesBtn"></button>
    <button id="fsBtn"></button>
    <div class="spacer"></div>
    <span class="count" id="count"></span>
  </header>
  <div id="gridWrap">
    <div id="grid" style="gap:10px"></div>
  </div>
  <div class="footerbar" id="status" hidden></div>
`;

beforeEach(() => {
  document.body.innerHTML = baseDom;
});

describe('initApp DOM wiring', () => {
  it('initializes count text and titles button', async () => {
    const { initApp } = await import('../../app.js');
    initApp();
    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide Titles');
  });
});
