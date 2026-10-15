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
import { AppText } from './app-text.js';
import { CollectionNameValidator } from './collection-name-validator.js';
import { NewCollectionNameCheck } from './new-collection-name-check.js';
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
import { SettingsWorkflow } from './settings-workflow.js';
import { RefineScreenLeavePolicy } from './refine-screen-leave-policy.js';
import { ActivityPanelAutoOpenPolicy } from '../ui/activity-panel-auto-open-policy.js';
import { AddToCollectionDialogControl } from '../ui/add-to-collection-dialog-control.js';
import { CollectionSelectorControl } from '../ui/collection-selector-control.js';
import { MainToolbarControl } from '../ui/main-toolbar-control.js';
import { ApplicationShellControl } from '../ui/application-shell-control.js';
import { CollectionScreen } from '../ui/collection-screen.js';
import { SettingsScreen } from '../ui/settings-screen.js';
import { GifExtractionScreen } from '../ui/gif-extraction-screen.js';
import { RefineGifScreen } from '../ui/refine-gif-screen.js';
import { FrameReviewPlayerControl } from '../ui/frame-review-player-control.js';
import { GifWorkflowKeyboard } from '../ui/gif-workflow-keyboard.js';
import { GifRangesPanelControl } from '../ui/gif-ranges-panel-control.js';
import { ElectronGifSessionServices } from '../adapters/electron/electron-gif-session-services.js';
import { ElectronCollectionClipRefinementService } from '../adapters/electron/electron-collection-clip-refinement-service.js';
import { GifExtractionSession } from './gif-extraction-session.js';
import { AppSettingsService } from './app-settings-service.js';
import { AppSettingsParser, DEFAULT_STARTUP_SCREEN_ID } from './app-settings.js';
import { ElectronAppSettingsService } from '../adapters/electron/electron-app-settings-service.js';
import { ActivityIndicatorControl } from '../ui/activity-indicator-control.js';
import { ActivityLogger } from './activity-logger.js';
import { ActivityReporter } from './activity-reporter.js';
import { ContextMenuControl } from '../ui/context-menu-control.js';
import { GridContextMenuControl } from '../ui/grid-context-menu-control.js';
import { ZoomEditMenuControl } from '../ui/zoom-edit-menu-control.js';
import { ZoomOverlayControl } from '../ui/zoom-overlay-control.js';
import { ClipCollectionGridControl } from '../ui/clip-collection-grid-control.js';
import { CollectionConflictControl } from '../ui/collection-conflict-control.js';
import { DeleteFromDiskDialogControl } from '../ui/delete-from-disk-dialog-control.js';
import { SaveAsNewDialogControl } from '../ui/save-as-new-dialog-control.js';
import { UnsavedChangesDialogControl } from '../ui/unsaved-changes-dialog-control.js';
import { CollectionDescriptionValidator } from '../domain/collection-description-validator.js';
import { OpenFolderRefreshSession } from './open-folder-refresh-session.js';
import { ControlFailureReporting } from './control-failure-reporting.js';
import { PipelineCatalogControl } from '../ui/pipeline-catalog-control.js';

const ERROR_LOG_FILENAME = 'err.log';
const NEW_COLLECTION_CHOICE_VALUE = '__new_collection__';

// The composition root: builds services, controls and workflows in dependency order, then starts the app.
export class AppController {
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const body = document.body;

    // Application services and adapters.
    const state = new AppSessionState();
    const pipelineSession = new PipelineSession();
    const appText = new AppText();
    const collectionNameValidator = new CollectionNameValidator(appText);
    const newCollectionNameCheck = new NewCollectionNameCheck(pipelineSession, collectionNameValidator);
    const videoEditCatalog = new VideoEditCatalog();
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
    const gifServices = ElectronGifSessionServices.tryCreate(window);
    const collectionRefinementGifServices = gifServices && collectionRefinementService
      ? ElectronGifSessionServices.tryCreate(window)
      : null;

