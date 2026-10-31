import type { IAppScreen, IAppScreenPanelContribution } from './app-screen.js';
import type { IShortcutDescriptor } from '../app/shortcut-descriptor.js';
import { COLLECTION_SHORTCUTS } from '../app/app-keydown-handler.js';
import { FULLSCREEN_SHORTCUTS } from '../app/collection-full-screen-workflow.js';
import { DocumentElements } from './document-elements.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';

export interface ICollectionScreenEvents {
  keyPressed: KeyboardEvent;
}

type CollectionGrid = {
  focusSelectedClip(): boolean;
  beginWorkspaceResize(width: number, durationMs: number): void;
  endWorkspaceResize(): void;
  holdPreviews(): () => void;
};

type CollectionToolbar = { focusBrowse(): void };

export class CollectionScreen implements IAppScreen, IEventSource<ICollectionScreenEvents> {
  private readonly events = new EventSource<ICollectionScreenEvents>();
  private releasePreviews: (() => void) | null;
  readonly id = 'collection';
  readonly label = 'Collection';
  readonly selectorStatus = 'fixed' as const;
  readonly panelContributions: readonly IAppScreenPanelContribution[] = Object.freeze([]);
  readonly shortcuts: readonly IShortcutDescriptor[] = [
    ...COLLECTION_SHORTCUTS,
    ...FULLSCREEN_SHORTCUTS,
  ];

  static fromDocument(doc: Document, { grid, toolbar }: { grid: CollectionGrid; toolbar: CollectionToolbar }): CollectionScreen {
    const elements = new DocumentElements(doc);
    return new CollectionScreen(elements.required('collectionScreen'), elements.required('toolbar'), grid, toolbar);
  }

  constructor(
    readonly root: HTMLElement,
    readonly commands: HTMLElement,
    private readonly grid: CollectionGrid,
    private readonly toolbar: CollectionToolbar,
  ) {
    // The grid's clips would keep decoding behind another screen, including the one the app starts on.
    this.releasePreviews = grid.holdPreviews();
  }

  onDeactivate(): void {
    this.releasePreviews ??= this.grid.holdPreviews();
  }

  onActivate(): void {
    this.releasePreviews?.();
    this.releasePreviews = null;
  }

  focusInitial(): void {
    if (!this.grid.focusSelectedClip()) this.toolbar.focusBrowse();
  }

  onBoundsChanging(width: number, durationMs: number): void {
    this.grid.beginWorkspaceResize(width, durationMs);
  }

  onBoundsSettled(): void {
    this.grid.endWorkspaceResize();
  }

  onKeyDown(event: KeyboardEvent): void {
    this.events.emit('keyPressed', event);
  }

  on<TName extends keyof ICollectionScreenEvents>(name: TName, handler: EventHandler<ICollectionScreenEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }
}
