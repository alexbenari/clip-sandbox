export interface IAnyFullScreenState {
  isFullScreenActive(): boolean;
}

export interface IOpenSurface {
  isOpen(): boolean;
}

export interface IVisibleSurface {
  isVisible(): boolean;
}

type ProtectedSurfaces = Readonly<{
  fullScreen: IAnyFullScreenState;
  zoom: IOpenSurface;
  saveAsNewDialog: IOpenSurface;
  collectionConflict: IVisibleSurface;
  document: Pick<Document, 'querySelector'>;
}>;

export class ActivityPanelAutoOpenPolicy {
  constructor(private readonly surfaces: ProtectedSurfaces) {}

  mayOpenAutomatically(): boolean {
    const { fullScreen, zoom, saveAsNewDialog, collectionConflict, document } = this.surfaces;
    return !fullScreen.isFullScreenActive() && !zoom.isOpen() && !saveAsNewDialog.isOpen()
      && !collectionConflict.isVisible() && !document.querySelector('dialog[open]');
  }
}
