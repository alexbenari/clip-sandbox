import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppSessionState } from '../../src/app/app-session-state.js';
import { AppText } from '../../src/app/app-text.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineSession } from '../../src/app/pipeline-session.js';
import { ZoomWorkflow } from '../../src/app/zoom-workflow.js';
import type { ClipEditorResult } from '../../src/business-logic/clip-editor.js';
import type { VideoEdit } from '../../src/business-logic/video-edit-catalog.js';
import { Pipeline } from '../../src/domain/pipeline.js';

const loopify = { id: 'loopify', label: 'Loopify' } as VideoEdit;

class FakeZoomView extends EventSource<{ playbackFailed: { name: string; error: unknown }; contextMenuRequested: { point: { x: number; y: number } } }> {
  currentClipId: string | null = null;
  open = vi.fn(({ clipId }: { clipId: string }) => { this.currentClipId = clipId; return true; });
  close = vi.fn(() => { this.currentClipId = null; });
  toggleMuted = vi.fn();
  isOpen() { return this.currentClipId !== null; }
  getCurrentClipId() { return this.currentClipId; }
}

function zoomWorkflow({ editResult }: { editResult?: ClipEditorResult } = {}) {
  const pipeline = new Pipeline({ folderName: 'clips', videoFiles: [new File(['a'], 'alpha.mp4'), new File(['b'], 'bravo.mp4')] });
  const pipelineSession = new PipelineSession();
  pipelineSession.loadPipeline(pipeline);
  const [alpha, bravo] = pipelineSession.currentClipSequence!.orderedClips();
  const openFolder = new AppSessionState();
  const folderSession = { folderPath: 'C:/clips' };
  openFolder.setCurrentFolderSession(folderSession);
  const zoomView = new FakeZoomView();
  const grid = Object.assign(new EventSource<{ openClipRequested: string }>(), {
    getClipMediaSource: (clipId: string) => `file:///C:/clips/${clipId}.mp4`,
    getClipById: (clipId: string | null | undefined) => pipelineSession.resolveClip(clipId),
    getNextClip: (clipId: string | null) => (clipId === alpha.id ? bravo : null),
    getPrevClip: (clipId: string | null) => (clipId === bravo.id ? alpha : null),
    setSelectedClipId: vi.fn(),
    invalidateView: vi.fn(),
    renderCollection: vi.fn(),
  });
  const editMenu = { open: vi.fn() };
  const boundaryFeedback = { playBoundaryClank: vi.fn() };
  const entries: { kind: string; message: string }[] = [];
  const collectionView = { applySelection: vi.fn(), activeCacheKey: () => 'pipeline', refreshSelector: vi.fn(), refreshToolbar: vi.fn() };
  const screens = new EventSource<{ screenChanged: { id: string } }>();
  const workflow = new ZoomWorkflow({
    pipelineSession,
    openFolder,
    folderFiles: {
      canMutateDisk: (session: unknown): session is { folderPath: string } => session === folderSession,
      toRendererFile: created => created as File,
    },
    zoom: zoomView,
    grid,
    screens,
    collectionScreenId: 'collection',
    contextMenu: { close: vi.fn() },
    editMenu,
    clipEditor: { createVideoEdit: vi.fn(async () => editResult ?? { ok: false, code: 'edit-failed', edit: loopify } as ClipEditorResult) },
    fullScreen: { isDocumentFullScreen: () => false },
    boundaryFeedback,
    collectionView,
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
    reporter: new ActivityReporter({ log: entry => { entries.push(entry); } }),
    appText: new AppText(),
  });
  return { workflow, zoomView, grid, screens, editMenu, boundaryFeedback, entries, alpha, bravo, collectionView, pipelineSession };
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

  it('runs a chosen edit and reports a failed result', async () => {
    const { workflow, zoomView, editMenu, entries, alpha } = zoomWorkflow();
    workflow.openClip(alpha);

    zoomView.emit('contextMenuRequested', { point: { x: 10, y: 20 } });
    const { onSelectEdit } = editMenu.open.mock.calls[0][0];
    onSelectEdit(loopify);

    await vi.waitFor(() => expect(entries.at(-1)?.kind).toBe('error'));
    expect(entries[0]).toMatchObject({ kind: 'progress', message: new AppText().videoEditStartedText('Loopify', 'alpha.mp4') });
  });

  it('inserts a created clip into the pipeline view and zooms into it', async () => {
    const created = new File(['looped'], 'alpha-looped.mp4');
    const { workflow, zoomView, editMenu, entries, alpha, collectionView, pipelineSession } = zoomWorkflow({
      editResult: { ok: true, code: 'created', edit: loopify, request: {} as never, createdFile: created },
    });
    workflow.openClip(alpha);
    zoomView.emit('contextMenuRequested', { point: { x: 0, y: 0 } });

    editMenu.open.mock.calls[0][0].onSelectEdit(loopify);

    await vi.waitFor(() => expect(entries.at(-1)).toMatchObject({ kind: 'success' }));
    expect(pipelineSession.pipeline?.videoNames()).toContain('alpha-looped.mp4');
    expect(collectionView.applySelection).toHaveBeenCalled();
  });

  it('reports a playback failure in Zoom', () => {
    const { zoomView, entries } = zoomWorkflow();

    zoomView.emit('playbackFailed', { name: 'alpha.mp4', error: new Error('decode failed') });

    expect(entries.at(-1)).toMatchObject({ kind: 'error', message: 'Could not play alpha.mp4 in Zoom.' });
  });
});
