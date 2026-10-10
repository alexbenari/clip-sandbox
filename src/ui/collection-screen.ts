import type { IAppScreen, IAppScreenPanelContribution, IShortcutDescriptor } from './app-screen.js';
import { COLLECTION_SHORTCUTS } from '../app/app-keydown-handler.js';
import { FULLSCREEN_SHORTCUTS } from '../app/fullscreen-session.js';
import { DocumentElements } from './document-elements.js';

type CollectionGrid = {
  focusSelectedClip(): boolean;
  beginWorkspaceResize(width: number, durationMs: number): void;
  endWorkspaceResize(): void;
};

type CollectionToolbar = { focusBrowse(): void };

export class CollectionScreen implements IAppScreen {
  readonly id = 'collection';
  readonly label = 'Collection';
  readonly selectorStatus = 'fixed' as const;
  readonly panelContributions: readonly IAppScreenPanelContribution[] = Object.freeze([]);
  readonly initiallyFoldedPanelIds = ['clips'] as const;
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
  ) {}

  focusInitial(): void {
    if (!this.grid.focusSelectedClip()) this.toolbar.focusBrowse();
  }

  onBoundsChanging(width: number, durationMs: number): void {
    this.grid.beginWorkspaceResize(width, durationMs);
  }

  onBoundsSettled(): void {
    this.grid.endWorkspaceResize();
  }
}
