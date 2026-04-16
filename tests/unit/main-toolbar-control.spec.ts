// @ts-nocheck
import { afterEach, describe, expect, test } from 'vitest';
import { MainToolbarControl } from '../../src/ui/main-toolbar-control.js';

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
});
