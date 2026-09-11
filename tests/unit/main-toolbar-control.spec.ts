// @ts-nocheck
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MainToolbarControl } from '../../src/ui/main-toolbar-control.js';
import { AppText } from '../../src/app/app-text.js';

const appText = new AppText(value => String(value));

describe('main toolbar control', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('renders toolbar count, button states, and toggle text for pipeline mode', () => {
    document.body.innerHTML = `
      <span id="count"></span>
      <button id="saveBtn"></button>
      <button id="saveAsNewBtn"></button>
      <button id="addToCollectionBtn"></button>
      <button id="deleteFromDiskBtn"></button>
      <button id="toggleTitlesBtn"></button>
    `;

    const control = new MainToolbarControl({
      appText,
      countEl: document.getElementById('count'),
      saveBtn: document.getElementById('saveBtn'),
      saveAsNewBtn: document.getElementById('saveAsNewBtn'),
      addToCollectionBtn: document.getElementById('addToCollectionBtn'),
      deleteFromDiskBtn: document.getElementById('deleteFromDiskBtn'),
      toggleTitlesBtn: document.getElementById('toggleTitlesBtn'),
    });

    control.render({
      clipCount: 0,
      hasPipeline: false,
      hasSequence: false,
      hasSelection: false,
      isPipelineMode: true,
      titlesHidden: false,
    });

    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('saveBtn').disabled).toBe(true);
    expect(document.getElementById('saveAsNewBtn').disabled).toBe(true);
    expect(document.getElementById('saveAsNewBtn').textContent).toBe('Save as Collection');
    expect(document.getElementById('addToCollectionBtn').disabled).toBe(true);
    expect(document.getElementById('deleteFromDiskBtn').disabled).toBe(true);
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide Titles');
  });

  test('renders toolbar count, button states, and toggle text for collection mode', () => {
    document.body.innerHTML = `
      <span id="count"></span>
      <button id="saveBtn"></button>
      <button id="saveAsNewBtn"></button>
      <button id="addToCollectionBtn"></button>
      <button id="deleteFromDiskBtn"></button>
      <button id="toggleTitlesBtn"></button>
    `;

    const control = new MainToolbarControl({
      appText,
      countEl: document.getElementById('count'),
      saveBtn: document.getElementById('saveBtn'),
      saveAsNewBtn: document.getElementById('saveAsNewBtn'),
      addToCollectionBtn: document.getElementById('addToCollectionBtn'),
      deleteFromDiskBtn: document.getElementById('deleteFromDiskBtn'),
      toggleTitlesBtn: document.getElementById('toggleTitlesBtn'),
    });

    control.render({
      clipCount: 4,
      hasPipeline: true,
      hasSequence: true,
      hasSelection: true,
      isPipelineMode: false,
      titlesHidden: true,
    });

    expect(document.getElementById('count').textContent).toBe('4 clips');
    expect(document.getElementById('saveBtn').disabled).toBe(false);
    expect(document.getElementById('saveAsNewBtn').disabled).toBe(false);
    expect(document.getElementById('saveAsNewBtn').textContent).toBe('Save Collection As...');
    expect(document.getElementById('saveAsNewBtn').title).toBe('Save the current collection as another collection file');
    expect(document.getElementById('addToCollectionBtn').disabled).toBe(false);
    expect(document.getElementById('deleteFromDiskBtn').disabled).toBe(false);
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Show Titles');
  });

  test('owns its button event bindings and removes them when destroyed', () => {
    const browseButton = document.createElement('button');
    const saveBtn = document.createElement('button');
    const saveAsNewBtn = document.createElement('button');
    const addToCollectionBtn = document.createElement('button');
    const deleteFromDiskBtn = document.createElement('button');
    const toggleTitlesBtn = document.createElement('button');
    const fullscreenButton = document.createElement('button');
    const handlers = Array.from({ length: 7 }, () => vi.fn());
    const buttons = [
      browseButton,
      saveBtn,
      saveAsNewBtn,
      addToCollectionBtn,
      deleteFromDiskBtn,
      toggleTitlesBtn,
      fullscreenButton,
    ];

    const control = new MainToolbarControl({
      appText,
      browseButton,
      saveBtn,
      saveAsNewBtn,
      addToCollectionBtn,
      deleteFromDiskBtn,
      toggleTitlesBtn,
      fullscreenButton,
      onBrowse: handlers[0],
      onSave: handlers[1],
      onSaveAsNew: handlers[2],
      onAddToCollection: handlers[3],
      onDeleteFromDisk: handlers[4],
      onToggleTitles: handlers[5],
      onToggleFullscreen: handlers[6],
    });

    buttons.forEach(button => button.click());
    handlers.forEach(handler => expect(handler).toHaveBeenCalledTimes(1));

    control.destroy();
    buttons.forEach(button => button.click());
    handlers.forEach(handler => expect(handler).toHaveBeenCalledTimes(1));
  });
});


test('focuses Browse and preserves fullscreen button content when updating its label', () => {
  const browseButton = document.createElement('button');
  const fullscreenButton = document.createElement('button');
  fullscreenButton.innerHTML = '<svg></svg><span class="command-label">Full Screen</span>';
  const icon = fullscreenButton.firstElementChild;
  document.body.append(browseButton, fullscreenButton);
  const toolbar = new MainToolbarControl({ appText, browseButton, fullscreenButton });
  toolbar.focusBrowse();
  expect(document.activeElement).toBe(browseButton);
  toolbar.setFullscreenButtonState(true);
  expect(fullscreenButton.textContent).toBe('Exit Full Screen');
  toolbar.setFullscreenButtonState(false);
  expect(fullscreenButton.getAttribute('aria-label')).toBe('Full Screen');
  expect(fullscreenButton.firstElementChild).toBe(icon);
  browseButton.remove(); fullscreenButton.remove();
});
