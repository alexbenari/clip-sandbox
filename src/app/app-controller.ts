import { GlobalUtilityCoordinator, GLOBAL_UTILITY_SHORTCUTS } from '../ui/global-utility-coordinator.js';
import { KeyboardMapControl } from '../ui/keyboard-map-control.js';
import { PipelineFactory } from '../business-logic/PipelineFactory.js';
import { ClipEditor } from '../business-logic/clip-editor.js';
import { VideoEditCatalog } from '../business-logic/video-edit-catalog.js';
import { AppSessionState } from './app-session-state.js';
import { PipelineSession } from './pipeline-session.js';
import { FullscreenAdapter } from '../adapters/browser/fullscreen-adapter.js';
import { ElectronFileSystemService } from '../adapters/electron/electron-file-system-service.js';
import { ClockAdapter } from '../adapters/browser/clock-adapter.js';
import { AudioFeedbackAdapter } from '../adapters/browser/audio-feedback-adapter.js';
import { FullscreenSession } from './fullscreen-session.js';
import { AppDiagnostics } from './app-diagnostics.js';
import { AppKeyDownHandler } from './app-keydown-handler.js';
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
import { ZoomWorkflow } from './zoom-workflow.js';
import { CollectionRefinementWorkflow } from './collection-refinement-workflow.js';
import { GridContextMenuWorkflow } from './grid-context-menu-workflow.js';
import { GifRangeRefinementWorkflow } from './gif-range-refinement-workflow.js';
import { FullScreenChangeWorkflow } from './full-screen-change-workflow.js';
import { RefineScreenLeavePolicy } from './refine-screen-leave-policy.js';
import { ActivityPanelAutoOpenPolicy } from '../ui/activity-panel-auto-open-policy.js';
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
import { DocumentElements } from '../ui/document-elements.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { OpenFolderRefreshSession } from './open-folder-refresh-session.js';
import { PipelineCatalogControl } from '../ui/pipeline-catalog-control.js';

const ERROR_LOG_FILENAME = 'err.log';
const NEW_COLLECTION_CHOICE_VALUE = '__new_collection__';
const PIPELINE_SELECTION_VALUE = '__pipeline__';

class AppControllerSupport {
  static gifSessionServices(win: Window) {
    const frameReview = ElectronFrameReviewService.tryCreate(win);
    const thumbnails = ElectronThumbnailCacheService.tryCreate(win);
    const extractionService = ElectronClipExtractionService.tryCreate(win);
    const captureStore = ElectronClipCapturesStoreService.tryCreate(win);
    if (!frameReview || !thumbnails || !extractionService || !captureStore) return null;
    return { frameReview, thumbnails, extractionService, captureStore };
  }
}

// The composition root: builds services, controls and workflows in dependency order, then starts the app.
export class AppController {
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Page elements.
    const elements = new DocumentElements(document);
    const grid = elements.required('grid');
    const gridWrap = elements.required('gridWrap');
    const activeCollectionNameEl = elements.required<HTMLSelectElement>('activeCollectionName');
    const toolbar = elements.required('toolbar');
    const zoomLayerRoot = elements.required('zoomLayerRoot');
    const body = document.body;

    // Application services and adapters.
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
    const fileSystem = new ElectronFileSystemService({ win: window });
    const collectionFileWriter = new CollectionFileWriter(fileSystem, state);
    const collectionRefinementService = ElectronCollectionClipRefinementService.tryCreate(window);
    const clipEditor = new ClipEditor({ runtimeEditingService: fileSystem, videoEditCatalog });
    const activityLogger = new ActivityLogger({ clock: window });
    const activityReporter = new ActivityReporter(activityLogger);
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
    // Non-Electron DOM tests and unsupported hosts keep the shell available without native movie opening.
    const gifServices = AppControllerSupport.gifSessionServices(window);
    const collectionRefinementGifServices = gifServices && collectionRefinementService
      ? AppControllerSupport.gifSessionServices(window)
      : null;

