import { describe, expect, it, vi } from 'vitest';

import { ElectronClipCapturesStoreService } from '../../src/adapters/electron/electron-clip-captures-store-service.js';
import { ElectronClipExtractionService } from '../../src/adapters/electron/electron-clip-extraction-service.js';
import { ElectronCollectionClipRefinementService } from '../../src/adapters/electron/electron-collection-clip-refinement-service.js';
import { ElectronFrameReviewService } from '../../src/adapters/electron/electron-frame-review-service.js';
import { ElectronThumbnailCacheService } from '../../src/adapters/electron/electron-thumbnail-cache-service.js';

function desktopWindow(desktop: Record<string, unknown> | undefined): Window {
  return { clipSandboxDesktop: desktop, document } as unknown as Window;
}

const optionalAdapters = [
  {
    name: 'frame review',
    tryCreate: (win: Window) => ElectronFrameReviewService.tryCreate(win),
    adapter: ElectronFrameReviewService,
    api: { frameReview: { chooseSource: vi.fn(), open: vi.fn(), command: vi.fn(), close: vi.fn(), subscribe: vi.fn() } },
  },
  {
    name: 'thumbnail cache',
    tryCreate: (win: Window) => ElectronThumbnailCacheService.tryCreate(win),
    adapter: ElectronThumbnailCacheService,
    api: { thumbnailCache: { save: vi.fn(), load: vi.fn(), delete: vi.fn() } },
  },
  {
    name: 'clip extraction',
    tryCreate: (win: Window) => ElectronClipExtractionService.tryCreate(win),
    adapter: ElectronClipExtractionService,
    api: { clipExtraction: { subscribeProgress: vi.fn(), openDestination: vi.fn(), extract: vi.fn(), saveCollection: vi.fn(), cancel: vi.fn() } },
  },
  {
    name: 'saved captures',
    tryCreate: (win: Window) => ElectronClipCapturesStoreService.tryCreate(win),
    adapter: ElectronClipCapturesStoreService,
    api: { clipCaptures: { attach: vi.fn(), save: vi.fn() } },
  },
  {
    name: 'collection refinement',
    tryCreate: (win: Window) => ElectronCollectionClipRefinementService.tryCreate(win),
    adapter: ElectronCollectionClipRefinementService,
    api: { collectionRefine: { inspect: vi.fn(), resolve: vi.fn() } },
  },
];

describe.each(optionalAdapters)('the $name adapter factory', ({ tryCreate, adapter, api }) => {
  it('creates the adapter when the desktop API is present', () => {
    expect(tryCreate(desktopWindow(api))).toBeInstanceOf(adapter);
  });

  it('returns no adapter when the desktop API is missing', () => {
    expect(tryCreate(desktopWindow({}))).toBeNull();
    expect(tryCreate(desktopWindow(undefined))).toBeNull();
  });
});
