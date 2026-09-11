import type { IAppScreen } from './app-screen.js';
import { FoldablePanelController } from './foldable-panel-controller.js';

type ShellElements = {
  screenHost: HTMLElement;
  commandHost: HTMLElement;
  selector: HTMLSelectElement;
  screens: readonly [IAppScreen, ...IAppScreen[]];
  workspace?: HTMLElement;
  center?: HTMLElement;
  panels?: readonly { root: HTMLElement; content: HTMLElement; foldButton: HTMLButtonElement; revealButton: HTMLButtonElement }[];
  onBoundsChange?: (screen: IAppScreen, width: number, durationMs: number) => void;
  onBoundsSettled?: (screen: IAppScreen) => void;
  onScreenChange?: (screen: IAppScreen) => void;
};

export class ApplicationShellController {
  private readonly screens = new Map<string, IAppScreen>();
  private current: IAppScreen;
  private readonly panels: FoldablePanelController[] = [];
  private motionPending = false;
  private readonly onSelectionChange = (): void => { this.activate(this.elements.selector.value); };

  constructor(private readonly elements: ShellElements) {
    if (elements.panels?.length && (!elements.workspace || !elements.center)) throw new Error('Panels require workspace and center hosts.');
    for (const screen of elements.screens) {
      if (this.screens.has(screen.id)) throw new Error(`Duplicate app screen: ${screen.id}`);
      this.screens.set(screen.id, screen);
    }
    this.current = elements.screens[0];
    const doc = elements.screenHost.ownerDocument;
    elements.selector.replaceChildren(...elements.screens.map(screen => {
      const option = doc.createElement('option');
      option.value = screen.id;
      option.textContent = screen.label;
      return option;
    }));
    elements.selector.hidden = elements.screens.length === 1;
    for (const screen of elements.screens) elements.screenHost.append(screen.root);
    elements.selector.addEventListener('change', this.onSelectionChange);
    this.activate(this.current.id);
    for (const panel of elements.panels ?? []) {
      this.panels.push(new FoldablePanelController({ ...panel,
        onChange: duration => this.prepareWorkspaceResize(duration),
        onSettled: () => this.settleWorkspaceResize(),
      }));
    }
  }

  get activeScreen(): IAppScreen { return this.current; }
  get workspaceMoving(): boolean { return this.motionPending; }

  private prepareWorkspaceResize(duration: number): void {
    const { workspace, center, commandHost } = this.elements;
    if (!workspace || !center) return;
    this.motionPending = true;
    workspace.dataset.moving = 'true';
    const panelWidth = this.panels.reduce((sum, panel) => sum + panel.targetWidth, 0);
    const width = Math.max(0, workspace.clientWidth - panelWidth);
    const currentCommandHeight = commandHost.getBoundingClientRect().height;
    // Measure the destination once, including command wrapping, before animating both allocations.
    commandHost.style.transition = 'none';
    commandHost.style.height = '';
    center.style.flex = 'none';
    center.style.width = `${width}px`;
    const targetCommandHeight = commandHost.getBoundingClientRect().height;
    this.elements.onBoundsChange?.(this.current, width, duration);
    center.style.flex = '';
    center.style.width = '';
    commandHost.style.height = `${currentCommandHeight}px`;
    commandHost.getBoundingClientRect();
    commandHost.style.transition = `height ${duration}ms cubic-bezier(.2,.7,.2,1)`;
    commandHost.style.height = `${targetCommandHeight}px`;
  }

  private settleWorkspaceResize(): void {
    if (!this.motionPending || this.panels.some(panel => panel.moving)) return;
    this.motionPending = false;
    if (this.elements.workspace) this.elements.workspace.dataset.moving = 'false';
    this.elements.commandHost.style.transition = '';
    this.elements.commandHost.style.height = '';
    this.elements.onBoundsSettled?.(this.current);
  }

  activate(id: string): void {
    const incoming = this.screens.get(id);
    if (!incoming) throw new Error(`Unknown app screen: ${id}`);
    for (const screen of this.screens.values()) {
      screen.root.hidden = screen !== incoming;
      screen.root.inert = screen !== incoming;
    }
    this.elements.commandHost.replaceChildren(...(incoming.commands ? [incoming.commands] : []));
    this.elements.commandHost.hidden = incoming.commands === null;
    this.elements.selector.value = incoming.id;
    this.current = incoming;
    incoming.focusInitial();
    this.elements.onScreenChange?.(incoming);
    if (this.motionPending) this.prepareWorkspaceResize(0);
    else this.elements.onBoundsSettled?.(incoming);
  }

  destroy(): void {
    this.elements.selector.removeEventListener('change', this.onSelectionChange);
    for (const panel of this.panels) panel.destroy();
  }
}
