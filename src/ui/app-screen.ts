export interface IShortcutDescriptor {
  readonly description: string;
  readonly group?: string;
  readonly sequences: readonly (readonly string[])[];
}

export type AppScreenSelectorStatus = 'fixed' | 'contextual';

export interface IAppPanelContent {
  mount(host: HTMLElement): void;
}

export interface IAppScreenPanelContribution {
  readonly panelId: string;
  readonly content: IAppPanelContent;
  readonly entryBehavior?: 'preserve' | 'expand-once';
}

export interface IAppScreen {
  readonly id: string;
  readonly label: string;
  readonly selectorStatus: AppScreenSelectorStatus;
  readonly root: HTMLElement;
  readonly commands: HTMLElement | null;
  readonly shortcuts: readonly IShortcutDescriptor[];
  readonly panelContributions: readonly IAppScreenPanelContribution[];
  onActivate?(): void;
  onDeactivate?(): void;
  focusInitial(): void;
}