    // Controls.
    const zoomOverlay = ZoomOverlayControl.fromDocument(document, {
      audioDefault: () => settingsService.current.singleClipAudioDefault,
    });
    const clipContextMenu = ContextMenuControl.forClipMenu(document);
    const gridContextMenuControl = new GridContextMenuControl({ contextMenu: clipContextMenu });
    const zoomEditMenuControl = new ZoomEditMenuControl({ contextMenu: clipContextMenu, videoEditCatalog });
    const collectionSelectorControl = CollectionSelectorControl.fromDocument(document, { appText, defaultTitle: appText.defaultAppTitle });
    const mainToolbarControl = MainToolbarControl.fromDocument(document, { appText });
    const addToCollectionDialog = AddToCollectionDialogControl.fromDocument(document, {
      newChoiceValue: NEW_COLLECTION_CHOICE_VALUE,
      nameCheck: newCollectionNameCheck,
    });
    const collectionConflict = CollectionConflictControl.fromDocument(document, { appText });
    const saveAsNewDialog = SaveAsNewDialogControl.fromDocument(document, {
      nameCheck: newCollectionNameCheck,
    });
    const unsavedChangesDialog = UnsavedChangesDialogControl.fromDocument(document);
    const deleteFromDiskDialog = DeleteFromDiskDialogControl.fromDocument(document, { appText });
    const activityPanelAutoOpenPolicy = new ActivityPanelAutoOpenPolicy({
      fullScreen: fullscreenAdapter,
      zoom: zoomOverlay,
      saveAsNewDialog,
      collectionConflict,
      document,
    });
    // The Activity control and the utility coordinator each refer to the other, so these callbacks resolve `utilities` when called.
    const utilitiesAvailable = GlobalUtilityCoordinator.isAvailableIn(document);
    const activityIndicatorControl = ActivityIndicatorControl.fromDocument(document, {
      logger: activityLogger,
      requestPanelClose: () => utilities?.close(),
      writeClipboard: text => navigator.clipboard.writeText(text),
      win: window,
      requestPanelOpen: utilitiesAvailable ? () => {
        if (activityPanelAutoOpenPolicy.mayOpenAutomatically()) utilities?.open('activity');
      } : undefined,
    });
    const grid = ClipCollectionGridControl.fromDocument(document, { fullScreen: fullscreenAdapter });
    const pipelineCatalogControl = PipelineCatalogControl.fromDocument(document, { catalog: fileSystem });
    const controlFailureReporting = new ControlFailureReporting({
      grid,
      pipelineCatalog: pipelineCatalogControl,
      reporter: activityReporter,
      diagnostics,
    });
    const settingsScreen = new SettingsScreen(document);
    const keyboardMap = utilitiesAvailable
      ? KeyboardMapControl.fromDocument(document, { globalShortcuts: GLOBAL_UTILITY_SHORTCUTS, requestClose: () => utilities?.close() })
      : null;
    const collectionScreen = CollectionScreen.fromDocument(document, { grid, toolbar: mainToolbarControl });
    const frameReviewPlayer = new FrameReviewPlayerControl({ document, fullScreen: fullscreenAdapter });
    const gifWorkflowKeyboard = new GifWorkflowKeyboard();
    const hasClipsPanel = ApplicationShellControl.sidePanelsIn(document).some(panel => panel.id === 'clips');
    // Saving refreshes the open folder through folder selection, which itself saves first; the callback below closes that loop.
    const openFolderRefreshSession = new OpenFolderRefreshSession({
      folders: fileSystem,
      openFolder: state,
      pipelineSession,
      refreshActiveFolder: (): Promise<void> => folderSelection.refreshActiveFolder(),
      reporter: activityReporter,
      diagnostics,
    });
    const sessionReporting = {
      reporter: activityReporter,
      activityLog: activityLogger,
      diagnostics,
      publications: openFolderRefreshSession,
    };
    const gifExtractionSession = gifServices
      ? new GifExtractionSession(gifServices.frameReview, gifServices.thumbnails, {
        ...sessionReporting,
        extractionService: gifServices.extractionService,
        captureStore: gifServices.captureStore,
        capturePositioning: frameReviewPlayer,
      })
      : null;
    const collectionRefinementSession = collectionRefinementGifServices
      ? new GifExtractionSession(collectionRefinementGifServices.frameReview, collectionRefinementGifServices.thumbnails, {
        ...sessionReporting,
        extractionService: collectionRefinementGifServices.extractionService,
      })
      : null;
    const gifRangesPanelControl = gifExtractionSession
      ? GifRangesPanelControl.fromDocument(document, gifExtractionSession, { player: frameReviewPlayer })
      : null;
    // The refined-clip panel mounts into the shell's Clips panel, so it exists only where that panel does.
    const collectionRangesPanelControl = collectionRefinementSession && hasClipsPanel
      ? GifRangesPanelControl.forCollectionRefinement(collectionRefinementSession, { document, player: frameReviewPlayer })
      : null;
    const gifExtractionScreen = new GifExtractionScreen({
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: gifExtractionSession ?? undefined,
      rangesPanel: gifRangesPanelControl ?? undefined,
      document,
    });
    const refineGifScreen = RefineGifScreen.forGifExtraction({
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: gifExtractionSession ?? undefined,
      rangesPanel: gifRangesPanelControl ?? undefined,
      document,
    });
    const collectionRefineScreen = RefineGifScreen.forCollectionRefinement({
      player: frameReviewPlayer,
      keyboard: gifWorkflowKeyboard,
      session: collectionRefinementSession ?? undefined,
      rangesPanel: collectionRangesPanelControl ?? undefined,
      document,
    });
    const refineScreenLeavePolicy = new RefineScreenLeavePolicy(
      collectionRefineScreen.id, collectionRefinementSession, activityReporter);
    const shell = ApplicationShellControl.fromDocument(document, {
      initialScreenId: settingsService.current.startupScreenId ?? DEFAULT_STARTUP_SCREEN_ID,
      screens: [gifExtractionScreen, collectionScreen, refineGifScreen, collectionRefineScreen, settingsScreen],
      canLeaveScreen: current => refineScreenLeavePolicy.canLeave(current),
    });
    shell.on('screenChanged', screen => keyboardMap?.render(screen));
    shell.on('settingsRequested', () => {
      utilities?.close(false);
      shell.activate(settingsScreen.id);
    });
    const keyboardUtility = keyboardMap?.utilitySurface();
    const activityUtility = activityIndicatorControl.utilitySurface();
    const utilities = keyboardUtility && activityUtility
      ? GlobalUtilityCoordinator.fromDocument(document, [
        { id: 'keyboard', ...keyboardUtility },
        { id: 'activity', ...activityUtility },
      ])
      : null;

