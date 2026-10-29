import { describe, expect, it, vi } from 'vitest';

import { ElectronClipCapturesStoreService } from '../../src/adapters/electron/electron-clip-captures-store-service.js';
import { ElectronClipExtractionService } from '../../src/adapters/electron/electron-clip-extraction-service.js';
import { ElectronFrameReviewService } from '../../src/adapters/electron/electron-frame-review-service.js';
import { ElectronGifSessionServices } from '../../src/adapters/electron/electron-gif-session-services.js';
import { ElectronThumbnailCacheService } from '../../src/adapters/electron/electron-thumbnail-cache-service.js';
import { ElectronZoomEditSourceService } from '../../src/adapters/electron/electron-zoom-edit-source-service.js';

function desktopWindow(desktop: Record<string, unknown> | undefined): Window {
  return { clipSandboxDesktop: desktop, document } as unknown as Window;
}

const frameReviewApi = { frameReview: { chooseSource: vi.fn(), open: vi.fn(), command: vi.fn(), close: vi.fn(), subscribe: vi.fn() } };
const thumbnailCacheApi = { thumbnailCache: { save: vi.fn(), load: vi.fn(), delete: vi.fn() } };
const clipExtractionApi = {
  clipExtraction: { subscribeProgress: vi.fn(), openDestination: vi.fn(), extract: vi.fn(), saveCollection: vi.fn(), cancel: vi.fn() },
};

const optionalAdapters = [
  {
    name: 'frame review',
    tryCreate: (win: Window) => ElectronFrameReviewService.tryCreate(win),
    adapter: ElectronFrameReviewService,
    api: frameReviewApi,
  },
  {
    name: 'thumbnail cache',
    tryCreate: (win: Window) => ElectronThumbnailCacheService.tryCreate(win),
    adapter: ElectronThumbnailCacheService,
    api: thumbnailCacheApi,
  },
  {
    name: 'clip extraction',
    tryCreate: (win: Window) => ElectronClipExtractionService.tryCreate(win),
    adapter: ElectronClipExtractionService,
    api: clipExtractionApi,
  },
  {
    name: 'saved captures',
    tryCreate: (win: Window) => ElectronClipCapturesStoreService.tryCreate(win),
    adapter: ElectronClipCapturesStoreService,
    api: { clipCaptures: { attach: vi.fn(), save: vi.fn() } },
  },
  {
    name: 'zoom edit sources',
    tryCreate: (win: Window) => ElectronZoomEditSourceService.tryCreate(win),
    adapter: ElectronZoomEditSourceService,
    api: { zoomEdit: { openClip: vi.fn(), openWindow: vi.fn(), anchorWindow: vi.fn() } },
  },
];

describe('the GIF session services', () => {
  const gifSessionApis = { ...frameReviewApi, ...thumbnailCacheApi, ...clipExtractionApi };

  it('are available without the saved-captures API, which only GIF Extraction uses', () => {
    expect(ElectronGifSessionServices.tryCreate(desktopWindow(gifSessionApis))).not.toBeNull();
  });

  it('are unavailable when one of their desktop APIs is missing', () => {
    const { frameReview: _frameReview, ...withoutFrameReview } = gifSessionApis;
    expect(ElectronGifSessionServices.tryCreate(desktopWindow(withoutFrameReview))).toBeNull();
  });
});

describe.each(optionalAdapters)('the $name adapter factory', ({ tryCreate, adapter, api }) => {
  it('creates the adapter when the desktop API is present', () => {
    expect(tryCreate(desktopWindow(api))).toBeInstanceOf(adapter);
  });

  it('returns no adapter when the desktop API is missing', () => {
    expect(tryCreate(desktopWindow({}))).toBeNull();
    expect(tryCreate(desktopWindow(undefined))).toBeNull();
  });
});
