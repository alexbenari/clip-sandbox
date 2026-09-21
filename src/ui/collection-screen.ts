import type { IAppScreen, IAppScreenPanelContribution, IShortcutDescriptor } from './app-screen.js';
import { COLLECTION_SHORTCUTS } from '../app/app-keydown-handler.js';
import { FULLSCREEN_SHORTCUTS } from '../app/fullscreen-session.js';

export class CollectionScreen implements IAppScreen {
  readonly id = 'collection';
  readonly label = 'Collection';
  readonly selectorStatus = 'fixed' as const;
  readonly panelContributions: readonly IAppScreenPanelContribution[] = Object.freeze([]);
  readonly shortcuts: readonly IShortcutDescriptor[] = [
    ...COLLECTION_SHORTCUTS,
    ...FULLSCREEN_SHORTCUTS,
  ];

  constructor(
    readonly root: HTMLElement,
    readonly commands: HTMLElement,
    private readonly grid: { focusSelectedClip(): boolean },
    private readonly toolbar: { focusBrowse(): void },
  ) {}

  focusInitial(): void {
    if (!this.grid.focusSelectedClip()) this.toolbar.focusBrowse();
  }
}
