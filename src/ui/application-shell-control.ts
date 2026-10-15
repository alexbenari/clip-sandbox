import type { IAppScreen } from './app-screen.js';
import { DocumentElements } from './document-elements.js';
import { FoldablePanelControl } from './foldable-panel-control.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';

export interface IApplicationShellEvents {
  screenChanged: IAppScreen;
  settingsRequested: void;
}

type ShellPanel = {
  id: string;
  root: HTMLElement;
  content: HTMLElement;
  contributionHost: HTMLElement;
  fallbackContent?: HTMLElement;
  foldButton: HTMLButtonElement;
  revealButton: HTMLButtonElement;
};

export interface IScreenLeavePolicy {
  canLeave(current: IAppScreen, incoming: IAppScreen): boolean;
}

type ShellElements = {
  screenHost: HTMLElement;
  commandHost: HTMLElement;
  selector: HTMLSelectElement;
  selectorHost?: HTMLElement;
  settingsButton?: HTMLButtonElement | null;
  screens: readonly [IAppScreen, ...IAppScreen[]];
  initialScreenId?: string;
  workspace?: HTMLElement;
  center?: HTMLElement;
  panels?: readonly ShellPanel[];
  leavePolicy?: IScreenLeavePolicy;
};

export class ApplicationShellControl implements IEventSource<IApplicationShellEvents> {
  private readonly screens = new Map<string, IAppScreen>();
  private readonly events = new EventSource<IApplicationShellEvents>();
  private current: IAppScreen;
  private readonly panels = new Map<string, {
    readonly shell: ShellPanel;
    readonly controller: FoldablePanelControl;
  }>();
  private readonly panelStates = new Map<string, Map<string, boolean>>();
  private activated = false;
  private destroyed = false;
  private motionPending = false;
  private applyingPanelState = false;
  private readonly onSelectionChange = (): void => { this.activate(this.elements.selector.value); };
  private readonly onSettingsClick = (): void => { this.events.emit('settingsRequested'); };

  static fromDocument(doc: Document, options: Pick<ShellElements, 'screens' | 'initialScreenId' | 'leavePolicy'>): ApplicationShellControl {
    const elements = new DocumentElements(doc);
    return new ApplicationShellControl({
      ...options,
      screenHost: elements.required('mainScreenHost'),
      commandHost: elements.required('screenCommandHost'),
      selector: elements.required<HTMLSelectElement>('appScreenSelector'),
      selectorHost: elements.required('appScreenSwitcher'),
      settingsButton: elements.optional<HTMLButtonElement>('settingsBtn'),
      workspace: elements.optional('workspaceRow') ?? undefined,
      center: elements.optional('centralWorkspace') ?? undefined,
      panels: ApplicationShellControl.sidePanelsIn(doc),
    });
  }

  static sidePanelsIn(root: ParentNode): ShellPanel[] {
    return [...root.querySelectorAll<HTMLElement>('[data-shell-panel]')].map(panelRoot => {
      const id = panelRoot.dataset.shellPanel ?? '';
      const part = <T extends HTMLElement>(attribute: string): T => {
        const element = panelRoot.querySelector<T>(`[${attribute}]`);
        if (!element) throw new Error(`Side panel "${id}" has no [${attribute}].`);
        return element;
      };
      return {
        id,
        root: panelRoot,
        content: part('data-shell-panel-content'),
        contributionHost: part('data-shell-panel-contributions'),
        fallbackContent: panelRoot.querySelector<HTMLElement>('[data-shell-panel-fallback]') ?? undefined,
        foldButton: part<HTMLButtonElement>('data-shell-panel-fold'),
        revealButton: part<HTMLButtonElement>('data-shell-panel-reveal'),
      };
    });
  }

  constructor(private readonly elements: ShellElements) {
    if (elements.panels?.length && (!elements.workspace || !elements.center)) throw new Error('Panels require workspace and center hosts.');
    const panelIds = new Set<string>();
    for (const panel of elements.panels ?? []) {
      if (panelIds.has(panel.id)) throw new Error(`Duplicate shell panel: ${panel.id}`);
      panelIds.add(panel.id);
    }
    const screenIds = new Set<string>();
    for (const screen of elements.screens) {
      if (screenIds.has(screen.id)) throw new Error(`Duplicate app screen: ${screen.id}`);
      screenIds.add(screen.id);
      this.validateScreen(screen, panelIds);
    }
    for (const panel of elements.panels ?? []) {
      this.panels.set(panel.id, {
        shell: panel,
        controller: new FoldablePanelControl({
          ...panel,
          onChange: duration => this.prepareWorkspaceResize(duration),
          onSettled: () => this.settleWorkspaceResize(),
        }),
      });
    }
    for (const screen of elements.screens) {
      this.screens.set(screen.id, screen);
    }
    const initialScreenId = elements.initialScreenId ?? elements.screens[0].id;
    const initialScreen = this.screens.get(initialScreenId);
    if (!initialScreen) throw new Error(`Unknown initial app screen: ${initialScreenId}`);
    this.current = initialScreen;
    const doc = elements.screenHost.ownerDocument;
    elements.selector.replaceChildren(...elements.screens.filter(screen => screen.selectorStatus === 'fixed').map(screen => {
      const option = doc.createElement('option');
      option.value = screen.id;
      option.textContent = screen.label;
      return option;
    }));
    for (const screen of elements.screens) elements.screenHost.append(screen.root);
    elements.selector.addEventListener('change', this.onSelectionChange);
    elements.settingsButton?.addEventListener('click', this.onSettingsClick);
  }

  // Activation is separate from construction so subscribers also receive the initial screen's events.
  start(): void {
    this.activate(this.current.id);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (this.destroyed || !this.activated) return;
    this.current.onKeyDown?.(event);
  }

