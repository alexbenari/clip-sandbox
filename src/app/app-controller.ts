import { GlobalUtilityCoordinator, GLOBAL_UTILITY_SHORTCUTS } from '../ui/global-utility-coordinator.js';
import { KeyboardMapControl } from '../ui/keyboard-map-control.js';
import { PipelineFactory } from '../business-logic/PipelineFactory.js';
import { ClipEditor } from '../business-logic/clip-editor.js';
import type { ContextMenuPoint } from '../ui/context-menu-controller.js';
import type { Clip, ClipFile } from '../domain/clip.js';
import type { ClipSequence } from '../domain/clip-sequence.js';
import type { Pipeline } from '../domain/pipeline.js';
import { VideoEditCatalog, type VideoEdit } from '../business-logic/video-edit-catalog.js';
import { AppSessionState } from './app-session-state.js';
import { PipelineSession } from './pipeline-session.js';
import { FullscreenAdapter } from '../adapters/browser/fullscreen-adapter.js';
import { ElectronFileSystemService } from '../adapters/electron/electron-file-system-service.js';
import { ClockAdapter } from '../adapters/browser/clock-adapter.js';
import { AudioFeedbackAdapter } from '../adapters/browser/audio-feedback-adapter.js';
import { FullscreenSession } from './fullscreen-session.js';
import { AppDiagnostics } from './app-diagnostics.js';
import { AppKeyDownHandler } from './app-keydown-handler.js';
import { ZoomVideoEditWorkflow, VideoEditNotificationError } from './zoom-video-edit-workflow.js';
import { ApplicationEventController } from './application-event-controller.js';
import { ApplicationShutdownCoordinator } from './application-shutdown-coordinator.js';
import { DisplayLayoutRules } from '../ui/display-layout-rules.js';
import { AppText } from './app-text.js';
import { CollectionNameValidator } from './collection-name-validator.js';
import { NewCollectionNameCheck } from './new-collection-name-check.js';
import { EventWiringCheck } from './event-wiring-check.js';
import { CollectionFileWriter } from './collection-file-writer.js';
import { CollectionViewWorkflow } from './collection-view-workflow.js';
import { CollectionSaveWorkflow } from './collection-save-workflow.js';
import { AddToCollectionWorkflow } from './add-to-collection-workflow.js';
import { FolderSelectionWorkflow } from './folder-selection-workflow.js';
import { DeleteFromDiskWorkflow } from './delete-from-disk-workflow.js';
import { RefineScreenLeavePolicy } from './refine-screen-leave-policy.js';
import { ActivityPanelAutoOpenPolicy } from '../ui/activity-panel-auto-open-policy.js';
import { OrderMenuController } from '../ui/order-menu-controller.js';
import { AddToCollectionDialogController } from '../ui/add-to-collection-dialog-controller.js';
import { CollectionSelectorControl } from '../ui/collection-selector-control.js';
import { MainToolbarControl } from '../ui/main-toolbar-control.js';
import { ApplicationShellController } from '../ui/application-shell-controller.js';
import { CollectionScreen } from '../ui/collection-screen.js';
import { SettingsScreen } from '../ui/settings-screen.js';
import { GifExtractionScreen } from '../ui/gif-extraction-screen.js';
import { RefineGifScreen } from '../ui/refine-gif-screen.js';
import { FrameReviewPlayerControl } from '../ui/frame-review-player-control.js';
import { GifWorkflowKeyboardController } from '../ui/gif-workflow-keyboard-controller.js';
import { GifRangesPanelControl } from '../ui/gif-ranges-panel-control.js';
import { ElectronFrameReviewService } from '../adapters/electron/electron-frame-review-service.js';
import { ElectronThumbnailCacheService } from '../adapters/electron/electron-thumbnail-cache-service.js';
import { ElectronClipExtractionService } from '../adapters/electron/electron-clip-extraction-service.js';
import { ElectronClipCapturesStoreService } from '../adapters/electron/electron-clip-captures-store-service.js';
import { ElectronCollectionClipRefinementService } from '../adapters/electron/electron-collection-clip-refinement-service.js';
import type { ICollectionClipRefinementRequest } from './collection-clip-refinement.js';
import { GifExtractionSession } from './gif-extraction-session.js';
import { AppSettingsService } from './app-settings-service.js';
import { AppSettingsParser, DEFAULT_STARTUP_SCREEN_ID } from './app-settings.js';
import { ElectronAppSettingsService } from '../adapters/electron/electron-app-settings-service.js';
import { ActivityIndicatorControl } from '../ui/activity-indicator-control.js';
import { ActivityLogger } from './activity-logger.js';
import { ActivityReporter } from './activity-reporter.js';
import { ContextMenuController } from '../ui/context-menu-controller.js';
import { GridContextMenuControl } from '../ui/grid-context-menu-control.js';
import { ZoomEditMenuControl } from '../ui/zoom-edit-menu-control.js';
import { ZoomOverlayController } from '../ui/zoom-overlay-controller.js';
import { ClipCollectionGridController } from '../ui/clip-collection-grid-controller.js';
import { ClipLabelFormatter } from '../ui/clip-label-formatter.js';
import { CollectionConflictController } from '../ui/collection-conflict-controller.js';
import { DeleteFromDiskDialogController } from '../ui/delete-from-disk-dialog-controller.js';
import { SaveAsNewDialogController } from '../ui/save-as-new-dialog-controller.js';
import { UnsavedChangesDialogController } from '../ui/unsaved-changes-dialog-controller.js';
import { LoadStatusControl } from '../ui/load-status-control.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { Collection } from '../domain/collection.js';
import { OpenFolderRefreshSession } from './open-folder-refresh-session.js';
import type { IPipelineCatalogEntry } from './pipeline-catalog.js';
import { PipelineCatalogControl } from '../ui/pipeline-catalog-control.js';

const ERROR_LOG_FILENAME = 'err.log';
const NEW_COLLECTION_CHOICE_VALUE = '__new_collection__';
const PIPELINE_SELECTION_VALUE = '__pipeline__';

type FolderSelection = {
  folderSession: unknown;
  files: ClipFile[];
  folderName: string;
};

