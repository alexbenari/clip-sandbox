export interface ShortcutDescriptor {
  readonly description: string;
  readonly group?: string;
  readonly sequences: readonly (readonly string[])[];
}

export interface AppScreen {
  readonly id: string;
  readonly label: string;
  readonly root: HTMLElement;
  readonly commands: HTMLElement | null;
  readonly shortcuts: readonly ShortcutDescriptor[];
  focusInitial(): void;
}