    // Controls.
    const zoomOverlay = new ZoomOverlayController({
      mountEl: zoomLayerRoot,
      audioDefault: () => settingsService.current.singleClipAudioDefault,
      document,
    });
    eventWiring.require('zoomOverlay', zoomOverlay, ['playbackFailed', 'contextMenuRequested']);
    const clipContextMenuController = ContextMenuController.forClipMenu(document);
    const gridContextMenuControl = new GridContextMenuControl({ contextMenuController: clipContextMenuController });
    const zoomEditMenuControl = new ZoomEditMenuControl({ contextMenuController: clipContextMenuController, videoEditCatalog });
    const collectionSelectorControl = new CollectionSelectorControl({
      appText,
      selectEl: activeCollectionNameEl,
      doc: document,
      pipelineSelectionValue: PIPELINE_SELECTION_VALUE,
      defaultTitle: appText.defaultAppTitle,
    });
    eventWiring.require('collectionSelector', collectionSelectorControl, ['selectionRequested']);
    const mainToolbarControl = MainToolbarControl.fromDocument(document, { appText });
    eventWiring.require('mainToolbar', mainToolbarControl, [
      'browseRequested', 'saveRequested', 'saveAsNewRequested', 'addToCollectionRequested',
      'deleteFromDiskRequested', 'toggleTitlesRequested', 'toggleFullscreenRequested',
    ]);
    const addToCollectionDialogController = AddToCollectionDialogController.fromDocument(document, {
      newChoiceValue: NEW_COLLECTION_CHOICE_VALUE,
      validateNewName: name => newCollectionNameCheck.problemText(name),
    });
    eventWiring.require('addToCollectionDialog', addToCollectionDialogController, ['confirmed']);
    const collectionConflictController = CollectionConflictController.fromDocument(document, { appText });
    const saveAsNewDialogController = SaveAsNewDialogController.fromDocument(document, {
      validateName: name => newCollectionNameCheck.problemText(name),
    });
    eventWiring.require('saveAsNewDialog', saveAsNewDialogController, ['confirmed', 'cancelled']);
    const unsavedChangesDialogController = UnsavedChangesDialogController.fromDocument(document);
    const deleteFromDiskDialogController = DeleteFromDiskDialogController.fromDocument(document, { appText });
    const activityPanelAutoOpenPolicy = new ActivityPanelAutoOpenPolicy({
      fullScreen: fullscreenAdapter,
      zoom: zoomOverlay,
      saveAsNewDialog: saveAsNewDialogController,
      collectionConflict: collectionConflictController,
      document,
    });
    // The Activity control and the utility coordinator each refer to the other, so these callbacks resolve `utilities` when called.
    const utilityHost = elements.optional('globalUtilityHost');
    const activityIndicatorControl = ActivityIndicatorControl.fromDocument(document, {
      logger: activityLogger,
      requestPanelClose: () => utilities?.close(),
      writeClipboard: text => navigator.clipboard.writeText(text),
      win: window,
      requestPanelOpen: utilityHost ? () => {
        if (activityPanelAutoOpenPolicy.mayOpenAutomatically()) utilities?.open('activity');
      } : undefined,
    });
    const loadStatusControl = new LoadStatusControl({ appText, statusControl: {
      show: (message, timeout) => activityLogger.log({ kind: 'success', message, timeoutMs: timeout }),
    } });
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
    eventWiring.require('clipGrid', gridController, [
      'cardCountChanged', 'selectionChanged', 'orderChanged', 'openClipRequested',
      'removeSelectedRequested', 'contextMenuRequested', 'metadataFailed',
    ]);
    const { recomputeLayout, computeGrid, fsApplySlots, fsRestore } = gridController;
    const pipelinesPanelHost = elements.optional('pipelinesPanelHost');
    const pipelineCatalogControl = pipelinesPanelHost
      ? new PipelineCatalogControl({ host: pipelinesPanelHost, catalog: fileSystem, document })
      : null;
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
    const settingsScreen = new SettingsScreen(settingsService, {
      progress: activityReporter.progress,
      success: activityReporter.success,
      error: activityReporter.failure,
      pipelinesRootChanged: () => { void pipelineCatalogControl?.load(); },
    });
    const keyboardPanel = utilityHost ? elements.required('keyboardMapPanel') : null;
    const keyboardMap = keyboardPanel ? new KeyboardMapControl(keyboardPanel, GLOBAL_UTILITY_SHORTCUTS, () => utilities?.close()) : null;
    const collectionScreen = new CollectionScreen(elements.required('collectionScreen'), toolbar, gridController, mainToolbarControl);
    const frameReviewPlayer = new FrameReviewPlayerControl({ document, fullScreen: fullscreenAdapter });
    const gifWorkflowKeyboard = new GifWorkflowKeyboardController();
    const gifRangesPanel = elements.optional('gifRangesPanel');
    const shellPanels = ApplicationShellController.sidePanelsIn(document);
    const sessionReporting = {
      onProgress: activityReporter.progress,
      onSuccess: activityReporter.success,
      onActivity: (entry: Parameters<ActivityLogger['log']>[0]) => { activityLogger.log(entry); },
      onWarning: (message: string) => activityReporter.success(message, 5000),
      onError: (message: string, error?: unknown) => {
        activityReporter.failure(message);
        if (error !== undefined) void diagnostics.logRuntimeError(message, error);
      },
      onPublished: (publication: { folderPath: string }) => openFolderRefreshSession.onFolderContentsPublished(publication.folderPath),
    };
    const gifExtractionSession = gifServices
      ? new GifExtractionSession(gifServices.frameReview, gifServices.thumbnails, {
        ...sessionReporting,
        extractionService: gifServices.extractionService,
        captureStore: gifServices.captureStore,
        onRestoredCaptures: (review, endpoint) => frameReviewPlayer.showFrameAfterCapture(review, endpoint),
      })
      : null;
    const collectionRefinementSession = collectionRefinementGifServices
      ? new GifExtractionSession(collectionRefinementGifServices.frameReview, collectionRefinementGifServices.thumbnails, {
        ...sessionReporting,
        extractionService: collectionRefinementGifServices.extractionService,
      })
      : null;
    const gifRangesPanelControl = gifExtractionSession && gifRangesPanel
      ? new GifRangesPanelControl(gifRangesPanel, gifExtractionSession, { document, player: frameReviewPlayer })
      : null;
    // The refined-clip panel mounts into the shell's Clips panel, so it exists only where that panel does.
    const collectionRangesPanelControl = collectionRefinementSession && shellPanels.some(panel => panel.id === 'clips')
      ? GifRangesPanelControl.forCollectionRefinement(collectionRefinementSession, { document, player: frameReviewPlayer })
      : null;
    if (gifRangesPanelControl) eventWiring.require('gifRangesPanel', gifRangesPanelControl, ['refineRequested']);
    if (collectionRangesPanelControl) eventWiring.require('collectionRangesPanel', collectionRangesPanelControl, ['refineRequested']);
    const gifExtractionScreen = new GifExtractionScreen({
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: gifExtractionSession ?? undefined,
      rangesPanel: gifRangesPanelControl ?? undefined,
      document,
    });
    const refineGifScreen = new RefineGifScreen({
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: gifExtractionSession ?? undefined,
      rangesPanel: gifRangesPanelControl ?? undefined,
      document,
    });
    eventWiring.require('refineGifScreen', refineGifScreen, ['backRequested']);
    const collectionRefineScreen = new RefineGifScreen({
      id: 'collection-refine',
      label: 'Refine Clip',
      returnLabel: 'Back to Collection',
      singleRange: true,
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: collectionRefinementSession ?? undefined,
      rangesPanel: collectionRangesPanelControl ?? undefined,
      document,
    });
    eventWiring.require('collectionRefineScreen', collectionRefineScreen, ['backRequested']);
    const refineScreenLeavePolicy = new RefineScreenLeavePolicy(
      collectionRefineScreen.id, collectionRefinementSession, activityReporter.progress);
    const shell = new ApplicationShellController({
      screenHost: elements.required('mainScreenHost'),
      commandHost: elements.required('screenCommandHost'),
      selector: elements.required<HTMLSelectElement>('appScreenSelector'),
      selectorHost: elements.required('appScreenSwitcher'),
      initialScreenId: settingsService.current.startupScreenId ?? DEFAULT_STARTUP_SCREEN_ID,
      screens: [gifExtractionScreen, collectionScreen, refineGifScreen, collectionRefineScreen, settingsScreen],
      canLeaveScreen: current => refineScreenLeavePolicy.canLeave(current),
      workspace: elements.optional('workspaceRow') ?? undefined,
      center: elements.optional('centralWorkspace') ?? undefined,
      panels: shellPanels,
    });
    shell.on('screenChanged', screen => keyboardMap?.render(screen));
    shell.on('boundsChanging', ({ screen, width, durationMs }) => {
      if (screen === collectionScreen) gridController.beginWorkspaceResize(width, durationMs);
    });
    shell.on('boundsSettled', screen => {
      if (screen === collectionScreen) gridController.endWorkspaceResize();
    });
    eventWiring.require('applicationShell', shell, ['screenChanged', 'boundsChanging', 'boundsSettled']);
    const activityUtility = activityIndicatorControl.utilitySurface();
    const utilities = utilityHost && keyboardPanel && keyboardMap && activityUtility
      ? new GlobalUtilityCoordinator(utilityHost, [
        { id: 'keyboard', label: 'Keyboard shortcuts', trigger: elements.required<HTMLButtonElement>('keyboardMapBtn'), panel: keyboardPanel, focusInitial: () => keyboardMap.focusInitial() },
        { id: 'activity', ...activityUtility },
      ])
      : null;

