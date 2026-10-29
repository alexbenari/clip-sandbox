// @ts-nocheck
import { vi } from 'vitest';

export function installGifDesktopApiFakes(desktop) {
  desktop.frameReview = {
    chooseSource: vi.fn(async () => ({ ok: true, result: { canceled: true } })),
    open: vi.fn(),
    command: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };
  desktop.thumbnailCache = {
    save: vi.fn(),
    load: vi.fn(),
    delete: vi.fn(async () => undefined),
  };
  desktop.clipExtraction = {
    subscribeProgress: vi.fn(() => () => undefined),
    openDestination: vi.fn(),
    extract: vi.fn(),
    saveCollection: vi.fn(),
    cancel: vi.fn(async () => undefined),
  };
  desktop.clipCaptures = {
    attach: vi.fn(),
    save: vi.fn(async () => undefined),
  };
}

export function installPipelineCatalogFakes(desktop, { entries, openEntry }) {
  desktop.listPipelineCatalog = vi.fn(async () => ({ kind: 'available', entries }));
  desktop.describePipelineCatalogEntry = vi.fn(async () => ({ clipNames: [], collections: [] }));
  desktop.openPipelineCatalogEntry = vi.fn(async ({ pipelineId }) => openEntry(pipelineId));
}