class AppControllerSupport {
  static requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found.`);
  return element as T;
}

  static optionalElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
  }

  static gifSessionServices(win: Window) {
    const frameReview = ElectronFrameReviewService.tryCreate(win);
    const thumbnails = ElectronThumbnailCacheService.tryCreate(win);
    const extractionService = ElectronClipExtractionService.tryCreate(win);
    const captureStore = ElectronClipCapturesStoreService.tryCreate(win);
    if (!frameReview || !thumbnails || !extractionService || !captureStore) return null;
    return { frameReview, thumbnails, extractionService, captureStore };
  }
}

export class AppController {
  private initialized = false;

  init(): void {
  if (this.initialized) return;
    let startCollectionRefinement: ((request: ICollectionClipRefinementRequest, collectionFilename: string) => Promise<void>) | null = null;
    let gridMenuRevision = 0;

    class AppWorkflows {
    private collectionFullscreenWasActive = false;
    private movieFullscreenWasActive = false;


    readonly currentPipeline = (): Pipeline | null => {
        return pipelineSession.pipeline;
      };

    readonly activeCollection = (): Collection | null => {
        return pipelineSession.activeCollection;
      };

    readonly currentClipSequence = (): ClipSequence | null => {
        return pipelineSession.currentClipSequence;
      };

    readonly isPipelineMode = (): boolean => {
        return pipelineSession.isPipelineMode();
      };

    readonly activeCollectionFilename = (): string => {
        return pipelineSession.activeCollectionFilename();
      };



    readonly closeZoom = () => {
        clipContextMenuController.close({ restoreFocus: false });
        zoomOverlay.close();
      };

    readonly clearLoadedState = () => {
        collectionConflictController.hide();
        deleteFromDisk.discardPendingRequest();
        collectionSave.cancelSaveAsNew();
        addToCollectionDialogController.close();
        clipContextMenuController.close({ restoreFocus: false });
        unsavedChangesDialogController.close();
        this.closeZoom();
        collectionView.clearLoadedView();
      };

    readonly openZoomForClip = (clip: Clip | null): boolean => {
        if (!clip || fullscreenAdapter.isDocumentFullScreen()) return false;
        const src = gridController.getClipMediaSource(clip.id);
        if (!src) return false;
        gridController.setSelectedClipId(clip.id);
        return zoomOverlay.open({ clipId: clip.id, src, name: clip.name || '' });
      };

    readonly openZoomForClipId = (clipId: string | null | undefined): boolean => {
        return this.openZoomForClip(gridController.getClipById(clipId));
      };

    readonly browseZoomByOffset = (offset: number): boolean => {
        if (!zoomOverlay.isOpen()) return false;
        const currentClipId = zoomOverlay.getCurrentClipId();
        const nextClip = offset > 0
          ? gridController.getNextClip(currentClipId)
          : gridController.getPrevClip(currentClipId);
        if (!nextClip) {
          audioFeedback.playBoundaryClank();
          return false;
        }
        return this.openZoomForClip(nextClip);
      };

    readonly resolveZoomedClipFromActiveSequence = (): Clip | null => {
        const clipId = zoomOverlay.getCurrentClipId();
        if (!clipId) return null;
        return pipelineSession.resolveClip(clipId);
      };

    readonly addCreatedClipInPipelineMode = (createdFile: ClipFile): Clip | null => {
        const result = pipelineSession.insertCreatedClipInPipeline(createdFile);
        if (!result.ok) return null;

        gridController.invalidateView('pipeline');
        collectionView.applySelection(result.sequence, {
          collection: null,
          folderSession: state.currentFolderSession,
        });
        gridController.setSelectedClipId(result.clip.id);
        return result.clip;
      };

    readonly addCreatedClipInCollectionMode = (sourceClipId: string, createdFile: ClipFile): Clip | null => {
        const result = pipelineSession.insertCreatedClipAfter(sourceClipId, createdFile);
        if (!result.ok) return null;
        gridController.invalidateView('pipeline');
        gridController.invalidateView(collectionView.activeCacheKey());
        gridController.renderCollection(result.sequence, {
          cacheKey: collectionView.activeCacheKey(),
        });
        collectionView.refreshSelector();
        collectionView.refreshToolbar();
        gridController.setSelectedClipId(result.clip.id);
        return result.clip;
      };

    readonly applyCreatedVideoEditResult = ({ sourceClip, createdFile }: {
        sourceClip: Clip;
        createdFile: ClipFile;
      }): Clip | null => {
        return this.isPipelineMode()
          ? this.addCreatedClipInPipelineMode(createdFile)
          : this.addCreatedClipInCollectionMode(sourceClip.id, createdFile);
      };

    readonly requestZoomVideoEdit = async (edit: VideoEdit | null | undefined): Promise<void> => {
        const sourceClip = this.resolveZoomedClipFromActiveSequence();
        if (!edit || !sourceClip || !this.currentPipeline()) return;
        try {
          await zoomVideoEditWorkflow.run({
            edit,
            sourceClip,
            folderSession: fileSystem.canMutateDisk(state.currentFolderSession)
              ? state.currentFolderSession
              : null,
          });
        } catch (error) {
          const problem = error instanceof VideoEditNotificationError
            ? `${edit.label}: ${error.message}`
            : `${edit.label}: an unexpected application error interrupted editing.`;
          const errors: unknown[] = error instanceof VideoEditNotificationError ? error.errors : [error];
          const technicalDetails = errors.map(cause => activityReporter.technicalDetailsOf(cause)).join('\n\n');
          activityReporter.failure(problem, {
            affected: `${edit.label}: ${sourceClip.name}`,
            recovery: error instanceof VideoEditNotificationError && error.result?.ok
              ? `Check ${error.result.createdFile.name} in the output folder before running the edit again.`
              : 'Review the error details before trying the edit again.',
            technicalDetails,
          });
          await diagnostics.logRuntimeError(problem, new Error(technicalDetails));
        }
      };

    readonly openZoomEditMenu = (point: ContextMenuPoint): void => {
        if (!zoomOverlay.isOpen() || !this.resolveZoomedClipFromActiveSequence()) return;
        zoomEditMenuControl.open({
          point,
          isDisabled: zoomVideoEditWorkflow.isRunning(),
          onSelectEdit: (edit) => {
            void this.requestZoomVideoEdit(edit);
          },
        });
      };

    readonly openGridContextMenu = async (point: ContextMenuPoint, clipId: string | null): Promise<void> => {
        const revision = ++gridMenuRevision;
        const clip = pipelineSession.resolveClip(clipId);
        const collectionFilename = this.activeCollectionFilename();
        const folderSession = state.currentFolderSession;
        const request = clip && fileSystem.canMutateDisk(folderSession)
          ? { folderPath: folderSession.folderPath, filename: clip.name } : null;
        let canRefine = false;
        if (request && collectionRefinementService) {
          try { canRefine = await collectionRefinementService.inspect(request); }
          catch { canRefine = false; }
        }
        if (revision !== gridMenuRevision || collectionFilename !== this.activeCollectionFilename()
          || state.currentFolderSession !== folderSession || shell.activeScreen !== collectionScreen
          || (clipId && pipelineSession.resolveClip(clipId) !== clip)) return;
        const hasSelection = gridController.getSelectedClipIds().length > 0;
        gridContextMenuControl.open({
          point,
          hasSelection,
          hasPipeline: !!this.currentPipeline(),
          hasClip: request !== null,
          canRefine,
          onRefine: () => {
            if (request && startCollectionRefinement) void startCollectionRefinement(request, collectionFilename);
          },
          targetCollections: addToCollection.destinationChoices(),
          onAddToCollection: (choice) => {
            void addToCollection.addSelectedClips({
              kind: 'existing',
              collectionFilename: choice.collectionFilename ?? null,
            });
          },
          onNewCollection: () => {
            addToCollection.openDialog({ startWithNewCollection: true });
          },
          onDeleteFromDisk: () => {
            deleteFromDisk.start();
          },
        });
      };

    readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
        if (utilities?.isOpen || e.defaultPrevented) return;
        if (shell.activeScreen === collectionScreen) fullscreenSession.onGlobalKeyDown(e);
      };

    readonly onKeyDown = (e: KeyboardEvent): void => {
        if (utilities?.isOpen || e.defaultPrevented) return;
        if (shell.activeScreen === collectionScreen) appKeyDownHandler.handle(e);
      };


    readonly onFsToggle = (): void => {
        if (zoomOverlay.isOpen()) this.closeZoom();
        fullscreenSession.onFsToggle();
      };

    readonly onFsChange = (): void => {
        utilities?.close(false);
        const movieActive = frameReviewPlayer.isMovieFullScreen();
        frameReviewPlayer.onFullScreenChange();
        if (movieActive !== this.movieFullscreenWasActive) gifWorkflowKeyboard.releaseHeldSteps();
        this.movieFullscreenWasActive = movieActive;
        const collectionActive = fullscreenAdapter.isDocumentFullScreen();
        if (collectionActive && zoomOverlay.isOpen()) this.closeZoom();
        if (collectionActive || this.collectionFullscreenWasActive) fullscreenSession.onFsChange();
        if (this.collectionFullscreenWasActive && !collectionActive && this.currentClipSequence()) {
          collectionView.renderActiveSequence();
        }
        this.collectionFullscreenWasActive = collectionActive;
      };
  }

  const workflows = new AppWorkflows();
this.initialized = true;
  'use strict';

  const pickBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('pickBtn');
  const saveBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('saveBtn');
  const saveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('saveAsNewBtn');
  const addToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('addToCollectionBtn');
  const deleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('deleteFromDiskBtn');
  const orderMenu = AppControllerSupport.requiredElement('orderMenu');
  const orderMenuBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('orderMenuBtn');
  const orderMenuPanel = AppControllerSupport.requiredElement('orderMenuPanel');
  const grid = AppControllerSupport.requiredElement('grid');
  const gridWrap = AppControllerSupport.requiredElement('gridWrap');
  const countSpan = AppControllerSupport.requiredElement('count');
  const activeCollectionNameEl = AppControllerSupport.requiredElement<HTMLSelectElement>('activeCollectionName');
  const toolbar = AppControllerSupport.requiredElement('toolbar');
  const activityIndicatorRoot = AppControllerSupport.requiredElement('activityIndicatorRoot');
  const activityIndicatorBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('activityIndicatorBtn');
  const activityIndicatorPanel = AppControllerSupport.requiredElement('activityIndicatorPanel');
  const activityIndicatorList = AppControllerSupport.requiredElement<HTMLUListElement>('activityIndicatorList');
  const zoomLayerRoot = AppControllerSupport.requiredElement('zoomLayerRoot');
  const toggleTitlesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('toggleTitlesBtn');
  const fsBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('fsBtn');
  const collectionConflict = AppControllerSupport.requiredElement('collectionConflict');
  const collectionConflictSummary = AppControllerSupport.requiredElement('collectionConflictSummary');
  const collectionConflictList = AppControllerSupport.requiredElement('collectionConflictList');
  const applyCollectionConflictBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('applyCollectionConflictBtn');
  const cancelCollectionConflictBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelCollectionConflictBtn');
  const saveAsNewDialog = AppControllerSupport.requiredElement('saveAsNewDialog');
  const saveAsNewDialogTitle = saveAsNewDialog.querySelector<HTMLElement>('h2');
  const saveAsNewDialogText = saveAsNewDialog.querySelector<HTMLElement>('p');
  const saveAsNewNameInput = AppControllerSupport.requiredElement<HTMLInputElement>('saveAsNewNameInput');
  const saveAsNewError = AppControllerSupport.requiredElement('saveAsNewError');
  const confirmSaveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('confirmSaveAsNewBtn');
  const cancelSaveAsNewBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelSaveAsNewBtn');
  const addToCollectionDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('addToCollectionDialog');
  const addToCollectionSelect = AppControllerSupport.optionalElement<HTMLSelectElement>('addToCollectionSelect');
  const addToCollectionNameLabel = AppControllerSupport.optionalElement('addToCollectionNameLabel');
  const addToCollectionNameInput = AppControllerSupport.optionalElement<HTMLInputElement>('addToCollectionNameInput');
  const addToCollectionError = AppControllerSupport.optionalElement('addToCollectionError');
  const confirmAddToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmAddToCollectionBtn');
  const cancelAddToCollectionBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelAddToCollectionBtn');
  const unsavedChangesDialog = AppControllerSupport.requiredElement<HTMLDialogElement>('unsavedChangesDialog');
  const unsavedChangesText = AppControllerSupport.requiredElement('unsavedChangesText');
  const confirmUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('confirmUnsavedChangesBtn');
  const discardUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('discardUnsavedChangesBtn');
  const cancelUnsavedChangesBtn = AppControllerSupport.requiredElement<HTMLButtonElement>('cancelUnsavedChangesBtn');
  const deletePreflightDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('deletePreflightDialog');
  const deletePreflightText = AppControllerSupport.optionalElement('deletePreflightText');
  const confirmDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmDeletePreflightBtn');
  const discardDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('discardDeletePreflightBtn');
  const cancelDeletePreflightBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelDeletePreflightBtn');
  const deleteFromDiskDialog = AppControllerSupport.optionalElement<HTMLDialogElement>('deleteFromDiskDialog');
  const deleteFromDiskSummary = AppControllerSupport.optionalElement('deleteFromDiskSummary');
  const deleteFromDiskPreview = AppControllerSupport.optionalElement('deleteFromDiskPreview');
  const confirmDeleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('confirmDeleteFromDiskBtn');
  const cancelDeleteFromDiskBtn = AppControllerSupport.optionalElement<HTMLButtonElement>('cancelDeleteFromDiskBtn');
  const clipContextMenu = AppControllerSupport.requiredElement('clipContextMenu');
  const clipContextMenuPanel = AppControllerSupport.requiredElement('clipContextMenuPanel');
  const body = document.body;

  const state = new AppSessionState();
  const eventWiring = new EventWiringCheck();
  const pipelineSession = new PipelineSession();
  const appText = new AppText();
  const displayLayoutRules = new DisplayLayoutRules();
  const collectionNameValidator = new CollectionNameValidator(appText);
  const newCollectionNameCheck = new NewCollectionNameCheck(pipelineSession, collectionNameValidator);
  const videoEditCatalog = new VideoEditCatalog();
  const clipLabelFormatter = new ClipLabelFormatter();
  const validator = new CollectionDescriptionValidator();
  const settingsParser = new AppSettingsParser();
  const settingsService = new AppSettingsService(ElectronAppSettingsService.fromWindow(window, settingsParser));
  const zoomOverlay = new ZoomOverlayController({
    mountEl: zoomLayerRoot,
    audioDefault: () => settingsService.current.singleClipAudioDefault,
    document,
  });
  zoomOverlay.on('playbackFailed', ({ name, error }) => {
    const problem = `Could not play ${name || 'the selected clip'} in Zoom.`;
    activityReporter.failure(problem, {
      affected: name,
      recovery: 'Close and reopen the clip. If playback still fails, check that the file is available and playable.',
      technicalDetails: activityReporter.technicalDetailsOf(error),
    });
    void diagnostics.logRuntimeError(problem, error);
  });
  zoomOverlay.on('contextMenuRequested', ({ point }) => {
    if (fullscreenAdapter.isDocumentFullScreen()) return;
    workflows.openZoomEditMenu(point);
  });
  eventWiring.require('zoomOverlay', zoomOverlay, ['playbackFailed', 'contextMenuRequested']);
  const fileSystem = new ElectronFileSystemService({ win: window });
  const collectionFileWriter = new CollectionFileWriter(fileSystem, state);
  const collectionRefinementService = ElectronCollectionClipRefinementService.tryCreate(window);
  const clipEditor = new ClipEditor({
    runtimeEditingService: fileSystem,
    videoEditCatalog,
  });
  const utilityHost = AppControllerSupport.optionalElement('globalUtilityHost');
  let utilities: GlobalUtilityCoordinator | null = null;
  const activityLogger = new ActivityLogger({ clock: window });
  const activityReporter = new ActivityReporter(activityLogger);
  const activityIndicatorControl = new ActivityIndicatorControl({
    logger: activityLogger,
    requestPanelClose: () => utilities?.close(),
    writeClipboard: text => navigator.clipboard.writeText(text),
    root: activityIndicatorRoot,
    button: activityIndicatorBtn,
    panel: activityIndicatorPanel,
    listEl: activityIndicatorList,
    document,
    win: window,
    requestPanelOpen: utilityHost ? () => {
      if (activityPanelAutoOpenPolicy.mayOpenAutomatically()) utilities?.open('activity');
    } : undefined,
  });
  const loadStatusControl = new LoadStatusControl({ appText, statusControl: {
    show: (message, timeout) => activityLogger.log({ kind: 'success', message, timeoutMs: timeout }),
  } });
  const audioFeedback = new AudioFeedbackAdapter({ win: window });
  const clock = new ClockAdapter();
  const fullscreenAdapter = new FullscreenAdapter({ doc: document });
  const pipelineFactory = new PipelineFactory();
  const diagnostics = new AppDiagnostics({
    fileSystem,
    validator,
    errorLogFilename: ERROR_LOG_FILENAME,
    getCurrentFolderSession: () => state.currentFolderSession,
  });
  const openFolderRefreshSession = new OpenFolderRefreshSession({
    isActiveFolder: folderPath => fileSystem.isActiveFolder(state.currentFolderSession, folderPath),
    hasUnsavedActiveSequenceChanges: () => pipelineSession.hasDirtyClipSequenceChanges,
    refreshActiveFolder: (): Promise<void> => folderSelection.refreshActiveFolder(),
    onRefreshError: error => {
      const message = 'The clip was saved, but the Collection view could not refresh.';
      activityReporter.failure(message, {
        affected: 'Collection refresh',
        recovery: 'Open the folder again to refresh its clips.',
        technicalDetails: activityReporter.technicalDetailsOf(error),
      });
      void diagnostics.logRuntimeError(message, error, state.currentFolderSession);
    },
  });
  const clipContextMenuController = new ContextMenuController({
    root: clipContextMenu,
    panel: clipContextMenuPanel,
    document,
  });
  const gridContextMenuControl = new GridContextMenuControl({
    contextMenuController: clipContextMenuController,
  });
  const zoomEditMenuControl = new ZoomEditMenuControl({
    contextMenuController: clipContextMenuController,
    videoEditCatalog,
  });
  const collectionSelectorControl = new CollectionSelectorControl({
    appText,
    selectEl: activeCollectionNameEl,
    doc: document,
    pipelineSelectionValue: PIPELINE_SELECTION_VALUE,
    defaultTitle: appText.defaultAppTitle,
  });
  eventWiring.require('collectionSelector', collectionSelectorControl, ['selectionRequested']);
  const mainToolbarControl = new MainToolbarControl({
    appText,
    browseButton: pickBtn,
    fullscreenButton: fsBtn,
    countEl: countSpan,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
    toggleTitlesBtn,
  });





  mainToolbarControl.on('toggleFullscreenRequested', workflows.onFsToggle);
  eventWiring.require('mainToolbar', mainToolbarControl, [
    'browseRequested', 'saveRequested', 'saveAsNewRequested', 'addToCollectionRequested',
    'deleteFromDiskRequested', 'toggleTitlesRequested', 'toggleFullscreenRequested',
  ]);
  const addToCollectionDialogController = new AddToCollectionDialogController({
    dialog: addToCollectionDialog,
    destinationSelect: addToCollectionSelect,
    newCollectionNameLabel: addToCollectionNameLabel,
    newCollectionNameInput: addToCollectionNameInput,
    errorMessageEl: addToCollectionError,
    confirmBtn: confirmAddToCollectionBtn,
    cancelBtn: cancelAddToCollectionBtn,
    newChoiceValue: NEW_COLLECTION_CHOICE_VALUE,
    validateNewName: name => newCollectionNameCheck.problemText(name),
  });

  eventWiring.require('addToCollectionDialog', addToCollectionDialogController, ['confirmed']);
  const collectionConflictController = new CollectionConflictController({
    appText,
    root: collectionConflict,
    summaryEl: collectionConflictSummary,
    listEl: collectionConflictList,
    applyBtn: applyCollectionConflictBtn,
    cancelBtn: cancelCollectionConflictBtn,
  });
  const saveAsNewDialogController = new SaveAsNewDialogController({
    dialog: saveAsNewDialog,
    titleEl: saveAsNewDialogTitle,
    textEl: saveAsNewDialogText,
    nameInput: saveAsNewNameInput,
    errorMessageEl: saveAsNewError,
    confirmBtn: confirmSaveAsNewBtn,
    cancelBtn: cancelSaveAsNewBtn,
    validateName: name => newCollectionNameCheck.problemText(name),
  });

  eventWiring.require('saveAsNewDialog', saveAsNewDialogController, ['confirmed', 'cancelled']);
  const activityPanelAutoOpenPolicy = new ActivityPanelAutoOpenPolicy({
    fullScreen: fullscreenAdapter,
    zoom: zoomOverlay,
    saveAsNewDialog: saveAsNewDialogController,
    collectionConflict: collectionConflictController,
    document,
  });
  const unsavedChangesDialogController = new UnsavedChangesDialogController({
    dialog: unsavedChangesDialog,
    messageEl: unsavedChangesText,
    confirmBtn: confirmUnsavedChangesBtn,
    discardBtn: discardUnsavedChangesBtn,
    cancelBtn: cancelUnsavedChangesBtn,
  });
  const deleteFromDiskDialogController = new DeleteFromDiskDialogController({
    appText,
    preflightDialog: deletePreflightDialog,
    preflightTextEl: deletePreflightText,
    confirmPreflightBtn: confirmDeletePreflightBtn,
    discardPreflightBtn: discardDeletePreflightBtn,
    cancelPreflightBtn: cancelDeletePreflightBtn,
    confirmDialog: deleteFromDiskDialog,
    confirmSummaryEl: deleteFromDiskSummary,
    confirmPreviewEl: deleteFromDiskPreview,
    confirmDeleteBtn: confirmDeleteFromDiskBtn,
    cancelDeleteBtn: cancelDeleteFromDiskBtn,
  });
  const zoomVideoEditWorkflow = new ZoomVideoEditWorkflow({
    clipEditor,
    onStarted: ({ edit, sourceClip }) => {
      collectionView.refreshToolbar();
      activityReporter.progress(appText.videoEditStartedText(edit.label, sourceClip.name));
    },
    onCreated: ({ edit, sourceClip, createdFile }) => {
      const rendererFile = fileSystem.toRendererFile(createdFile);
      const nextZoomClip = workflows.applyCreatedVideoEditResult({
        sourceClip,
        createdFile: rendererFile,
      });

      collectionView.refreshToolbar();
      if (!nextZoomClip) {
        if (workflows.isPipelineMode()) {
          activityReporter.failure(`${appText.videoEditSucceededText(rendererFile.name)} The pipeline view could not be refreshed.`);
        } else {
          activityReporter.failure(appText.videoEditPartialSuccessText(rendererFile.name));
        }
        return;
      }

      workflows.openZoomForClip(nextZoomClip);
      activityReporter.success(appText.videoEditSucceededText(rendererFile.name), 4000);
    },
    onFailed: ({ edit, sourceClip, result }) => {
      collectionView.refreshToolbar();
      activityReporter.failure(appText.videoEditFailedText({
        actionLabel: edit.label,
        code: result?.code,
      }), {
        affected: `${edit.label}: ${sourceClip.name}`,
        recovery: 'Check the source file and output folder before trying the edit again.',
        technicalDetails: `Operation: ${edit.id}\nSource: ${sourceClip.name}\nResult: ${result.code}`,
      });
    },
    onFinished: () => {
      collectionView.refreshToolbar();
    },
  });







  const gridController = new ClipCollectionGridController({
    grid,
    gridRoot: gridWrap,
    toolbar,
    coordinateWorkspaceLayout: true,
    formatLabel: clipLabelFormatter.formatLabel.bind(clipLabelFormatter),
    layoutRules: displayLayoutRules,
    isFullscreen: () => fullscreenAdapter.isDocumentFullScreen(),
  });

  gridController.on('metadataFailed', ({ clip, error }) => {
    void diagnostics.logVideoMetadataFailure({ filename: clip?.name || '', error });
  });

  gridController.on('openClipRequested', workflows.openZoomForClipId);

  gridController.on('contextMenuRequested', ({ point, clipId }) => {
    if (zoomOverlay.isOpen() || fullscreenAdapter.isDocumentFullScreen()) return;
    void workflows.openGridContextMenu(point, clipId);
  });
  const collectionView = new CollectionViewWorkflow({
    pipelineSession,
    openFolder: state,
    grid: gridController,
    toolbar: mainToolbarControl,
    selector: collectionSelectorControl,
    surfaces: {
      collectionConflict: collectionConflictController,
      contextMenu: clipContextMenuController,
      addToCollectionDialog: addToCollectionDialogController,
      zoom: zoomOverlay,
    },
    reporter: activityReporter,
    appText,
  });
  const collectionSave = new CollectionSaveWorkflow({
    pipelineSession,
    fileWriter: collectionFileWriter,
    saveAsNewDialog: saveAsNewDialogController,
    toolbar: mainToolbarControl,
    nameCheck: newCollectionNameCheck,
    grid: gridController,
    collectionView,
    folderRefresh: openFolderRefreshSession,
    reporter: activityReporter,
    appText,
  });
  const addToCollection = new AddToCollectionWorkflow({
    pipelineSession,
    grid: gridController,
    dialog: addToCollectionDialogController,
    destinationChoices: AddToCollectionDialogController,
    toolbar: mainToolbarControl,
    nameCheck: newCollectionNameCheck,
    fileWriter: collectionFileWriter,
    collectionView,
    reporter: activityReporter,
    appText,
  });
  const pipelinesPanelHost = AppControllerSupport.optionalElement('pipelinesPanelHost');
  const pipelineCatalogControl = pipelinesPanelHost ? new PipelineCatalogControl({
    host: pipelinesPanelHost,
    catalog: fileSystem,
    document,
  }) : null;
  if (pipelineCatalogControl) {
    pipelineCatalogControl.on('failed', ({ message, error }) => {
      activityReporter.failure(message, {
        affected: 'Pipelines',
        recovery: 'Check the Pipelines top folder in Settings, then try again.',
        technicalDetails: activityReporter.technicalDetailsOf(error),
      });
      void diagnostics.logRuntimeError(message, error);
    });
    eventWiring.require('pipelineCatalog', pipelineCatalogControl, ['loadRequested', 'failed']);
  }
  const folderSelection = new FolderSelectionWorkflow({
    pipelineSession,
    openFolder: state,
    folders: fileSystem,
    pipelineFactory,
    collectionFileValidator: validator,
    diagnostics,
    grid: gridController,
    collectionView,
    missingClipsPrompt: collectionConflictController,
    unsavedChangesPrompt: unsavedChangesDialogController,
    loadStatus: loadStatusControl,
    collectionSave,
    screens: { showCollectionScreen: () => shell.activate(collectionScreen.id) },
    settingsLoaded: () => settingsReady,
    toolbar: mainToolbarControl,
    selector: collectionSelectorControl,
    catalog: pipelineCatalogControl,
    reporter: activityReporter,
    appText,
  });
  const deleteFromDisk = new DeleteFromDiskWorkflow({
    pipelineSession,
    openFolder: state,
    files: fileSystem,
    fileWriter: collectionFileWriter,
    dialog: deleteFromDiskDialogController,
    grid: gridController,
    toolbar: mainToolbarControl,
    zoom: zoomOverlay,
    collectionSave,
    folderSelection,
    collectionView,
    diagnostics,
    reporter: activityReporter,
    appText,
  });
  eventWiring.require('clipGrid', gridController, [
    'cardCountChanged', 'selectionChanged', 'orderChanged', 'openClipRequested',
    'removeSelectedRequested', 'contextMenuRequested', 'metadataFailed',
  ]);

  const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = gridController;

  const fullscreenSession = new FullscreenSession({
    body,
    setFullscreenButtonState: active => mainToolbarControl.setFullscreenButtonState(active),
    isTitlesHidden: () => gridController.areTitlesHidden(),
    setTitlesHidden: hidden => collectionView.setTitlesHidden(hidden),
    enterFullScreenAdapter: fullscreenAdapter.enterFullScreen.bind(fullscreenAdapter),
    exitFullScreenAdapter: fullscreenAdapter.exitFullScreen.bind(fullscreenAdapter),
    isFullscreen: () => fullscreenAdapter.isDocumentFullScreen(),
    fsApplySlots,
    rotateVisibleClip: () => gridController.rotateVisibleClip(),
    cancelRotation: () => gridController.cancelRotation(),
    fsRestore,
    computeGrid,
    showStatus: activityReporter.success,
    layoutRules: displayLayoutRules,
    appText,
    every: clock.every.bind(clock),
    clearClock: clock.clear.bind(clock),
  });
  const appKeyDownHandler = new AppKeyDownHandler({
    saveAsNewDialogController,
    addToCollectionDialogController,
    deleteFromDiskDialogController,
    unsavedChangesDialogController,
    zoomOverlay,
    gridController,
    isFullscreen: () => fullscreenAdapter.isDocumentFullScreen(),
    closeZoom: workflows.closeZoom,
    browseZoomByOffset: workflows.browseZoomByOffset,
    openZoomForClipId: workflows.openZoomForClipId,
  });











  new OrderMenuController({
    orderMenu,
    orderMenuBtn,
    orderMenuPanel,
    loadOrderBtn: null,
    saveBtn,
    saveAsNewBtn,
    addToCollectionBtn,
    deleteFromDiskBtn,
  });

  workflows.clearLoadedState();
  recomputeLayout();
  collectionView.setTitlesHidden(false);
  const settingsScreen = new SettingsScreen(settingsService, {
    progress: activityReporter.progress,
    success: activityReporter.success,
    error: activityReporter.failure,
    pipelinesRootChanged: () => { void pipelineCatalogControl?.load(); },
  });
  const keyboardPanel = utilityHost ? AppControllerSupport.requiredElement('keyboardMapPanel') : null;
  const keyboardMap = keyboardPanel ? new KeyboardMapControl(keyboardPanel, GLOBAL_UTILITY_SHORTCUTS, () => utilities?.close()) : null;
  const collectionScreen = new CollectionScreen(AppControllerSupport.requiredElement('collectionScreen'), toolbar, gridController, mainToolbarControl);
  const frameReviewPlayer = new FrameReviewPlayerControl({ document, fullScreen: fullscreenAdapter });
  const gifWorkflowKeyboard = new GifWorkflowKeyboardController();
  const gifRangesPanel = AppControllerSupport.optionalElement('gifRangesPanel') ?? undefined;
  let gifExtractionSession: GifExtractionSession | undefined;
  let collectionRefinementSession: GifExtractionSession | undefined;
  let gifRangesPanelControl: GifRangesPanelControl | undefined;
  let collectionRangesPanelControl: GifRangesPanelControl | undefined;
  let refineGifScreen: RefineGifScreen;
  let collectionRefineScreen: RefineGifScreen;
  let shell: ApplicationShellController;
  let refineSelectionRevision = 0;
  let collectionRefineRevision = 0;
  // Non-Electron DOM tests and unsupported hosts keep the shell available without native movie opening.
  const gifServices = AppControllerSupport.gifSessionServices(window);
  const collectionRefinementGifServices = gifServices && collectionRefinementService
    ? AppControllerSupport.gifSessionServices(window)
    : null;
  if (gifServices) {
    gifExtractionSession = new GifExtractionSession(
      gifServices.frameReview,
      gifServices.thumbnails,
      {
        extractionService: gifServices.extractionService,
        captureStore: gifServices.captureStore,
        onRestoredCaptures: (review, endpoint) => frameReviewPlayer.showFrameAfterCapture(review, endpoint),
        onPublished: publication => openFolderRefreshSession.onFolderContentsPublished(publication.folderPath),
        onProgress: activityReporter.progress,
        onSuccess: activityReporter.success,
        onActivity: entry => { activityLogger.log(entry); },
        onWarning: message => activityReporter.success(message, 5000),
        onError: (message, error) => {
          activityReporter.failure(message);
          if (error !== undefined) void diagnostics.logRuntimeError(message, error);
        },
      },
    );
    if (collectionRefinementGifServices) {
      collectionRefinementSession = new GifExtractionSession(
        collectionRefinementGifServices.frameReview,
        collectionRefinementGifServices.thumbnails,
        {
          extractionService: collectionRefinementGifServices.extractionService,
          onPublished: publication => openFolderRefreshSession.onFolderContentsPublished(publication.folderPath),
          onProgress: activityReporter.progress,
          onSuccess: activityReporter.success,
          onActivity: entry => { activityLogger.log(entry); },
          onWarning: message => activityReporter.success(message, 5000),
          onError: (message, error) => {
            activityReporter.failure(message);
            if (error !== undefined) void diagnostics.logRuntimeError(message, error);
          },
        },
      );
      if (gifRangesPanel) {
        const collectionRangesPanel = document.createElement('section');
        collectionRangesPanel.setAttribute('aria-label', 'Refined collection clip');
        collectionRangesPanelControl = new GifRangesPanelControl(collectionRangesPanel, collectionRefinementSession, {
          document, player: frameReviewPlayer,
        });
        collectionRangesPanelControl.on('refineRequested', rangeId => {
          const started = collectionRefinementSession?.beginRefinement(rangeId);
          if (started?.kind === 'rejected') activityReporter.failure(started.message);
        });
        eventWiring.require('collectionRangesPanel', collectionRangesPanelControl, ['refineRequested']);
      }
    }
    if (gifRangesPanel) {
      gifRangesPanelControl = new GifRangesPanelControl(gifRangesPanel, gifExtractionSession, {
        document,
        player: frameReviewPlayer,
      });
      gifRangesPanelControl.on('refineRequested', rangeId => { void (async () => {
        const revision = ++refineSelectionRevision;
        if (!await gifExtractionSession?.prepareSavedRange(rangeId)) return;
        if (revision !== refineSelectionRevision) return;
        const result = gifExtractionSession?.beginRefinement(rangeId);
        if (result?.kind === 'started') shell.activate(refineGifScreen.id);
        else if (result?.kind === 'rejected') activityReporter.failure(result.message);
      })(); });
      eventWiring.require('gifRangesPanel', gifRangesPanelControl, ['refineRequested']);
    }
  }
  const gifExtractionScreen = new GifExtractionScreen({
    player: frameReviewPlayer,
    keyboard: gifWorkflowKeyboard,
    session: gifExtractionSession,
    rangesPanel: gifRangesPanelControl,
    document,
  });
  refineGifScreen = new RefineGifScreen({
    player: frameReviewPlayer,
    keyboard: gifWorkflowKeyboard,
    session: gifExtractionSession,
    rangesPanel: gifRangesPanelControl,
    document,
  });
  refineGifScreen.on('backRequested', rangeId => {
    shell.activate(gifExtractionScreen.id);
    if (rangeId) gifRangesPanelControl?.focusRange(rangeId);
  });
  eventWiring.require('refineGifScreen', refineGifScreen, ['backRequested']);
  collectionRefineScreen = new RefineGifScreen({
    id: 'collection-refine',
    label: 'Refine Clip',
    returnLabel: 'Back to Collection',
    singleRange: true,
    player: frameReviewPlayer,
    keyboard: gifWorkflowKeyboard,
    session: collectionRefinementSession,
    rangesPanel: collectionRangesPanelControl,
    document,
  });
  collectionRefineScreen.on('backRequested', () => {
    shell.activate(collectionScreen.id);
    if (shell.activeScreen === collectionScreen) {
      collectionRefineRevision += 1;
      collectionRefineScreen.showPreparation(null);
    }
  });
  eventWiring.require('collectionRefineScreen', collectionRefineScreen, ['backRequested']);
  const refineScreenLeavePolicy = new RefineScreenLeavePolicy(
    collectionRefineScreen.id, collectionRefinementSession ?? null, activityReporter.progress);
  startCollectionRefinement = async (request, collectionFilename) => {
    const session = collectionRefinementSession;
    const service = collectionRefinementService;
    if (!session || !service) return;
    const revision = ++collectionRefineRevision;
    try {
      if (pipelineSession.hasDirtyClipSequenceChanges) {
        activityReporter.failure('Save or discard the current changes before refining a clip.');
        return;
      }
      session.setExtractionDestination(collectionFilename
        ? { kind: 'collection', folderPath: request.folderPath, collectionFilename }
        : { kind: 'folder', folderPath: request.folderPath });
      collectionRefineScreen.showPreparation(`Finding the original movie for ${request.filename}…`);
      shell.activate(collectionRefineScreen.id);
      const resolved = await service.resolve(request);
      if (revision !== collectionRefineRevision || shell.activeScreen !== collectionRefineScreen) return;
      if (resolved.kind === 'cancelled') {
        shell.activate(collectionScreen.id);
        collectionRefineScreen.showPreparation(null);
        return;
      }
      if (request.folderPath !== (fileSystem.canMutateDisk(state.currentFolderSession)
        ? state.currentFolderSession.folderPath : null)
        || collectionFilename !== workflows.activeCollectionFilename()) return;
      collectionRefineScreen.showPreparation('Opening the original movie…');
      await session.openCollectionSource(resolved.source);
      if (revision !== collectionRefineRevision || shell.activeScreen !== collectionRefineScreen) return;
      collectionRefineScreen.showPreparation('Preparing exact frames and checking the clip range…');
      const started = await session.importCollectionRange(resolved.range);
      if (revision !== collectionRefineRevision || shell.activeScreen !== collectionRefineScreen) {
        session.abandonRefinement();
        return;
      }
      if (started.kind === 'rejected') {
        collectionRefineScreen.showPreparation(started.message, false);
        activityReporter.failure(started.message);
      } else collectionRefineScreen.showPreparation(null);
    } catch (error) {
      if (revision !== collectionRefineRevision || shell.activeScreen !== collectionRefineScreen) return;
      const message = error instanceof Error ? error.message : 'The clip could not be opened for refinement.';
      collectionRefineScreen.showPreparation(message, false);
      activityReporter.failure(message);
      void diagnostics.logRuntimeError(message, error);
    }
  };
  const panels = ['pipelines', 'clips'].flatMap(name => {
    const root = AppControllerSupport.optionalElement(`${name}Panel`);
    const contributionHost = AppControllerSupport.optionalElement(name === 'pipelines' ? 'pipelinesPanelMount' : `${name}PanelHost`);
    if (!root || !contributionHost) return [];
    const label = name[0].toUpperCase() + name.slice(1);
    return [{
      id: name,
      root,
      content: AppControllerSupport.requiredElement(`${name}PanelContent`),
      contributionHost,
      fallbackContent: AppControllerSupport.optionalElement(name === 'pipelines' ? 'pipelinesPanelHost' : `${name}PanelFallback`) ?? undefined,
      foldButton: AppControllerSupport.requiredElement<HTMLButtonElement>(`fold${label}`),
      revealButton: AppControllerSupport.requiredElement<HTMLButtonElement>(`reveal${label}`),
    }];
  });
  shell = new ApplicationShellController({
    screenHost: AppControllerSupport.requiredElement('mainScreenHost'),
    commandHost: AppControllerSupport.requiredElement('screenCommandHost'),
    selector: AppControllerSupport.requiredElement<HTMLSelectElement>('appScreenSelector'),
    selectorHost: AppControllerSupport.requiredElement('appScreenSwitcher'),
    initialScreenId: settingsService.current.startupScreenId ?? DEFAULT_STARTUP_SCREEN_ID,
    screens: [gifExtractionScreen, collectionScreen, refineGifScreen, collectionRefineScreen, settingsScreen],
    canLeaveScreen: current => refineScreenLeavePolicy.canLeave(current),
    workspace: AppControllerSupport.optionalElement('workspaceRow') ?? undefined,
    center: AppControllerSupport.optionalElement('centralWorkspace') ?? undefined,
    panels,
  });
  shell.on('screenChanged', screen => keyboardMap?.render(screen));
  shell.on('boundsChanging', ({ screen, width, durationMs }) => {
    if (screen === collectionScreen) gridController.beginWorkspaceResize(width, durationMs);
  });
  shell.on('boundsSettled', screen => {
    if (screen === collectionScreen) gridController.endWorkspaceResize();
  });
  eventWiring.require('applicationShell', shell, ['screenChanged', 'boundsChanging', 'boundsSettled']);
  shell.start();
  if (utilityHost && keyboardPanel && keyboardMap) {
    utilities = new GlobalUtilityCoordinator(utilityHost, [
      { id: 'keyboard', label: 'Keyboard shortcuts', trigger: AppControllerSupport.requiredElement<HTMLButtonElement>('keyboardMapBtn'), panel: keyboardPanel, focusInitial: () => keyboardMap.focusInitial() },
      { id: 'activity', label: 'Activity and Errors', trigger: activityIndicatorBtn, panel: activityIndicatorPanel, focusInitial: () => activityIndicatorControl.focusInitial() },
    ]);
  }
  AppControllerSupport.requiredElement<HTMLSelectElement>('appScreenSelector').addEventListener('change', () => {
    if (zoomOverlay.isOpen()) workflows.closeZoom();
  });
  AppControllerSupport.optionalElement<HTMLButtonElement>('settingsBtn')?.addEventListener('click', () => {
    utilities?.close(false);
    if (zoomOverlay.isOpen()) workflows.closeZoom();
    shell.activate(settingsScreen.id);
  });
  const settingsReady = settingsScreen.load();
  const initialScreenId = shell.activeScreen.id;
  void settingsReady.then(() => {
    void pipelineCatalogControl?.load();
    if (shell.activeScreen.id === initialScreenId && shell.activeScreen.id !== settingsService.current.startupScreenId) {
      shell.activate(settingsService.current.startupScreenId);
    }
  });
  const workspaceResize = new ResizeObserver(() => { if (!shell.workspaceMoving) recomputeLayout(); });
  workspaceResize.observe(gridWrap);
  const shutdown = new ApplicationShutdownCoordinator({
    stopActions: () => {
      fullscreenSession.destroy();
      workspaceResize.disconnect();
      shell.destroy();
    },
    disposeWorkflow: async () => {
      collectionView.dispose();
      collectionSave.dispose();
      addToCollection.dispose();
      folderSelection.dispose();
      deleteFromDisk.dispose();
      await Promise.all([gifExtractionSession?.dispose(), collectionRefinementSession?.dispose()]);
    },
    destroyControls: () => {
      gridController.destroy();
      gifExtractionScreen.destroy();
      refineGifScreen.destroy();
      collectionRefineScreen.destroy();
      gifRangesPanelControl?.destroy();
      collectionRangesPanelControl?.destroy();
      frameReviewPlayer.destroy();
      utilities?.destroy();
      activityIndicatorControl.destroy();
      activityLogger.destroy();
      pipelineCatalogControl?.destroy();
      collectionSelectorControl.destroy();
      mainToolbarControl.destroy();
    },
    reportFailure: error => {
      void diagnostics.logRuntimeError('Failed to dispose the GIF extraction workflow during shutdown.', error);
    },
  });
  new ApplicationEventController({
    document,
    window,
    onFullscreenChange: workflows.onFsChange,
    onResize: recomputeLayout,
    onKeyDown: event => {
      workflows.onKeyDown(event);
      if (!event.defaultPrevented && shell.activeScreen !== collectionScreen) gifWorkflowKeyboard.handleKeyDown(event);
    },
    onGlobalKeyDown: workflows.onGlobalKeyDown,
    onKeyUp: event => gifWorkflowKeyboard.handleKeyUp(event),
    onWindowBlur: () => gifWorkflowKeyboard.releaseHeldSteps(),
    onPageHide: () => { void shutdown.begin(); },
  });
  }
}