    // Workflows.
    const collectionView = new CollectionViewWorkflow({
      pipelineSession,
      openFolder: state,
      grid,
      toolbar: mainToolbarControl,
      selector: collectionSelectorControl,
      surfaces: {
        collectionConflict,
        contextMenu: clipContextMenu,
        addToCollectionDialog,
        zoom: zoomOverlay,
      },
      reporter: activityReporter,
      appText,
    });
    const collectionSave = new CollectionSaveWorkflow({
      pipelineSession,
      fileWriter: collectionFileWriter,
      saveAsNewDialog,
      toolbar: mainToolbarControl,
      nameCheck: newCollectionNameCheck,
      grid,
      collectionView,
      folderRefresh: openFolderRefreshSession,
      reporter: activityReporter,
      appText,
    });
    const addToCollection = new AddToCollectionWorkflow({
      pipelineSession,
      grid,
      dialog: addToCollectionDialog,
      destinationChoices: AddToCollectionDialogControl,
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
      grid,
      collectionView,
      missingClipsPrompt: collectionConflict,
      unsavedChangesPrompt: unsavedChangesDialog,
      collectionSave,
      navigation: shell,
      collectionScreenId: collectionScreen.id,
      settings: settingsService,
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
      dialog: deleteFromDiskDialog,
      grid,
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
      grid,
      screens: shell,
      collectionScreenId: collectionScreen.id,
      contextMenu: clipContextMenu,
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
      grid,
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
      grid,
      toolbar: mainToolbarControl,
      titles: collectionView,
      fullScreen: fullscreenAdapter,
      clock,
      reporter: activityReporter,
      appText,
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
    const settingsWorkflow = new SettingsWorkflow({
      settings: settingsService,
      view: settingsScreen,
      catalog: pipelineCatalogControl,
      navigation: shell,
      reporter: activityReporter,
    });
    const appKeyDownHandler = new AppKeyDownHandler({
      saveAsNewDialog,
      addToCollectionDialog,
      deleteFromDiskDialog,
      unsavedChangesDialog,
      zoom,
      grid,
      fullScreen: fullscreenAdapter,
      keys: collectionScreen,
      utilities,
      fullScreenKeys: fullscreenSession,
    });

    // Startup: show an empty Collection view, activate the first screen, then load settings.
    collectionView.clearLoadedView();
    grid.recomputeLayout();
    collectionView.setTitlesHidden(false);
    shell.start();
    void settingsWorkflow.loadAtStartup();
    const shutdown = new ApplicationShutdownCoordinator({
      stopActions: () => {
        appKeyDownHandler.dispose();
        fullscreenSession.destroy();
        shell.destroy();
      },
      disposeWorkflow: async () => {
        for (const workflow of [collectionView, collectionSave, addToCollection, folderSelection, deleteFromDisk,
          zoom, collectionRefinement, gridContextMenu, gifRangeRefinement, settingsWorkflow, controlFailureReporting]) workflow.dispose();
        await Promise.all([gifExtractionSession?.dispose(), collectionRefinementSession?.dispose()]);
      },
      destroyControls: () => {
        grid.dispose();
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
      onKeyDown: event => shell.handleKeyDown(event),
      onKeyUp: event => gifWorkflowKeyboard.handleKeyUp(event),
      onWindowBlur: () => gifWorkflowKeyboard.releaseHeldSteps(),
      onPageHide: () => { void shutdown.begin(); },
    });
  }
}
