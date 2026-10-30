import type { IShortcutDescriptor } from './shortcut-descriptor.js';
import type { IEventSource } from './event-source.js';
import { ZOOM_EDIT_ENTRY_KEYS, ZOOM_EDIT_ENTRY_SHORTCUTS, ZOOM_EDIT_MODE_SHORTCUTS } from './zoom-edit-mode-keys.js';
import type { ZoomEditEntry } from './zoom-edit-mode-workflow.js';

const TITLES_KEY = 'T';

export const COLLECTION_SHORTCUTS: readonly IShortcutDescriptor[] = [
  { description: 'Move focus between clips', group: 'Grid', sequences: [['Arrow keys']] },
  { description: 'Select the focused clip', group: 'Grid', sequences: [['Space']] },
  { description: 'Add or remove the focused clip from the selection', group: 'Grid', sequences: [['Ctrl', 'Space']] },
  { description: 'Open the focused or selected clip in Zoom', group: 'Grid', sequences: [['Enter'], ['Z']] },
  { description: 'Move the focused clip in the order', group: 'Grid', sequences: [['Alt', 'Arrow keys']] },
  { description: 'Open the clip menu', group: 'Grid', sequences: [['Shift', 'F10'], ['Menu']] },
  { description: 'Save the collection; in the folder view, save as a new collection', group: 'Grid', sequences: [['Ctrl', 'S']] },
  {
    description: 'Remove selected clips from the collection; in the folder view, move them to the Recycle Bin after confirming',
    group: 'Grid',
    sequences: [['Delete'], ['Backspace']],
  },
  { description: 'Show or hide clip titles, also in Zoom and Zoom edit mode', group: 'Grid', sequences: [[TITLES_KEY]] },
  { description: 'Toggle audio', group: 'Zoom', sequences: [['A']] },
  { description: 'Previous clip', group: 'Zoom', sequences: [['Left']] },
  { description: 'Next clip', group: 'Zoom', sequences: [['Right']] },
  { description: 'Close Zoom', group: 'Zoom', sequences: [['Escape']] },
  ...ZOOM_EDIT_ENTRY_SHORTCUTS,
  ...ZOOM_EDIT_MODE_SHORTCUTS,
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
    enterEditMode(entry: ZoomEditEntry): unknown;
  };
  grid: {
    handleKeyDown(event: KeyboardEvent): unknown;
    handleCardKey(event: KeyboardEvent): boolean;
    getSelectedClipId(): string | null;
    focusedClipId(): string | null;
  };
  collectionSave: { saveActive(): unknown };
  titles: { toggleTitles(): void };
  fullScreen: { isDocumentFullScreen(): boolean };
  keys: IEventSource<{ keyPressed: KeyboardEvent }>;
  utilities: { readonly isOpen: boolean } | null;
  fullScreenKeys: { onGlobalKeyDown(event: KeyboardEvent): void };
  activeEdit: { readonly isActive: boolean };
  zoomEditKeys: { handleKeyDown(event: KeyboardEvent): boolean };
  zoomEditDialogs: readonly Readonly<{ isOpen(): boolean }>[];
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
  // the user is typing into an open dialog or an editable field, or keys pressed in Zoom edit mode.
  private onCollectionKey(event: KeyboardEvent): void {
    if (this.context.utilities?.isOpen || event.defaultPrevented) return;
    this.handle(event);
    if (event.defaultPrevented || this.context.activeEdit.isActive || this.anyDialogOpen() || this.isEditableTarget(event.target)) return;
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
    if (this.togglesTitles(event)) {
      context.titles.toggleTitles();
      event.preventDefault();
      return true;
    }
    // Zoom edit mode's keys replace Zoom's own while it is active. Keys it does not use do nothing, so Tab cannot
    // move the focus out of Zoom and Enter cannot press a control behind it.
    if (context.activeEdit.isActive) {
      if (this.anyDialogOpen() || this.isEditableTarget(event.target)) return true;
      if (!context.zoomEditKeys.handleKeyDown(event) && this.isPlainKeyPress(event)) event.preventDefault();
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
    const zoomEditEntry = this.isPlainKeyPress(event) && context.zoom.isOpen() ? this.zoomEditEntryOf(event) : null;
    if (zoomEditEntry) {
      context.zoom.enterEditMode(zoomEditEntry);
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
    if (context.zoom.isOpen() || context.fullScreen.isDocumentFullScreen()) return false;
    if (context.grid.handleCardKey(event)) return true;
    if (this.isSaveKey(event)) {
      void context.collectionSave.saveActive();
      event.preventDefault();
      return true;
    }
    const clipToOpen = this.isPlainKeyPress(event) ? this.clipToOpen(event) : null;
    if (clipToOpen) {
      context.zoom.openClipById(clipToOpen);
      event.preventDefault();
      return true;
    }
    return false;
  }

  // Enter belongs to a focused button or link, so it opens the selected clip only when nothing else has focus.
  private clipToOpen(event: KeyboardEvent): string | null {
    const { grid } = this.context;
    if (this.isKey(event, 'z')) return grid.focusedClipId() ?? grid.getSelectedClipId();
    if (event.key !== 'Enter') return null;
    return grid.focusedClipId() ?? (this.isPageBody(event.target) ? grid.getSelectedClipId() : null);
  }

  // Full screen hides the titles itself and restores them when it ends.
  private togglesTitles(event: KeyboardEvent): boolean {
    return this.isPlainKeyPress(event) && this.isKey(event, TITLES_KEY.toLowerCase()) && !this.anyDialogOpen()
      && !this.isEditableTarget(event.target) && !this.context.fullScreen.isDocumentFullScreen();
  }

  private zoomEditEntryOf(event: KeyboardEvent): ZoomEditEntry | null {
    if (this.isKey(event, ZOOM_EDIT_ENTRY_KEYS.refine.toLowerCase())) return 'refine';
    if (this.isKey(event, ZOOM_EDIT_ENTRY_KEYS.loopify.toLowerCase())) return 'loopify';
    return null;
  }

  private isPageBody(target: EventTarget | null): boolean {
    return target instanceof Element && target === target.ownerDocument.body;
  }

  private isSaveKey(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && this.isKey(event, 's');
  }

  private anyDialogOpen(): boolean {
    return (
      this.context.saveAsNewDialog.isOpen()
      || this.context.addToCollectionDialog.isOpen()
      || this.context.trashClipsDialog.isOpen()
      || this.context.unsavedChangesDialog.isOpen()
      || this.context.zoomEditDialogs.some(dialog => dialog.isOpen())
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
