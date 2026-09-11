import { expect, test } from 'vitest';
import type { ClipCollectionGridController } from '../../src/ui/clip-collection-grid-controller.js';
import type { FullscreenSession } from '../../src/app/fullscreen-session.js';
import type { ContextMenuController } from '../../src/ui/context-menu-controller.js';
import type { GridVideoMetadataTracker } from '../../src/ui/grid-video-metadata-tracker.js';
import type { ZoomOverlayController } from '../../src/ui/zoom-overlay-controller.js';
import type { Clip } from '../../src/domain/clip.js';

function rejectedConsumerAccess(grid: ClipCollectionGridController, fullscreen: FullscreenSession,
  menu: ContextMenuController, tracker: GridVideoMetadataTracker, zoom: ZoomOverlayController, clip: Clip): void {
  // @ts-expect-error Selection mutations belong to the grid owner.
  grid.selectedClipIds.clear();
  // @ts-expect-error Cached views cannot escape to consumers.
  grid.gridViewCache.clear();
  // @ts-expect-error There is no public raw grid getter.
  grid.getGridElement();
  // @ts-expect-error Card handles are internal.
  grid.getCardByClipId('a');
  // @ts-expect-error Fullscreen scheduling state is owner-local.
  fullscreen.fullscreenState.slots = 3;
  // @ts-expect-error Menu state changes must use open/close.
  menu.openState = true;
  // @ts-expect-error Tracker records are internal.
  tracker.statesByClipId.clear();
  // @ts-expect-error Zoom media is internal.
  zoom.videoEl.pause();
  // @ts-expect-error No public Zoom media getter.
  zoom.getVideoElement();
  // @ts-expect-error File extension metadata is immutable.
  clip.file.mediaSource = 'file:///changed.mp4';
}

test('consumer encapsulation contracts are checked by TypeScript', () => {
  expect(typeof rejectedConsumerAccess).toBe('function');
});
