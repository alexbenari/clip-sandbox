export interface IShortcutDescriptor {
  readonly description: string;
  readonly group?: string;
  readonly sequences: readonly (readonly string[])[];
}

export interface IAppScreen {
  readonly id: string;
  readonly label: string;
  readonly root: HTMLElement;
  readonly commands: HTMLElement | null;
  readonly shortcuts: readonly IShortcutDescriptor[];
  focusInitial(): void;
}
