type FullscreenState = {
  savedTitlesHidden: boolean | null;
  digitBuffer: string;
  digitTimer: ReturnType<typeof setTimeout> | null;
  slots: number;
  randInterval: ReturnType<typeof setInterval> | null;
  randPending: boolean;
};

type FullscreenCard = HTMLElement & {
  dataset: DOMStringMap & {
    name?: string;
    objectUrl?: string;
    durationSeconds?: string;
  };
};

type FullscreenSessionOptions = {
  fullscreenState: FullscreenState;
  grid: HTMLElement;
  getGrid?: () => HTMLElement;
  body: HTMLElement;
  fsBtn: HTMLElement;
  isTitlesHidden: () => boolean;
  setTitlesHidden: (hidden: boolean) => void;
  enterFullScreenAdapter: (doc: Document) => Promise<void> | void;
  exitFullScreenAdapter: (doc: Document) => Promise<void> | void;
  isFullscreen: () => boolean;
  fsApplySlots: () => void;
  fsRestore: () => void;
  computeGrid: () => void;
  showStatus: (message: string, durationMs?: number) => void;
  normalizeFsSlots: (slots: number) => number;
  fullscreenSlotsText: (slots: number) => string;
  every: (ms: number, fn: () => void) => ReturnType<typeof setInterval>;
  clearClock: (id: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) => void;
  updateCardLabel: (card: HTMLElement, formatLabel: (name: string, durationSeconds: number | null) => string) => void;
  formatLabel: (name: string, durationSeconds: number | null) => string;
};

export class FullscreenSession {
  fullscreenState: FullscreenState;
  grid: HTMLElement;
  getGrid?: () => HTMLElement;
  body: HTMLElement;
  fsBtn: HTMLElement;
  isTitlesHidden: () => boolean;
  setTitlesHidden: (hidden: boolean) => void;
  enterFullScreenAdapter: (doc: Document) => Promise<void> | void;
  exitFullScreenAdapter: (doc: Document) => Promise<void> | void;
  isFullscreen: () => boolean;
  fsApplySlots: () => void;
  fsRestore: () => void;
  computeGrid: () => void;
  showStatus: (message: string, durationMs?: number) => void;
  normalizeFsSlots: (slots: number) => number;
  fullscreenSlotsText: (slots: number) => string;
  every: (ms: number, fn: () => void) => ReturnType<typeof setInterval>;
  clearClock: (id: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) => void;
  updateCardLabel: (card: HTMLElement, formatLabel: (name: string, durationSeconds: number | null) => string) => void;
  formatLabel: (name: string, durationSeconds: number | null) => string;

  constructor({
    fullscreenState,
    grid,
    getGrid,
    body,
    fsBtn,
    isTitlesHidden,
    setTitlesHidden,
    enterFullScreenAdapter,
    exitFullScreenAdapter,
    isFullscreen,
    fsApplySlots,
    fsRestore,
    computeGrid,
    showStatus,
    normalizeFsSlots,
    fullscreenSlotsText,
    every,
    clearClock,
    updateCardLabel,
    formatLabel,
  }: FullscreenSessionOptions) {
    this.fullscreenState = fullscreenState;
    this.grid = grid;
    this.getGrid = getGrid;
    this.body = body;
    this.fsBtn = fsBtn;
    this.isTitlesHidden = isTitlesHidden;
    this.setTitlesHidden = setTitlesHidden;
    this.enterFullScreenAdapter = enterFullScreenAdapter;
    this.exitFullScreenAdapter = exitFullScreenAdapter;
    this.isFullscreen = isFullscreen;
    this.fsApplySlots = fsApplySlots;
    this.fsRestore = fsRestore;
    this.computeGrid = computeGrid;
    this.showStatus = showStatus;
    this.normalizeFsSlots = normalizeFsSlots;
    this.fullscreenSlotsText = fullscreenSlotsText;
    this.every = every;
    this.clearClock = clearClock;
    this.updateCardLabel = updateCardLabel;
    this.formatLabel = formatLabel;
  }

  activeGrid(): HTMLElement {
    return this.getGrid?.() || this.grid;
  }

  async enterFullScreen(): Promise<void> {
    try {
      this.fullscreenState.savedTitlesHidden = this.isTitlesHidden();
      this.setTitlesHidden(true);
      await this.enterFullScreenAdapter(document);
      this.fsBtn.textContent = 'Exit Full Screen';
      this.fsApplySlots();
    } catch (e) {
      console.warn(e);
    }
  }

