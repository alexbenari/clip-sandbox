import { describe, expect, it } from 'vitest';

import { ActivityPanelAutoOpenPolicy } from '../../src/ui/activity-panel-auto-open-policy.js';

type SurfaceStates = {
  fullScreen?: boolean;
  zoom?: boolean;
  saveAsNewDialog?: boolean;
  collectionConflict?: boolean;
  openDialog?: boolean;
};

function policyWith(states: SurfaceStates = {}): ActivityPanelAutoOpenPolicy {
  return new ActivityPanelAutoOpenPolicy({
    fullScreen: { isFullScreenActive: () => states.fullScreen === true },
    zoom: { isOpen: () => states.zoom === true },
    saveAsNewDialog: { isOpen: () => states.saveAsNewDialog === true },
    collectionConflict: { isVisible: () => states.collectionConflict === true },
    document: { querySelector: (selector: string) => (selector === 'dialog[open]' && states.openDialog ? {} : null) } as Pick<Document, 'querySelector'>,
  });
}

describe('ActivityPanelAutoOpenPolicy', () => {
  it('lets the Activity panel open by itself when no protected surface is showing', () => {
    expect(policyWith().mayOpenAutomatically()).toBe(true);
  });

  it.each([
    ['any element is full screen', { fullScreen: true }],
    ['Zoom is open', { zoom: true }],
    ['Save as collection is open', { saveAsNewDialog: true }],
    ['the collection conflict is showing', { collectionConflict: true }],
    ['a dialog is open', { openDialog: true }],
  ])('keeps the Activity panel closed while %s', (_situation, states) => {
    expect(policyWith(states).mayOpenAutomatically()).toBe(false);
  });
});
