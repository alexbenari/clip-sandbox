import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import type { ZoomEditEntry } from '../../src/app/zoom-edit-mode-workflow.js';
import { ZoomWorkflow } from '../../src/app/zoom-workflow.js';
import type { Clip } from '../../src/domain/clip.js';
import { Pipeline } from '../../src/domain/pipeline.js';
import { clipSource } from '../support/clip-source-fixtures.js';
import { FakePreviewHolds } from '../support/preview-holds.js';

class FakeZoomView extends EventSource<{ playbackFailed: { name: string; error: unknown }; contextMenuRequested: { point: { x: number; y: number } }; closeRequested: void }> {
  currentClipId: string | null = null;
  open = vi.fn(({ clipId }: { clipId: string }) => { this.currentClipId = clipId; return true; });
  close = vi.fn(() => { this.currentClipId = null; });
  toggleMuted = vi.fn();
  isOpen() { return this.currentClipId !== null; }
  getCurrentClipId() { return this.currentClipId; }
}

type EditMenuRequest = { point: { x: number; y: number }; onRefine: () => void; onLoopify: () => void };

function zoomWorkflow({ enterZoomEditMode = null }: { enterZoomEditMode?: ((clip: Clip, entry: ZoomEditEntry) => void) | null } = {}) {
  const pipeline = new Pipeline({ folderName: 'clips', videoSources: [clipSource('alpha.mp4'), clipSource('bravo.mp4')] });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const [alpha, bravo] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const zoomView = new FakeZoomView();
  const grid = Object.assign(new EventSource<{ openClipRequested: string }>(), {
    getClipMediaSource: (clipId: string) => `file:///C:/clips/${clipId}.mp4`,
    getClipById: (clipId: string | null | undefined) => pipelineWorkingCopy.resolveClip(clipId),
    getNextClip: (clipId: string | null) => (clipId === alpha.id ? bravo : null),
    getPrevClip: (clipId: string | null) => (clipId === bravo.id ? alpha : null),
    setSelectedClipId: vi.fn(),
    focusClip: vi.fn(() => true),
    previews: new FakePreviewHolds(),
    holdPreviews: () => grid.previews.holdPreviews(),
  });
  const editMenu = { open: vi.fn((_request: EditMenuRequest) => undefined) };
  const boundaryFeedback = { playBoundaryClank: vi.fn() };
  const activityLog = recordedActivityLog();
  const { entries } = activityLog;
  const screens = new EventSource<{ screenChanged: { id: string } }>();
  const activeEdit = { isActive: false };
  const workflow = new ZoomWorkflow({
    pipelineWorkingCopy,
    zoom: zoomView,
    grid,
    screens,
    collectionScreenId: 'collection',
    contextMenu: { close: vi.fn() },
    editMenu,
    activeEdit,
    enterZoomEditMode,
    fullScreen: { isDocumentFullScreen: () => false },
    boundaryFeedback,
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
    reporter: new ActivityReporter(activityLog),
  });
  return { workflow, zoomView, grid, screens, editMenu, boundaryFeedback, entries, alpha, bravo, activeEdit };
}
describe('ZoomWorkflow', () => {
  it('closes when another screen becomes active, and stays open on Collection', () => {
    const { workflow, zoomView, screens, alpha } = zoomWorkflow();
    workflow.openClip(alpha);

    screens.emit('screenChanged', { id: 'collection' });
    expect(workflow.isOpen()).toBe(true);
    screens.emit('screenChanged', { id: 'settings' });

    expect(workflow.isOpen()).toBe(false);
    expect(zoomView.close).toHaveBeenCalledOnce();
  });

  it('closes when the backdrop is clicked, returning focus to the clip', () => {
    const { workflow, zoomView, grid, alpha } = zoomWorkflow();
    workflow.openClip(alpha);

    zoomView.emit('closeRequested');

    expect(workflow.isOpen()).toBe(false);
    expect(grid.focusClip).toHaveBeenCalledWith(alpha.id);
  });

  it('leaves a backdrop click to Zoom edit mode while the mode is active', () => {
    const { workflow, zoomView, alpha, activeEdit } = zoomWorkflow();
    workflow.openClip(alpha);
    activeEdit.isActive = true;

    zoomView.emit('closeRequested');

    expect(workflow.isOpen()).toBe(true);
  });

  it('keeps the clip in Zoom edit mode when another clip asks to open', () => {
    const { workflow, zoomView, alpha, bravo, activeEdit } = zoomWorkflow();
    workflow.openClip(alpha);
    activeEdit.isActive = true;

    expect(workflow.openClip(bravo)).toBe(false);
    expect(zoomView.currentClipId).toBe(alpha.id);
  });

  it.each([
    ['onRefine', 'refine'],
    ['onLoopify', 'loopify'],
  ] as const)('enters Zoom edit mode on the zoomed clip from its edit menu entry %s', (entry, expected) => {
    const enterZoomEditMode = vi.fn();
    const { workflow, zoomView, editMenu, alpha } = zoomWorkflow({ enterZoomEditMode });
    workflow.openClip(alpha);
    zoomView.emit('contextMenuRequested', { point: { x: 0, y: 0 } });

    editMenu.open.mock.calls[0][0][entry]();

    expect(enterZoomEditMode.mock.calls).toEqual([[alpha, expected]]);
  });

  it('enters Zoom edit mode on the zoomed clip with the edit asked for', () => {
    const enterZoomEditMode = vi.fn();
    const { workflow, alpha } = zoomWorkflow({ enterZoomEditMode });
    workflow.openClip(alpha);

    expect(workflow.enterEditMode('loopify')).toBe(true);
    expect(enterZoomEditMode.mock.calls).toEqual([[alpha, 'loopify']]);
  });

  it.each([
    ['Zoom is closed', false, false],
    ['the mode is already active', true, true],
  ])('does not enter Zoom edit mode when %s', (_case, opened, active) => {
    const enterZoomEditMode = vi.fn();
    const { workflow, alpha, activeEdit } = zoomWorkflow({ enterZoomEditMode });
    if (opened) workflow.openClip(alpha);
    activeEdit.isActive = active;

    expect(workflow.enterEditMode('refine')).toBe(false);
    expect(enterZoomEditMode).not.toHaveBeenCalled();
  });

  it('offers no edit menu when Zoom edit mode is unavailable', () => {
    const { workflow, zoomView, editMenu, alpha } = zoomWorkflow({ enterZoomEditMode: null });
    workflow.openClip(alpha);

    zoomView.emit('contextMenuRequested', { point: { x: 0, y: 0 } });

    expect(editMenu.open).not.toHaveBeenCalled();
  });

  it('holds the grid’s previews once while Zoom shows clips, also while browsing', () => {
    const { workflow, grid, alpha } = zoomWorkflow();

    workflow.openClip(alpha);
    workflow.browseByOffset(1);

    expect(grid.previews.count).toBe(1);
  });

  it.each([
    ['closes', (workflow: ZoomWorkflow) => { workflow.close(); }],
    ['is disposed', (workflow: ZoomWorkflow) => { workflow.dispose(); }],
  ])('releases the grid’s previews when Zoom %s', (_case, end) => {
    const { workflow, grid, alpha } = zoomWorkflow();
    workflow.openClip(alpha);

    end(workflow);

    expect(grid.previews.count).toBe(0);
  });

  it('releases the grid’s previews when another screen closes Zoom', () => {
    const { workflow, grid, screens, alpha } = zoomWorkflow();
    workflow.openClip(alpha);

    screens.emit('screenChanged', { id: 'settings' });

    expect(grid.previews.count).toBe(0);
  });

  it('holds no previews when Zoom cannot show the clip', () => {
    const { workflow, zoomView, grid, alpha } = zoomWorkflow();
    zoomView.open.mockReturnValue(false);

    workflow.openClip(alpha);

    expect(grid.previews.count).toBe(0);
  });

  it('returns focus to the clip shown last when Zoom closes', () => {
    const { workflow, grid, alpha, bravo } = zoomWorkflow();
    workflow.openClip(alpha);
    workflow.browseByOffset(1);

    workflow.close();

    expect(grid.focusClip).toHaveBeenCalledWith(bravo.id);
  });

  it('opens the clip the grid asks for and selects it', () => {
    const { zoomView, grid, alpha } = zoomWorkflow();

    grid.emit('openClipRequested', alpha.id);

    expect(zoomView.open).toHaveBeenCalledWith({ clipId: alpha.id, src: `file:///C:/clips/${alpha.id}.mp4`, name: 'alpha.mp4' });
    expect(grid.setSelectedClipId).toHaveBeenCalledWith(alpha.id);
  });

  it('browses to the next clip and sounds the boundary at the end', () => {
    const { workflow, zoomView, boundaryFeedback, alpha, bravo } = zoomWorkflow();
    workflow.openClip(alpha);

    expect(workflow.browseByOffset(1)).toBe(true);
    expect(zoomView.currentClipId).toBe(bravo.id);
    expect(workflow.browseByOffset(1)).toBe(false);
    expect(boundaryFeedback.playBoundaryClank).toHaveBeenCalledOnce();
  });

  it('reports a playback failure in Zoom', () => {
    const { zoomView, entries } = zoomWorkflow();

    zoomView.emit('playbackFailed', { name: 'alpha.mp4', error: new Error('decode failed') });

    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Could not play alpha.mp4 in Zoom.' });
  });
});
