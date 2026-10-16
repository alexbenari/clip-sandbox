import type { ClipEditor, CreatedVideoFile } from '../business-logic/clip-editor.js';
import type { VideoEdit } from '../business-logic/video-edit-catalog.js';
import type { Clip } from '../domain/clip.js';
import type { ClipSource } from '../domain/clip-source.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppSessionState } from './app-session-state.js';
import type { AppText } from './app-text.js';
import type { CollectionViewWorkflow } from './collection-view-workflow.js';
import type { IEventSource } from './event-source.js';
import type { PipelineWorkingCopy } from './pipeline-working-copy.js';
import { VideoEditNotificationError, ZoomVideoEditWorkflow } from './zoom-video-edit-workflow.js';

type MenuPoint = Readonly<{ x: number; y: number }>;

export interface IZoomView extends IEventSource<{
  playbackFailed: Readonly<{ name: string; error: unknown }>;
  contextMenuRequested: Readonly<{ point: MenuPoint }>;
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
  invalidateView(cacheKey: string): void;
  renderCollection(sequence: ClipSequence, options: { cacheKey: string }): void;
}

export interface IScreenChanges extends IEventSource<{ screenChanged: Readonly<{ id: string }> }> {}

export interface IZoomEditMenu {
  open(request: { point: MenuPoint; isDisabled: boolean; onSelectEdit: (edit: VideoEdit) => void }): void;
}

export interface IZoomFolderFiles {
  clipSourceOf(createdFile: CreatedVideoFile): ClipSource;
}

type ZoomDependencies = Readonly<{
  pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline' | 'isPipelineMode' | 'resolveClip'
    | 'insertCreatedClipInPipeline' | 'insertCreatedClipAfter'>;
  openFolder: Pick<AppSessionState, 'currentFolderAccess'>;
  folderFiles: IZoomFolderFiles;
  zoom: IZoomView;
  grid: IZoomGrid;
  screens: IScreenChanges;
  collectionScreenId: string;
  contextMenu: { close(options: { restoreFocus: boolean }): void };
  editMenu: IZoomEditMenu;
  clipEditor: Pick<ClipEditor, 'createVideoEdit'>;
  fullScreen: { isDocumentFullScreen(): boolean };
  boundaryFeedback: { playBoundaryClank(): void };
  collectionView: Pick<CollectionViewWorkflow, 'applySelection' | 'activeCacheKey' | 'refreshSelector' | 'refreshToolbar'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
  reporter: Pick<ActivityReporter, 'success' | 'progress' | 'failure' | 'technicalDetailsOf'>;
  appText: Pick<AppText, 'videoEditStartedText' | 'videoEditSucceededText' | 'videoEditPartialSuccessText' | 'videoEditFailedText'>;
}>;

