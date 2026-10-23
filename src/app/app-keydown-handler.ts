import type { IShortcutDescriptor } from './shortcut-descriptor.js';
import type { IEventSource } from './event-source.js';

export const COLLECTION_SHORTCUTS: readonly IShortcutDescriptor[] = [
  { description: 'Open selected clip in Zoom', group: 'Grid', sequences: [['Z']] },
  { description: 'Remove selection; in the pipeline view, move to Recycle Bin', group: 'Grid', sequences: [['Delete'], ['Backspace']] },
  { description: 'Toggle audio', group: 'Zoom', sequences: [['A']] },
  { description: 'Previous clip', group: 'Zoom', sequences: [['Left']] },
  { description: 'Next clip', group: 'Zoom', sequences: [['Right']] },
  { description: 'Close Zoom', group: 'Zoom', sequences: [['Escape']] },
];

type KeyboardDialog = {
  isOpen(): boolean;
  handleGlobalKeyDown?: (event: KeyboardEvent) => boolean;
  close?: () => void;
};

export type AppKeyDownContext = {
  saveAsNewDialog: Required<Pick<KeyboardDialog, 'isOpen' | 'handleGlobalKeyDown'>>;
  addToCollectionDialog: Required<Pick<KeyboardDialog, 'isOpen' | 'close'>>;
  trashClipsDialog: Required<Pick<KeyboardDialog, 'isOpen' | 'handleGlobalKeyDown'>>;
  unsavedChangesDialog: Required<Pick<KeyboardDialog, 'isOpen' | 'handleGlobalKeyDown'>>;
  zoom: {
    isOpen(): boolean;
    close(): void;
    toggleMuted(): void;
    browseByOffset(offset: number): unknown;
    openClipById(clipId: string | null): unknown;
  };
  grid: {
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

  // Collection shortcuts come first. Full-screen keys see only keys those left unhandled, and never keys
  // the user is typing into an open dialog or an editable field.
  private onCollectionKey(event: KeyboardEvent): void {
    if (this.context.utilities?.isOpen || event.defaultPrevented) return;
    this.handle(event);
    if (event.defaultPrevented || this.anyDialogOpen() || this.isEditableTarget(event.target)) return;
    this.context.fullScreenKeys.onGlobalKeyDown(event);
  }

  handle(event: KeyboardEvent): boolean {
    const context = this.context;

    if (context.saveAsNewDialog.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return true;
    }
    if (context.addToCollectionDialog.isOpen() && event.key === 'Escape') {
      event.preventDefault();
      context.addToCollectionDialog.close();
      return true;
    }
    if (context.trashClipsDialog.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return true;
    }
    if (context.unsavedChangesDialog.handleGlobalKeyDown(event)) {
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
      else context.grid.handleKeyDown(event);
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
      && context.grid.getSelectedClipId()
    ) {
      context.zoom.openClipById(context.grid.getSelectedClipId());
      event.preventDefault();
      return true;
    }
    return false;
  }

  private anyDialogOpen(): boolean {
    return (
      this.context.saveAsNewDialog.isOpen()
      || this.context.addToCollectionDialog.isOpen()
      || this.context.trashClipsDialog.isOpen()
      || this.context.unsavedChangesDialog.isOpen()
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
