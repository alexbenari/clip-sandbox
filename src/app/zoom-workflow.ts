import type { Clip } from '../domain/clip.js';
import type { ActiveZoomEdit } from './active-zoom-edit.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { IEventSource } from './event-source.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import type { ZoomEditEntry } from './zoom-edit-mode-workflow.js';

type MenuPoint = Readonly<{ x: number; y: number }>;

export interface IZoomView extends IEventSource<{
  playbackFailed: Readonly<{ name: string; error: unknown }>;
  contextMenuRequested: Readonly<{ point: MenuPoint }>;
  closeRequested: void;
}> {
  open(item: { clipId: string; src: string; name: string }): boolean;
  close(): void;
  isOpen(): boolean;
  toggleMuted(): unknown;
  getCurrentClipId(): string | null;
}

export interface IZoomGrid extends IEventSource<{ openClipRequested: string }> {
  getClipMediaSource(clipId: string): string | null | undefined;
  getClipById(clipId: string | null | undefined): Clip | null;
  getNextClip(clipId: string | null): Clip | null;
  getPrevClip(clipId: string | null): Clip | null;
  setSelectedClipId(clipId: string): void;
  focusClip(clipId: string): boolean;
  holdPreviews(): () => void;
}

export interface IScreenChanges extends IEventSource<{ screenChanged: Readonly<{ id: string }> }> {}

export interface IZoomEditMenu {
  open(request: { point: MenuPoint; onRefine: () => void; onLoopify: () => void }): void;
}

type ZoomDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'resolveClip'>;
  zoom: IZoomView;
  grid: IZoomGrid;
  screens: IScreenChanges;
  collectionScreenId: string;
  contextMenu: { close(options: { restoreFocus: boolean }): void };
  editMenu: IZoomEditMenu;
  activeEdit: Pick<ActiveZoomEdit, 'isActive'>;
  enterZoomEditMode: ((clip: Clip, entry: ZoomEditEntry) => void) | null;
  fullScreen: { isDocumentFullScreen(): boolean };
  boundaryFeedback: { playBoundaryClank(): void };
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  reporter: Pick<ActivityReporter, 'failure' | 'technicalDetailsOf'>;
}>;

export class ZoomWorkflow {
  private readonly unsubscribes: (() => void)[];
  // The grid's clips would compete with the zoomed clip for the video decoder.
  private releaseGridPreviews: (() => void) | null = null;

  constructor(private readonly zoom: ZoomDependencies) {
    this.unsubscribes = [
      zoom.grid.on('openClipRequested', clipId => { this.openClipById(clipId); }),
      zoom.zoom.on('playbackFailed', ({ name, error }) => this.reportPlaybackFailure(name, error)),
      zoom.zoom.on('closeRequested', () => {
        if (this.isOpen() && !zoom.activeEdit.isActive) this.close();
      }),
      zoom.zoom.on('contextMenuRequested', ({ point }) => {
        if (zoom.fullScreen.isDocumentFullScreen()) return;
        this.openEditMenu(point);
      }),
      // Zoom overlays the Collection screen, so it closes when another screen becomes active.
      zoom.screens.on('screenChanged', screen => {
        if (screen.id !== zoom.collectionScreenId && this.isOpen()) this.close();
      }),
    ];
  }

  isOpen(): boolean {
    return this.zoom.zoom.isOpen();
  }

  close(): void {
    const shownClipId = this.zoom.zoom.getCurrentClipId();
    this.zoom.contextMenu.close({ restoreFocus: false });
    this.zoom.zoom.close();
    this.releaseGridPreviews?.();
    this.releaseGridPreviews = null;
    if (shownClipId) this.zoom.grid.focusClip(shownClipId);
  }

  toggleMuted(): void {
    this.zoom.zoom.toggleMuted();
  }

  openClip(clip: Clip | null): boolean {
    if (!clip || this.zoom.fullScreen.isDocumentFullScreen() || this.zoom.activeEdit.isActive) return false;
    const src = this.zoom.grid.getClipMediaSource(clip.id);
    if (!src) return false;
    this.zoom.grid.setSelectedClipId(clip.id);
    const opened = this.zoom.zoom.open({ clipId: clip.id, src, name: clip.name || '' });
    if (opened && !this.releaseGridPreviews) this.releaseGridPreviews = this.zoom.grid.holdPreviews();
    return opened;
  }

  openClipById(clipId: string | null | undefined): boolean {
    return this.openClip(this.zoom.grid.getClipById(clipId));
  }

  browseByOffset(offset: number): boolean {
    if (!this.zoom.zoom.isOpen()) return false;
    const currentClipId = this.zoom.zoom.getCurrentClipId();
    const nextClip = offset > 0 ? this.zoom.grid.getNextClip(currentClipId) : this.zoom.grid.getPrevClip(currentClipId);
    if (!nextClip) {
      this.zoom.boundaryFeedback.playBoundaryClank();
      return false;
    }
    return this.openClip(nextClip);
  }

  enterEditMode(entry: ZoomEditEntry): boolean {
    const clip = this.zoomedClip();
    const { enterZoomEditMode } = this.zoom;
    if (!clip || !enterZoomEditMode || this.zoom.activeEdit.isActive) return false;
    enterZoomEditMode(clip, entry);
    return true;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.releaseGridPreviews?.();
    this.releaseGridPreviews = null;
  }

  private zoomedClip(): Clip | null {
    const clipId = this.zoom.zoom.getCurrentClipId();
    return clipId ? this.zoom.pipelineWorkingCopy.resolveClip(clipId) : null;
  }

  // Every entry of Zoom's edit menu enters Zoom edit mode, so without the mode there is no menu.
  private openEditMenu(point: MenuPoint): void {
    if (!this.zoomedClip() || !this.zoom.enterZoomEditMode) return;
    this.zoom.editMenu.open({
      point,
      onRefine: () => { this.enterEditMode('refine'); },
      onLoopify: () => { this.enterEditMode('loopify'); },
    });
  }

  private reportPlaybackFailure(name: string, error: unknown): void {
    const problem = `Could not play ${name || 'the selected clip'} in Zoom.`;
    this.zoom.reporter.failure(problem, {
      affected: name,
      recovery: 'Close and reopen the clip. If playback still fails, check that the file is available and playable.',
      technicalDetails: this.zoom.reporter.technicalDetailsOf(error),
    });
    void this.zoom.diagnostics.logRuntimeError(problem, error);
  }
}
