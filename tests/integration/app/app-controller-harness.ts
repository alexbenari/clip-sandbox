// @ts-nocheck
import { expect, vi } from 'vitest';

import { shippedPageBody } from '../../support/page-markup.js';

export function waitFor(assertion, { timeout = 250, interval = 10 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      try {
        resolve(assertion());
      } catch (error) {
        if (Date.now() - start >= timeout) {
          reject(error);
          return;
        }
        setTimeout(check, interval);
      }
    }
    check();
  });
}

export async function openActivityPanel() {
  document.getElementById('activityIndicatorBtn').click();
  await waitFor(() => {
    expect(document.getElementById('activityIndicatorPanel').hidden).toBe(false);
  });
}

export function desktopFile({
  name,
  path = `C:/clips/${name}`,
  relativePath = name,
  mediaSource = `file:///C:/clips/${name}`,
  type = name.endsWith('.txt') ? 'text/plain' : 'video/mp4',
  text,
}) {
  return {
    name,
    path,
    relativePath,
    mediaSource: name.endsWith('.txt') ? undefined : mediaSource,
    type,
    text,
    lastModifiedMs: Date.now(),
  };
}

export class DesktopAppTestEnvironment {
  #originals = {};
  #fileTextDescriptor = undefined;
  #fileTextPatched = false;
  #documentListeners = [];
  #windowListeners = [];
  #listenerSpies = [];

  setUp() {
    vi.resetModules();
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    document.body.innerHTML = shippedPageBody();
    document.title = '';
    window.clipSandboxDesktop = {
      loadAppSettings: vi.fn(async () => ({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' } })),
      saveAppSettings: vi.fn(async (settings) => ({ ok: true, settings })),
      choosePipelinesRoot: vi.fn(async () => ({ canceled: true })),
      pickFolder: vi.fn(async () => ({
        canceled: false,
        folderPath: 'C:/clips',
        folderName: 'clips',
        files: [{
          name: 'alpha.mp4',
          path: 'C:/clips/alpha.mp4',
          relativePath: 'alpha.mp4',
          mediaSource: 'file:///C:/clips/alpha.mp4',
          type: 'video/mp4',
          lastModifiedMs: Date.now(),
        }],
      })),
      saveTextFile: vi.fn(async () => ({ mode: 'saved' })),
      appendTextFile: vi.fn(async () => ({ mode: 'saved' })),
      createVideoEdit: vi.fn(async () => ({ ok: false, code: 'missing-binary' })),
      deleteFiles: vi.fn(async () => ({ ok: true, code: 'deleted', results: [] })),
      listPipelineCatalog: vi.fn(async () => ({ kind: 'unconfigured' })),
    };
    this.#originals = {
      ResizeObserver: originalResizeObserver,
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
      play: HTMLMediaElement.prototype.play,
      pause: HTMLMediaElement.prototype.pause,
      load: HTMLMediaElement.prototype.load,
    };
    const addDocumentListener = document.addEventListener.bind(document);
    const addWindowListener = window.addEventListener.bind(window);
    URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
    URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
    this.#documentListeners = [];
    this.#windowListeners = [];
    this.#listenerSpies = [
      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
        this.#documentListeners.push({ type, listener, options });
        return addDocumentListener(type, listener, options);
      }),
      vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
        this.#windowListeners.push({ type, listener, options });
        return addWindowListener(type, listener, options);
      }),
    ];
  }

  serveFileText(textForFilename) {
    if (!this.#fileTextPatched) {
      this.#fileTextDescriptor = Object.getOwnPropertyDescriptor(File.prototype, 'text');
      this.#fileTextPatched = true;
    }
    Object.defineProperty(File.prototype, 'text', {
      configurable: true,
      value() { return Promise.resolve(textForFilename(this.name) || ''); },
    });
  }

  tearDown() {
    if (this.#fileTextPatched) {
      if (this.#fileTextDescriptor) Object.defineProperty(File.prototype, 'text', this.#fileTextDescriptor);
      else delete File.prototype.text;
    }
    this.#fileTextDescriptor = undefined;
    this.#fileTextPatched = false;
    for (const { type, listener, options } of this.#documentListeners) {
      document.removeEventListener(type, listener, options);
    }
    for (const { type, listener, options } of this.#windowListeners) {
      window.removeEventListener(type, listener, options);
    }
    for (const spy of this.#listenerSpies) spy.mockRestore();
    this.#listenerSpies = [];
    globalThis.ResizeObserver = this.#originals.ResizeObserver;
    URL.createObjectURL = this.#originals.createObjectURL;
    URL.revokeObjectURL = this.#originals.revokeObjectURL;
    HTMLMediaElement.prototype.play = this.#originals.play;
    HTMLMediaElement.prototype.pause = this.#originals.pause;
    HTMLMediaElement.prototype.load = this.#originals.load;
    delete window.clipSandboxDesktop;
    document.body.innerHTML = '';
  }
}