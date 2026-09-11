import type { ShortcutDescriptor } from '../ui/app-screen.js';
import type { AppText } from './app-text.js';
import type { DisplayLayoutRules } from '../ui/display-layout-rules.js';

export const FULLSCREEN_SHORTCUTS: readonly ShortcutDescriptor[] = [
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

type FullscreenSessionOptions = {
  body: HTMLElement;
  setFullscreenButtonState: (active: boolean) => void;
  isTitlesHidden: () => boolean;
  setTitlesHidden: (hidden: boolean) => void;
  enterFullScreenAdapter: (doc: Document) => Promise<void> | void;
  exitFullScreenAdapter: (doc: Document) => Promise<void> | void;
  isFullscreen: () => boolean;
  fsApplySlots: (slots: number) => void;
  rotateVisibleClip: () => void;
  cancelRotation: () => void;
  fsRestore: () => void;
  computeGrid: () => void;
  showStatus: (message: string, durationMs?: number) => void;
  layoutRules: Pick<DisplayLayoutRules, 'normalizeFullscreenSlots'>;
  appText: Pick<AppText, 'fullscreenSlotsText'>;
  every: (ms: number, fn: () => void) => ReturnType<typeof setInterval>;
  clearClock: (id: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) => void;
};

export class FullscreenSession {
  private readonly fullscreenState: FullscreenState = { savedTitlesHidden: null, digitBuffer: '', digitTimer: null, slots: 12, randInterval: null };
  private readonly body: HTMLElement;
  private readonly setFullscreenButtonState: (active: boolean) => void;
  private readonly isTitlesHidden: () => boolean;
  private readonly setTitlesHidden: (hidden: boolean) => void;
  private readonly enterFullScreenAdapter: (doc: Document) => Promise<void> | void;
  private readonly exitFullScreenAdapter: (doc: Document) => Promise<void> | void;
  private readonly isFullscreen: () => boolean;
  private readonly fsApplySlots: (slots: number) => void;
  private readonly rotateVisibleClip: () => void;
  private readonly cancelRotation: () => void;
  private readonly fsRestore: () => void;
  private readonly computeGrid: () => void;
  private readonly showStatus: (message: string, durationMs?: number) => void;
  private readonly layoutRules: Pick<DisplayLayoutRules, 'normalizeFullscreenSlots'>;
  private readonly appText: Pick<AppText, 'fullscreenSlotsText'>;
  private readonly every: (ms: number, fn: () => void) => ReturnType<typeof setInterval>;
  private readonly clearClock: (id: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) => void;

  constructor({
    body,
    setFullscreenButtonState,
    isTitlesHidden,
    setTitlesHidden,
    enterFullScreenAdapter,
    exitFullScreenAdapter,
    isFullscreen,
    fsApplySlots,
    rotateVisibleClip,
    cancelRotation,
    fsRestore,
    computeGrid,
    showStatus,
    layoutRules,
    appText,
    every,
    clearClock,
  }: FullscreenSessionOptions) {
    this.body = body;
    this.setFullscreenButtonState = setFullscreenButtonState;
    this.isTitlesHidden = isTitlesHidden;
    this.setTitlesHidden = setTitlesHidden;
    this.enterFullScreenAdapter = enterFullScreenAdapter;
    this.exitFullScreenAdapter = exitFullScreenAdapter;
    this.isFullscreen = isFullscreen;
    this.fsApplySlots = fsApplySlots;
    this.rotateVisibleClip = rotateVisibleClip;
    this.cancelRotation = cancelRotation;
    this.fsRestore = fsRestore;
    this.computeGrid = computeGrid;
    this.showStatus = showStatus;
    this.layoutRules = layoutRules;
    this.appText = appText;
    this.every = every;
    this.clearClock = clearClock;
  }

  async enterFullScreen(): Promise<void> {
    try {
      this.fullscreenState.savedTitlesHidden = this.isTitlesHidden();
      this.setTitlesHidden(true);
      await this.enterFullScreenAdapter(document);
      this.setFullscreenButtonState(true);
      this.fsApplySlots(this.fullscreenState.slots);
    } catch (e) {
      console.warn(e);
    }
  }

  async exitFullScreen(): Promise<void> {
    this.stopFsRandomizer();
    try {
      await this.exitFullScreenAdapter(document);
    } catch (e) {
      console.warn(e);
    }
  }

  onFsToggle(): void {
    if (!this.isFullscreen()) void this.enterFullScreen();
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
    if (!this.isFullscreen()) return;
    if (key >= '0' && key <= '9') {
      this.fullscreenState.digitBuffer += key;
      if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
      this.fullscreenState.digitTimer = setTimeout(() => {
        const v = parseInt(this.fullscreenState.digitBuffer, 10);
        this.fullscreenState.digitBuffer = '';
        if (!Number.isNaN(v)) {
          this.fullscreenState.slots = this.layoutRules.normalizeFullscreenSlots(v);
          this.fsApplySlots(this.fullscreenState.slots);
          this.showStatus(this.appText.fullscreenSlotsText(this.fullscreenState.slots), 1500);
        }
      }, 600);
      e.preventDefault();
    }
  }

  private startFsRandomizer(): void {
    if (this.fullscreenState.randInterval) return;
    this.fullscreenState.randInterval = this.every(3000, () => {
      if (this.isFullscreen()) this.rotateVisibleClip();
    });
  }

  private stopFsRandomizer(): void {
    if (this.fullscreenState.randInterval) {
      this.clearClock(this.fullscreenState.randInterval);
      this.fullscreenState.randInterval = null;
    }
    this.cancelRotation();
  }

  destroy(): void {
    this.stopFsRandomizer();
    if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
    this.fullscreenState.digitTimer = null;
    this.fullscreenState.digitBuffer = '';
  }

  onFsChange(): void {
    const active = this.isFullscreen();
    this.body.classList.toggle('fs-active', active);
    if (!active) {
      if (this.fullscreenState.digitTimer) clearTimeout(this.fullscreenState.digitTimer);
      this.fullscreenState.digitTimer = null;
      this.fullscreenState.digitBuffer = '';
      this.fsRestore();
      this.stopFsRandomizer();
      if (this.fullscreenState.savedTitlesHidden !== null) {
        this.setTitlesHidden(this.fullscreenState.savedTitlesHidden);
        this.fullscreenState.savedTitlesHidden = null;
      }
      this.setFullscreenButtonState(false);
      this.computeGrid();
    } else {
      this.fsApplySlots(this.fullscreenState.slots);
      this.startFsRandomizer();
      this.setFullscreenButtonState(true);
    }
  }
}
