export interface IShortcutDescriptor {
  readonly description: string;
  readonly group?: string;
  readonly sequences: readonly (readonly string[])[];
}