    // Workflows.
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
    // Saving refreshes the open folder through folder selection, which itself saves first; the callback below closes that loop.
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
    const zoom = new ZoomWorkflow({
      pipelineSession,
      openFolder: state,
      folderFiles: fileSystem,
      zoom: zoomOverlay,
      grid: gridController,
      contextMenu: clipContextMenuController,
      editMenu: zoomEditMenuControl,
      clipEditor,
      fullScreen: fullscreenAdapter,
      boundaryFeedback: audioFeedback,
      collectionView,
      diagnostics,
      reporter: activityReporter,
      appText,
    });
    const collectionRefinement = new CollectionRefinementWorkflow({
      refinementSession: collectionRefinementSession,
      sourceLookup: collectionRefinementService,
      refineScreen: collectionRefineScreen,
      refinedClipList: collectionRangesPanelControl,
      navigation: shell,
      collectionScreenId: collectionScreen.id,
      pipelineSession,
      openFolder: state,
      folders: fileSystem,
      diagnostics,
      reporter: activityReporter,
    });
    const gridContextMenu = new GridContextMenuWorkflow({
      pipelineSession,
      openFolder: state,
      folders: fileSystem,
      refinementAvailability: collectionRefinementService,
      grid: gridController,
      menu: gridContextMenuControl,
      navigation: shell,
      collectionScreenId: collectionScreen.id,
      zoom: zoomOverlay,
      fullScreen: fullscreenAdapter,
      addToCollection,
      deleteFromDisk,
      collectionRefinement,
    });
    const gifRangeRefinement = new GifRangeRefinementWorkflow({
      session: gifExtractionSession,
      captureList: gifRangesPanelControl,
      refineScreen: refineGifScreen,
      extractionScreenId: gifExtractionScreen.id,
      navigation: shell,
      reporter: activityReporter,
    });
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
    mainToolbarControl.on('toggleFullscreenRequested', () => {
      if (zoom.isOpen()) zoom.close();
      fullscreenSession.onFsToggle();
    });
    const fullScreenChange = new FullScreenChangeWorkflow({
      utilities,
      moviePlayer: frameReviewPlayer,
      heldSteps: gifWorkflowKeyboard,
      fullScreen: fullscreenAdapter,
      zoom,
      collectionFullScreen: fullscreenSession,
      pipelineSession,
      collectionView,
    });
    const appKeyDownHandler = new AppKeyDownHandler({
      saveAsNewDialogController,
      addToCollectionDialogController,
      deleteFromDiskDialogController,
      unsavedChangesDialogController,
      zoomOverlay,
      gridController,
      isFullscreen: () => fullscreenAdapter.isDocumentFullScreen(),
      closeZoom: () => zoom.close(),
      browseZoomByOffset: offset => zoom.browseByOffset(offset),
      openZoomForClipId: clipId => zoom.openClipById(clipId),
    });
    eventWiring.assertComplete();

