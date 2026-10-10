import type { IShortcutDescriptor } from '../ui/app-screen.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { AppText } from './app-text.js';

export const FULLSCREEN_SHORTCUTS: readonly IShortcutDescriptor[] = [
  { description: 'Toggle fullscreen review', group: 'Fullscreen', sequences: [['F']] },
  { description: 'Set visible clip count', group: 'Fullscreen', sequences: [['0-9']] },
];

type FullscreenState = {
  savedTitlesHidden: boolean | null;
  digitBuffer: string;
  digitTimer: ReturnType<typeof setTimeout> | null;
  slots: number;
  randInterval: ReturnType<typeof setInterval> | null;
};

export interface IFullscreenGrid {
  areTitlesHidden(): boolean;
  normalizeFullscreenSlots(slots: number): number;
  fsApplySlots(slots: number): void;
  rotateVisibleClip(): void;
  cancelRotation(): void;
  fsRestore(): void;
  computeGrid(): void;
}

export interface IFullscreenButton {
  setFullscreenButtonState(active: boolean): void;
}

export interface ITitlesVisibility {
  setTitlesHidden(hidden: boolean): void;
}

export interface IDocumentFullScreen {
  enterFullScreen(): Promise<void> | void;
  exitFullScreen(): Promise<void> | void;
  isDocumentFullScreen(): boolean;
}

export interface IRepeatingClock {
  every(ms: number, fn: () => void): ReturnType<typeof setInterval>;
  clear(id: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void;
}

type FullscreenSessionOptions = {
  body: HTMLElement;
  grid: IFullscreenGrid;
  toolbar: IFullscreenButton;
  titles: ITitlesVisibility;
  fullScreen: IDocumentFullScreen;
  clock: IRepeatingClock;
  reporter: Pick<ActivityReporter, 'success'>;
  appText: Pick<AppText, 'fullscreenSlotsText'>;
};

export class FullscreenSession {
  private readonly fullscreenState: FullscreenState = { savedTitlesHidden: null, digitBuffer: '', digitTimer: null, slots: 12, randInterval: null };

  constructor(private readonly session: FullscreenSessionOptions) {}

  async enterFullScreen(): Promise<void> {
    const { grid, titles, fullScreen, toolbar } = this.session;
    try {
      this.fullscreenState.savedTitlesHidden = grid.areTitlesHidden();
      titles.setTitlesHidden(true);
      await fullScreen.enterFullScreen();
      toolbar.setFullscreenButtonState(true);
      grid.fsApplySlots(this.fullscreenState.slots);
    } catch (e) {
      console.warn(e);
    }
  }

  async exitFullScreen(): Promise<void> {
    this.stopFsRandomizer();
    try {
      await this.session.fullScreen.exitFullScreen();
    } catch (e) {
      console.warn(e);
    }
  }

  onFsToggle(): void {
    if (!this.session.fullScreen.isDocumentFullScreen()) void this.enterFullScreen();
    else void this.exitFullScreen();
  }

  onGlobalKeyDown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (key === 'f' || key === 'F') {
      this.onFsToggle();
      e.preventDefault();
      return;
    }
    if (!this.session.fullScreen.isDocumentFullScreen()) return;
    if (key >= '0' && key <= '9') {
      this.fullscreenState.digitBuffer += key;
      if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
      this.fullscreenState.digitTimer = setTimeout(() => {
        const v = parseInt(this.fullscreenState.digitBuffer, 10);
        this.fullscreenState.digitBuffer = '';
        if (!Number.isNaN(v)) {
          const { grid, reporter, appText } = this.session;
          this.fullscreenState.slots = grid.normalizeFullscreenSlots(v);
          grid.fsApplySlots(this.fullscreenState.slots);
          reporter.success(appText.fullscreenSlotsText(this.fullscreenState.slots), 1500);
        }
      }, 600);
      e.preventDefault();
    }
  }

  private startFsRandomizer(): void {
    if (this.fullscreenState.randInterval) return;
    this.fullscreenState.randInterval = this.session.clock.every(3000, () => {
      if (this.session.fullScreen.isDocumentFullScreen()) this.session.grid.rotateVisibleClip();
    });
  }

  private stopFsRandomizer(): void {
    if (this.fullscreenState.randInterval) {
      this.session.clock.clear(this.fullscreenState.randInterval);
      this.fullscreenState.randInterval = null;
    }
    this.session.grid.cancelRotation();
  }

  destroy(): void {
    this.stopFsRandomizer();
    if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
    this.fullscreenState.digitTimer = null;
    this.fullscreenState.digitBuffer = '';
  }

  onFsChange(): void {
    const { body, fullScreen, grid, titles, toolbar } = this.session;
    const active = fullScreen.isDocumentFullScreen();
    body.classList.toggle('fs-active', active);
    if (!active) {
      if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
      this.fullscreenState.digitTimer = null;
      this.fullscreenState.digitBuffer = '';
      grid.fsRestore();
      this.stopFsRandomizer();
      if (this.fullscreenState.savedTitlesHidden !== null) {
        titles.setTitlesHidden(this.fullscreenState.savedTitlesHidden);
        this.fullscreenState.savedTitlesHidden = null;
      }
      toolbar.setFullscreenButtonState(false);
      grid.computeGrid();
    } else {
      grid.fsApplySlots(this.fullscreenState.slots);
      this.startFsRandomizer();
      toolbar.setFullscreenButtonState(true);
    }
  }
}