  async exitFullScreen(): Promise<void> {
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
          this.fullscreenState.slots = this.normalizeFsSlots(v);
          this.fsApplySlots();
          this.showStatus(this.fullscreenSlotsText(this.fullscreenState.slots), 1500);
        }
      }, 600);
      e.preventDefault();
    }
  }

  startFsRandomizer(): void {
    if (this.fullscreenState.randInterval) return;
    this.fullscreenState.randInterval = this.every(3000, () => {
      if (this.isFullscreen()) this.randomizeOnce();
    });
  }

  stopFsRandomizer(): void {
    if (this.fullscreenState.randInterval) {
      this.clearClock(this.fullscreenState.randInterval);
      this.fullscreenState.randInterval = null;
    }
    this.fullscreenState.randPending = false;
  }

  currentVisibleCards(): FullscreenCard[] {
    return Array.from(this.activeGrid().children)
      .filter((el): el is FullscreenCard => el instanceof HTMLElement && el.style.display !== 'none');
  }

  currentHiddenCards(): FullscreenCard[] {
    return Array.from(this.activeGrid().children)
      .filter((el): el is FullscreenCard => el instanceof HTMLElement && el.style.display === 'none');
  }

  waitForEnd(vid: HTMLVideoElement): Promise<void> {
    return new Promise((res) => {
      const h = () => {
        vid.removeEventListener('ended', h);
        res();
      };
      vid.addEventListener('ended', h, { once: true });
    });
  }

  swapCardContents(a: FullscreenCard, b: FullscreenCard): void {
    const va = a.querySelector('video');
    const vb = b.querySelector('video');
    if (!va || !vb) return;
    const na = a.dataset.name;
    const nb = b.dataset.name;
    const ua = a.dataset.objectUrl;
    const ub = b.dataset.objectUrl;
    const da = a.dataset.durationSeconds;
    const db = b.dataset.durationSeconds;
    a.dataset.name = nb;
    b.dataset.name = na;
    a.dataset.objectUrl = ub;
    b.dataset.objectUrl = ua;
    a.dataset.durationSeconds = db || '';
    b.dataset.durationSeconds = da || '';
    this.updateCardLabel(a, this.formatLabel);
    this.updateCardLabel(b, this.formatLabel);
    va.pause();
    vb.pause();
    va.src = ub || '';
    vb.src = ua || '';
    va.loop = true;
    vb.loop = true;
    va.muted = true;
    vb.muted = true;
    va.play().catch(() => {});
  }

  randomizeOnce(): void {
    if (!this.isFullscreen() || this.fullscreenState.randPending) return;
    const vis = this.currentVisibleCards();
    const hid = this.currentHiddenCards();
    if (vis.length <= 1 || hid.length === 0) return;
    const targetCard = vis[Math.floor(Math.random() * vis.length)];
    const replCard = hid[Math.floor(Math.random() * hid.length)];
    const v = targetCard.querySelector('video');
    if (!v) return;
    this.fullscreenState.randPending = true;
    v.loop = false;
    this.waitForEnd(v)
      .then(() => {
        this.swapCardContents(targetCard, replCard);
        replCard.style.display = 'none';
        targetCard.style.display = '';
        const v2 = targetCard.querySelector('video');
        if (!v2) return;
        v2.loop = true;
        v2.play().catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        this.fullscreenState.randPending = false;
      });
  }

  onFsChange(): void {
    const active = this.isFullscreen();
    this.body.classList.toggle('fs-active', active);
    if (!active) {
      this.fsRestore();
      this.stopFsRandomizer();
      if (this.fullscreenState.savedTitlesHidden !== null) {
        this.setTitlesHidden(this.fullscreenState.savedTitlesHidden);
        this.fullscreenState.savedTitlesHidden = null;
      }
      this.fsBtn.textContent = 'Full Screen';
      this.computeGrid();
    } else {
      this.fsApplySlots();
      this.startFsRandomizer();
      this.fsBtn.textContent = 'Exit Full Screen';
    }
  }
}

export function createFullscreenSession(options: FullscreenSessionOptions): FullscreenSession {
  return new FullscreenSession(options);
}
