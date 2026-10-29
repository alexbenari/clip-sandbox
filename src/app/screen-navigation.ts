export interface IScreenNavigation {
  activate(screenId: string): void;
  readonly activeScreen: Readonly<{ id: string }>;
}
