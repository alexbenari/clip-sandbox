import type { IShortcutDescriptor } from '../ui/app-screen.js';
import type { IEventSource } from './event-source.js';

export const COLLECTION_SHORTCUTS: readonly IShortcutDescriptor[] = [
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
  zoom: {
    isOpen(): boolean;
    close(): void;
    toggleMuted(): void;
    browseByOffset(offset: number): unknown;
    openClipById(clipId: string | null): unknown;
  };
  gridController: {
    handleKeyDown(event: KeyboardEvent): unknown;
    getSelectedClipId(): string | null;
  };
  fullScreen: { isDocumentFullScreen(): boolean };
  keys: IEventSource<{ keyPressed: KeyboardEvent }>;
  utilities: { readonly isOpen: boolean } | null;
  fullScreenKeys: { onGlobalKeyDown(event: KeyboardEvent): void };
};

export class AppKeyDownHandler {
  private readonly unsubscribeKeys: () => void;

  constructor(private readonly context: AppKeyDownContext) {
    this.unsubscribeKeys = context.keys.on('keyPressed', event => this.onCollectionKey(event));
  }

  dispose(): void {
    this.unsubscribeKeys();
  }

  // Collection shortcuts come first; full-screen keys only see keys those left unhandled.
  private onCollectionKey(event: KeyboardEvent): void {
    if (this.context.utilities?.isOpen || event.defaultPrevented) return;
    this.handle(event);
    if (!event.defaultPrevented) this.context.fullScreenKeys.onGlobalKeyDown(event);
  }

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
    if (event.key === 'Escape' && context.zoom.isOpen()) {
      context.zoom.close();
      event.preventDefault();
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (context.zoom.isOpen()) event.preventDefault();
      else context.gridController.handleKeyDown(event);
      return true;
    }
    if (this.anyDialogOpen()) return true;
    if (this.isEditableTarget(event.target)) return true;

    if (this.isPlainKeyPress(event) && context.zoom.isOpen() && this.isKey(event, 'f')) {
      context.zoom.close();
      return true;
    }
    if (this.isPlainKeyPress(event) && context.zoom.isOpen() && this.isKey(event, 'a')) {
      context.zoom.toggleMuted();
      event.preventDefault();
      return true;
    }
    if (
      this.isPlainKeyPress(event)
      && context.zoom.isOpen()
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      context.zoom.browseByOffset(event.key === 'ArrowRight' ? 1 : -1);
      event.preventDefault();
      return true;
    }
    if (
      this.isPlainKeyPress(event)
      && this.isKey(event, 'z')
      && !context.zoom.isOpen()
      && !context.fullScreen.isDocumentFullScreen()
      && context.gridController.getSelectedClipId()
    ) {
      context.zoom.openClipById(context.gridController.getSelectedClipId());
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
