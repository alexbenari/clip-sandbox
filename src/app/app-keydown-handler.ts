// @ts-nocheck
function isPlainKeyPress(event) {
  return !event.altKey && !event.ctrlKey && !event.metaKey;
}

function anyDialogOpen({
  saveAsNewDialogController,
  addToCollectionDialogController,
  deleteFromDiskDialogController,
  unsavedChangesDialogController,
}) {
  return (
    saveAsNewDialogController.isOpen()
    || addToCollectionDialogController.isOpen()
    || deleteFromDiskDialogController.isOpen()
    || unsavedChangesDialogController.isOpen()
  );
}

export function createAppKeyDownHandler(context) {
  const rules = [
    {
      id: 'save-as-new-dialog',
      matches: (event) => context.saveAsNewDialogController.handleGlobalKeyDown(event),
      run: (event) => {
        event.preventDefault();
      },
    },
    {
      id: 'add-to-collection-escape',
      matches: (event) => context.addToCollectionDialogController.isOpen() && event.key === 'Escape',
      run: (event) => {
        event.preventDefault();
        context.addToCollectionDialogController.close();
      },
    },
    {
      id: 'delete-from-disk-dialog',
      matches: (event) => context.deleteFromDiskDialogController.handleGlobalKeyDown(event),
      run: (event) => {
        event.preventDefault();
      },
    },
    {
      id: 'unsaved-changes-dialog',
      matches: (event) => context.unsavedChangesDialogController.handleGlobalKeyDown(event),
      run: (event) => {
        event.preventDefault();
      },
    },
    {
      id: 'zoom-escape',
      matches: (event) => event.key === 'Escape' && context.zoomOverlay.isOpen(),
      run: (event) => {
        context.closeZoom();
        event.preventDefault();
      },
    },
    {
      id: 'delete-or-backspace',
      matches: (event) => event.key === 'Delete' || event.key === 'Backspace',
      run: (event) => {
        if (context.zoomOverlay.isOpen()) {
          event.preventDefault();
          return;
        }
        context.gridController.handleKeyDown(event);
      },
    },
    {
      id: 'dialog-open-blocker',
      matches: () => anyDialogOpen(context),
      run: () => {},
    },
    {
      id: 'editable-target-blocker',
      matches: (event) => context.isEditableTarget(event.target),
      run: () => {},
    },
    {
      id: 'zoom-close-on-f',
      matches: (event) =>
        isPlainKeyPress(event)
        && context.zoomOverlay.isOpen()
        && (event.key === 'f' || event.key === 'F'),
      run: () => {
        context.closeZoom();
      },
    },
    {
      id: 'zoom-mute',
      matches: (event) =>
        isPlainKeyPress(event)
        && context.zoomOverlay.isOpen()
        && (event.key === 'a' || event.key === 'A'),
      run: (event) => {
        context.zoomOverlay.toggleMuted();
        event.preventDefault();
      },
    },
    {
      id: 'zoom-browse',
      matches: (event) =>
        isPlainKeyPress(event)
        && context.zoomOverlay.isOpen()
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'),
      run: (event) => {
        context.browseZoomByOffset(event.key === 'ArrowRight' ? 1 : -1);
        event.preventDefault();
      },
    },
    {
      id: 'open-zoom-for-selection',
      matches: (event) =>
        isPlainKeyPress(event)
        && (event.key === 'z' || event.key === 'Z')
        && !context.zoomOverlay.isOpen()
        && !context.isFullscreen()
        && !!context.gridController.getSelectedClipId(),
      run: (event) => {
        context.openZoomForClipId(context.gridController.getSelectedClipId());
        event.preventDefault();
      },
    },
  ];

  return function handleAppKeyDown(event) {
    for (const rule of rules) {
      if (!rule.matches(event)) continue;
      rule.run(event);
      return true;
    }
    return false;
  };
}
