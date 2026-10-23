// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { shippedPageBody } from '../../support/page-markup.js';

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  document.body.innerHTML = shippedPageBody();
  document.title = '';
  window.clipSandboxDesktop = {
    loadAppSettings: async () => ({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false } }),
    listPipelineCatalog: async () => ({ kind: 'unconfigured' }),
  };
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  delete window.clipSandboxDesktop;
  document.body.innerHTML = '';
  document.title = '';
});

describe('AppController startup on the shipped page', () => {
  it('opens on GIF Extraction with one movie player and switches to an empty Collection screen', async () => {
    const { AppController } = await import('../../../src/app/app-controller.js');
    new AppController().init();
    const screenSelector = document.getElementById('appScreenSelector');

    expect(screenSelector.value).toBe('gif-extraction');
    expect(screenSelector.hidden).toBe(false);
    expect([...screenSelector.options].map(option => option.textContent)).toEqual(['GIF Extraction', 'Collection', 'Settings']);
    expect(document.querySelector('#screenCommandHost [data-command="open-movie"]')).not.toBeNull();
    expect(document.querySelectorAll('.frame-review-player input[type="range"]')).toHaveLength(1);
    expect(document.getElementById('refineGifScreen').hidden).toBe(true);

    screenSelector.value = 'collection';
    screenSelector.dispatchEvent(new Event('change'));

    const collectionSelect = document.getElementById('activeCollectionName');
    expect(document.getElementById('count').textContent).toBe('0 clips');
    expect(document.getElementById('toggleTitlesBtn').textContent).toBe('Hide titles');
    expect(collectionSelect.disabled).toBe(true);
    expect(collectionSelect.options[0].textContent).toBe('No pipeline loaded');
    expect(document.title).toBe('Clip Sandbox');
    expect(document.getElementById('gifExtractionScreen').hidden).toBe(true);
  });
});
