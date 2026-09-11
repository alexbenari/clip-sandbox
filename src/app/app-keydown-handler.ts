import type { ShortcutDescriptor } from '../ui/app-screen.js';

export const COLLECTION_SHORTCUTS: readonly ShortcutDescriptor[] = [
  { description: 'Open selected clip in Zoom', group: 'Grid', sequences: [['Z']] },
  { description: 'Remove selection', group: 'Grid', sequences: [['Delete'], ['Backspace']] },
  { description: 'Toggle audio', group: 'Zoom', sequences: [['A']] },
  { description: 'Previous clip', group: 'Zoom', sequences: [['Left']] },
  { description: 'Next clip', group: 'Zoom', sequences: [['Right']] },
  { description: 'Close Zoom', group: 'Zoom', sequences: [['Escape']] },
];

type DialogKeyController = {
  isOpen(): boolean;
  handleGlobalKeyDown?: (event: KeyboardEvent) => boolean;
  close?: () => void;
};

export type AppKeyDownContext = {
  saveAsNewDialogController: Required<Pick<DialogKeyController, 'isOpen' | 'handleGlobalKeyDown'>>;
  addToCollectionDialogController: Required<Pick<DialogKeyController, 'isOpen' | 'close'>>;
  deleteFromDiskDialogController: Required<Pick<DialogKeyController, 'isOpen' | 'handleGlobalKeyDown'>>;
  unsavedChangesDialogController: Required<Pick<DialogKeyController, 'isOpen' | 'handleGlobalKeyDown'>>;
  zoomOverlay: {
    isOpen(): boolean;
    toggleMuted(): void;
  };
  gridController: {
    handleKeyDown(event: KeyboardEvent): unknown;
    getSelectedClipId(): string | null;
  };
  isFullscreen(): boolean;
  closeZoom(): void;
  browseZoomByOffset(offset: number): void;
  openZoomForClipId(clipId: string | null): void;
};

export class AppKeyDownHandler {
  constructor(private readonly context: AppKeyDownContext) {}

  handle(event: KeyboardEvent): boolean {
    const context = this.context;

    if (context.saveAsNewDialogController.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return true;
    }
    if (context.addToCollectionDialogController.isOpen() && event.key === 'Escape') {
      event.preventDefault();
      context.addToCollectionDialogController.close();
      return true;
    }
    if (context.deleteFromDiskDialogController.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return true;
    }
    if (context.unsavedChangesDialogController.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return true;
    }
    if (event.key === 'Escape' && context.zoomOverlay.isOpen()) {
      context.closeZoom();
      event.preventDefault();
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (context.zoomOverlay.isOpen()) event.preventDefault();
      else context.gridController.handleKeyDown(event);
      return true;
    }
    if (this.anyDialogOpen()) return true;
    if (this.isEditableTarget(event.target)) return true;

    if (this.isPlainKeyPress(event) && context.zoomOverlay.isOpen() && this.isKey(event, 'f')) {
      context.closeZoom();
      return true;
    }
    if (this.isPlainKeyPress(event) && context.zoomOverlay.isOpen() && this.isKey(event, 'a')) {
      context.zoomOverlay.toggleMuted();
      event.preventDefault();
      return true;
    }
    if (
      this.isPlainKeyPress(event)
      && context.zoomOverlay.isOpen()
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      context.browseZoomByOffset(event.key === 'ArrowRight' ? 1 : -1);
      event.preventDefault();
      return true;
    }
    if (
      this.isPlainKeyPress(event)
      && this.isKey(event, 'z')
      && !context.zoomOverlay.isOpen()
      && !context.isFullscreen()
      && context.gridController.getSelectedClipId()
    ) {
      context.openZoomForClipId(context.gridController.getSelectedClipId());
      event.preventDefault();
      return true;
    }
    return false;
  }

  private anyDialogOpen(): boolean {
    return (
      this.context.saveAsNewDialogController.isOpen()
      || this.context.addToCollectionDialogController.isOpen()
      || this.context.deleteFromDiskDialogController.isOpen()
      || this.context.unsavedChangesDialogController.isOpen()
    );
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  }

  private isPlainKeyPress(event: KeyboardEvent): boolean {
    return !event.altKey && !event.ctrlKey && !event.metaKey;
  }

  private isKey(event: KeyboardEvent, key: string): boolean {
    return event.key.toLowerCase() === key;
  }
}