export class ZoomWorkflow {
  private readonly videoEdits: ZoomVideoEditWorkflow;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly zoom: ZoomDependencies) {
    const { collectionView, reporter, appText } = zoom;
    this.videoEdits = new ZoomVideoEditWorkflow({
      clipEditor: zoom.clipEditor,
      onStarted: ({ edit, sourceClip }) => {
        collectionView.refreshToolbar();
        reporter.progress(appText.videoEditStartedText(edit.label, sourceClip.name));
      },
      onCreated: ({ sourceClip, createdFile }) => this.showCreatedClip(sourceClip, createdFile),
      onFailed: ({ edit, sourceClip, result }) => {
        collectionView.refreshToolbar();
        reporter.failure(appText.videoEditFailedText({ actionLabel: edit.label, code: result?.code }), {
          affected: `${edit.label}: ${sourceClip.name}`,
          recovery: 'Check the source file and output folder before trying the edit again.',
          technicalDetails: `Operation: ${edit.id}\nSource: ${sourceClip.name}\nResult: ${result.code}`,
        });
      },
      onFinished: () => collectionView.refreshToolbar(),
    });
    this.unsubscribes = [
      zoom.grid.on('openClipRequested', clipId => { this.openClipById(clipId); }),
      zoom.zoom.on('playbackFailed', ({ name, error }) => this.reportPlaybackFailure(name, error)),
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
    this.zoom.contextMenu.close({ restoreFocus: false });
    this.zoom.zoom.close();
  }

  toggleMuted(): void {
    this.zoom.zoom.toggleMuted();
  }

  openClip(clip: Clip | null): boolean {
    if (!clip || this.zoom.fullScreen.isDocumentFullScreen()) return false;
    const src = this.zoom.grid.getClipMediaSource(clip.id);
    if (!src) return false;
    this.zoom.grid.setSelectedClipId(clip.id);
    return this.zoom.zoom.open({ clipId: clip.id, src, name: clip.name || '' });
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

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private zoomedClip(): Clip | null {
    const clipId = this.zoom.zoom.getCurrentClipId();
    return clipId ? this.zoom.pipelineWorkingCopy.resolveClip(clipId) : null;
  }

  private openEditMenu(point: MenuPoint): void {
    if (!this.zoom.zoom.isOpen() || !this.zoomedClip()) return;
    this.zoom.editMenu.open({
      point,
      isDisabled: this.videoEdits.isRunning(),
      onSelectEdit: edit => { void this.runEdit(edit); },
    });
  }

  private async runEdit(edit: VideoEdit | null | undefined): Promise<void> {
    const { reporter } = this.zoom;
    const sourceClip = this.zoomedClip();
    if (!edit || !sourceClip || !this.zoom.pipelineWorkingCopy.pipeline) return;
    try {
      await this.videoEdits.run({
        edit,
        sourceClip,
        folderAccess: this.zoom.openFolder.currentFolderAccess,
      });
    } catch (error) {
      const problem = error instanceof VideoEditNotificationError
        ? `${edit.label}: ${error.message}`
        : `${edit.label}: an unexpected application error interrupted editing.`;
      const errors: unknown[] = error instanceof VideoEditNotificationError ? error.errors : [error];
      const technicalDetails = errors.map(cause => reporter.technicalDetailsOf(cause)).join('\n\n');
      reporter.failure(problem, {
        affected: `${edit.label}: ${sourceClip.name}`,
        recovery: error instanceof VideoEditNotificationError && error.result?.ok
          ? `Check ${error.result.createdFile.name} in the output folder before running the edit again.`
          : 'Review the error details before trying the edit again.',
        technicalDetails,
      });
      await this.zoom.diagnostics.logRuntimeError(problem, new Error(technicalDetails));
    }
  }

  private showCreatedClip(sourceClip: Clip, createdFile: CreatedVideoFile): void {
    const { pipelineWorkingCopy, reporter, appText, collectionView } = this.zoom;
    const createdSource = this.zoom.folderFiles.clipSourceOf(createdFile);
    const createdClip = pipelineWorkingCopy.isPipelineMode()
      ? this.insertIntoPipelineView(createdSource)
      : this.insertIntoCollectionView(sourceClip.id, createdSource);
    collectionView.refreshToolbar();
    if (!createdClip) {
      if (pipelineWorkingCopy.isPipelineMode()) {
        reporter.failure(`${appText.videoEditSucceededText(createdSource.name)} The pipeline view could not be refreshed.`);
      } else {
        reporter.failure(appText.videoEditPartialSuccessText(createdSource.name));
      }
      return;
    }
    this.openClip(createdClip);
    reporter.success(appText.videoEditSucceededText(createdSource.name), 4000);
  }

  private insertIntoPipelineView(createdSource: ClipSource): Clip | null {
    const result = this.zoom.pipelineWorkingCopy.insertCreatedClipInPipeline(createdSource);
    if (!result.ok) return null;
    this.zoom.grid.invalidateView('pipeline');
    this.zoom.collectionView.applySelection(result.sequence, {
      collection: null,
      folderAccess: this.zoom.openFolder.currentFolderAccess,
    });
    this.zoom.grid.setSelectedClipId(result.clip.id);
    return result.clip;
  }

  private insertIntoCollectionView(sourceClipId: string, createdSource: ClipSource): Clip | null {
    const { grid, collectionView } = this.zoom;
    const result = this.zoom.pipelineWorkingCopy.insertCreatedClipAfter(sourceClipId, createdSource);
    if (!result.ok) return null;
    grid.invalidateView('pipeline');
    grid.invalidateView(collectionView.activeCacheKey());
    grid.renderCollection(result.sequence, { cacheKey: collectionView.activeCacheKey() });
    collectionView.refreshSelector();
    collectionView.refreshToolbar();
    grid.setSelectedClipId(result.clip.id);
    return result.clip;
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