    // Startup: show an empty Collection view, activate the first screen, then load settings.
    collectionConflictController.hide();
    deleteFromDisk.discardPendingRequest();
    collectionSave.cancelSaveAsNew();
    addToCollectionDialogController.close();
    unsavedChangesDialogController.close();
    zoom.close();
    collectionView.clearLoadedView();
    recomputeLayout();
    collectionView.setTitlesHidden(false);
    shell.start();
    elements.required<HTMLSelectElement>('appScreenSelector').addEventListener('change', () => {
      if (zoom.isOpen()) zoom.close();
    });
    elements.optional<HTMLButtonElement>('settingsBtn')?.addEventListener('click', () => {
      utilities?.close(false);
      if (zoom.isOpen()) zoom.close();
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
        for (const workflow of [collectionView, collectionSave, addToCollection, folderSelection, deleteFromDisk,
          zoom, collectionRefinement, gridContextMenu, gifRangeRefinement]) workflow.dispose();
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
      onFullscreenChange: () => fullScreenChange.handleFullScreenChange(),
      onResize: recomputeLayout,
      onKeyDown: event => {
        if (!utilities?.isOpen && !event.defaultPrevented && shell.activeScreen === collectionScreen) appKeyDownHandler.handle(event);
        if (!event.defaultPrevented && shell.activeScreen !== collectionScreen) gifWorkflowKeyboard.handleKeyDown(event);
      },
      onGlobalKeyDown: event => {
        if (utilities?.isOpen || event.defaultPrevented) return;
        if (shell.activeScreen === collectionScreen) fullscreenSession.onGlobalKeyDown(event);
      },
      onKeyUp: event => gifWorkflowKeyboard.handleKeyUp(event),
      onWindowBlur: () => gifWorkflowKeyboard.releaseHeldSteps(),
      onPageHide: () => { void shutdown.begin(); },
    });
  }
}
