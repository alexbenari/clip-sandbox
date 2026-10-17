// Compile-time contract: `npm run typecheck` fails if any access below stops being a type error.
// This file is checked by tsc only; it contains no runtime test.
import type { ClipCollectionGridControl } from '../../src/ui/clip-collection-grid-control.js';
import type { CollectionFullScreenWorkflow } from '../../src/app/collection-full-screen-workflow.js';
import type { ContextMenuControl } from '../../src/ui/context-menu-control.js';
import type { GridVideoMetadataTracker } from '../../src/ui/grid-video-metadata-tracker.js';
import type { ZoomOverlayControl } from '../../src/ui/zoom-overlay-control.js';
import type { Clip } from '../../src/domain/clip.js';

export function rejectedConsumerAccess(grid: ClipCollectionGridControl, fullscreen: CollectionFullScreenWorkflow,
  menu: ContextMenuControl, tracker: GridVideoMetadataTracker, zoom: ZoomOverlayControl, clip: Clip): void {
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
  // @ts-expect-error A clip's source is immutable.
  clip.source.mediaSource = 'file:///changed.mp4';
}