  on<TName extends keyof IApplicationShellEvents>(name: TName, handler: EventHandler<IApplicationShellEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  get activeScreen(): IAppScreen { return this.current; }
  get workspaceMoving(): boolean { return this.motionPending; }

  private prepareWorkspaceResize(duration: number): void {
    const { workspace, center, commandHost } = this.elements;
    if (!workspace || !center) return;
    this.motionPending = true;
    workspace.dataset.moving = 'true';
    const panelWidth = [...this.panels.values()].reduce((sum, panel) => sum + panel.controller.targetWidth, 0);
    const width = Math.max(0, workspace.clientWidth - panelWidth);
    const currentCommandHeight = commandHost.getBoundingClientRect().height;
    // Measure the destination once, including command wrapping, before animating both allocations.
    commandHost.style.transition = 'none';
    commandHost.style.height = '';
    center.style.flex = 'none';
    center.style.width = `${width}px`;
    const targetCommandHeight = commandHost.getBoundingClientRect().height;
    this.current.onBoundsChanging?.(width, duration);
    center.style.flex = '';
    center.style.width = '';
    commandHost.style.height = `${currentCommandHeight}px`;
    commandHost.getBoundingClientRect();
    commandHost.style.transition = `height ${duration}ms cubic-bezier(.2,.7,.2,1)`;
    commandHost.style.height = `${targetCommandHeight}px`;
  }

  private settleWorkspaceResize(): void {
    if (!this.motionPending || this.applyingPanelState || [...this.panels.values()].some(panel => panel.controller.moving)) return;
    this.motionPending = false;
    if (this.elements.workspace) this.elements.workspace.dataset.moving = 'false';
    this.elements.commandHost.style.transition = '';
    this.elements.commandHost.style.height = '';
    this.current.onBoundsSettled?.();
  }

  activate(id: string): void {
    if (this.destroyed) throw new Error('Application shell is destroyed.');
    const incoming = this.screens.get(id);
    if (!incoming) throw new Error(`Unknown app screen: ${id}`);
    if (this.activated && incoming === this.current) {
      incoming.focusInitial();
      return;
    }
    if (this.activated && this.elements.leavePolicy?.canLeave(this.current, incoming) === false) {
      this.elements.selector.value = this.current.id;
      return;
    }
    if (this.activated) {
      this.panelStates.set(this.current.id, new Map([...this.panels].map(([panelId, panel]) => [panelId, panel.controller.folded])));
      this.current.onDeactivate?.();
    }
    for (const screen of this.screens.values()) {
      screen.root.hidden = screen !== incoming;
      screen.root.inert = screen !== incoming;
    }
    this.elements.commandHost.replaceChildren(...(incoming.commands ? [incoming.commands] : []));
    this.elements.commandHost.hidden = incoming.commands === null;
    this.current = incoming;
    this.mountPanelContributions(incoming);
    this.applyingPanelState = true;
    try {
      for (const [panelId, panel] of this.panels) {
        const folded = incoming.openPanelIdsOnEntry?.includes(panelId)
          ? false
          : this.panelStates.get(incoming.id)?.get(panelId)
            ?? incoming.initiallyFoldedPanelIds?.includes(panelId)
            ?? false;
        panel.controller.setFolded(folded);
      }
    } finally {
      this.applyingPanelState = false;
    }
    this.syncSelector(incoming);
    this.elements.selector.value = incoming.id;
    this.activated = true;
    incoming.onActivate?.();
    incoming.focusInitial();
    this.events.emit('screenChanged', incoming);
    if (this.motionPending) {
      this.prepareWorkspaceResize(0);
      this.settleWorkspaceResize();
    } else incoming.onBoundsSettled?.();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.elements.selector.removeEventListener('change', this.onSelectionChange);
    this.elements.settingsButton?.removeEventListener('click', this.onSettingsClick);
    if (this.activated) this.current.onDeactivate?.();
    for (const panel of this.panels.values()) panel.controller.destroy();
  }

  private validateScreen(screen: IAppScreen, availablePanelIds: ReadonlySet<string>): void {
    for (const panelId of screen.openPanelIdsOnEntry ?? []) {
      if (!availablePanelIds.has(panelId)) throw new Error(`Unknown panel to open on screen entry: ${panelId}`);
    }
    const contributionIds = new Set<string>();
    for (const contribution of screen.panelContributions) {
      if (!availablePanelIds.has(contribution.panelId)) {
        throw new Error(`Unknown shell panel contribution: ${contribution.panelId}`);
      }
      if (contributionIds.has(contribution.panelId)) {
        throw new Error(`Duplicate shell panel contribution: ${contribution.panelId}`);
      }
      contributionIds.add(contribution.panelId);
    }
  }

  private mountPanelContributions(screen: IAppScreen): void {
    const contributions = new Map(screen.panelContributions.map(contribution => [contribution.panelId, contribution]));
    for (const [panelId, panel] of this.panels) {
      const contribution = contributions.get(panelId);
      if (contribution) contribution.content.mount(panel.shell.contributionHost);
      else panel.shell.contributionHost.replaceChildren(...(panel.shell.fallbackContent ? [panel.shell.fallbackContent] : []));
    }
  }

  private syncSelector(screen: IAppScreen): void {
    this.elements.selector.querySelector('option[data-contextual="true"]')?.remove();
    if (screen.selectorStatus === 'contextual') {
      const option = this.elements.selector.ownerDocument.createElement('option');
      option.value = screen.id;
      option.textContent = screen.label;
      option.dataset.contextual = 'true';
      this.elements.selector.append(option);
    }
    const hidden = this.elements.selector.options.length <= 1;
    this.elements.selector.hidden = hidden;
    this.elements.selectorHost?.toggleAttribute('hidden', hidden);
  }
}
