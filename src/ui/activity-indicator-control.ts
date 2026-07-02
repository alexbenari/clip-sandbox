const ACTIVITY_INDICATOR_STYLE_ID = 'activityIndicatorStyles';
const DEFAULT_ACTIVITY_INDICATOR_CSS = `
.activity-indicator-host{
  position:relative;
  display:flex;
  align-items:center;
}
.activity-indicator-btn{
  width:18px;
  height:18px;
  padding:0;
  border-radius:999px;
  border:1px solid rgba(148,163,184,.3);
  background:rgba(71,85,105,.8);
  box-shadow:none;
}
.activity-indicator-btn[data-state="progress"]{
  background:#22c55e;
  border-color:rgba(34,197,94,.7);
  animation:activity-indicator-pulse 1.1s ease-in-out infinite;
}
.activity-indicator-btn[data-state="success"]{
  background:#22c55e;
  border-color:rgba(34,197,94,.7);
}
.activity-indicator-btn[data-state="error"]{
  background:#ef4444;
  border-color:rgba(239,68,68,.75);
}
.activity-indicator-panel{
  position:absolute;
  top:calc(100% + 10px);
  right:0;
  width:min(360px, calc(100vw - 24px));
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:12px;
  border-radius:14px;
  border:1px solid rgba(148,163,184,.22);
  background:rgba(2,6,23,.96);
  box-shadow:0 18px 38px rgba(0,0,0,.35);
}
.activity-indicator-panel[hidden]{
  display:none !important;
}
.activity-indicator-list{
  margin:0;
  padding:0;
  list-style:none;
  display:flex;
  flex-direction:column;
  gap:8px;
}
.activity-indicator-entry{
  padding:8px 10px;
  border-radius:10px;
  background:rgba(15,23,42,.92);
  color:#e5e7eb;
  font-size:13px;
  line-height:1.4;
}
.activity-indicator-entry[data-state="error"]{
  border:1px solid rgba(239,68,68,.4);
}
.activity-indicator-entry[data-state="progress"]{
  border:1px solid rgba(34,197,94,.25);
}
@keyframes activity-indicator-pulse{
  0%{ transform:scale(1); box-shadow:0 0 0 0 rgba(34,197,94,.32); }
  70%{ transform:scale(1.06); box-shadow:0 0 0 8px rgba(34,197,94,0); }
  100%{ transform:scale(1); box-shadow:0 0 0 0 rgba(34,197,94,0); }
}
`;

type ActivityState = 'idle' | 'progress' | 'success' | 'error';
type ActivityEntry = { message: string; state: Exclude<ActivityState, 'idle'> };
type ActivityWindow = Window & typeof globalThis;

function ensureActivityIndicatorStyles(doc: Document): void {
  if (doc.getElementById(ACTIVITY_INDICATOR_STYLE_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = ACTIVITY_INDICATOR_STYLE_ID;
  styleEl.textContent = DEFAULT_ACTIVITY_INDICATOR_CSS;
  (doc.head || doc.documentElement).appendChild(styleEl);
}

function nextStateTimeout(timeout: number): number {
  return Number.isFinite(timeout) && timeout >= 0 ? timeout : 2500;
}

export class ActivityIndicatorControl {
  root: HTMLElement | null;
  button: HTMLButtonElement | null;
  panel: HTMLElement | null;
  listEl: HTMLElement | null;
  doc: Document;
  win: ActivityWindow;
  maxEntries: number;
  entries: ActivityEntry[];
  state: ActivityState;
  resetTimer: number | null;
  handleToggle: () => void;

  constructor({
    root,
    button,
    panel,
    listEl,
    document: doc = root?.ownerDocument || document,
    win = doc.defaultView || window,
    maxEntries = 5,
  }: {
    root?: HTMLElement | null;
    button?: HTMLButtonElement | null;
    panel?: HTMLElement | null;
    listEl?: HTMLElement | null;
    document?: Document;
    win?: ActivityWindow;
    maxEntries?: number;
  } = {}) {
    this.root = root || null;
    this.button = button || null;
    this.panel = panel || null;
    this.listEl = listEl || null;
    this.doc = doc;
    this.win = win;
    this.maxEntries = Math.max(1, Number(maxEntries) || 5);
    this.entries = [];
    this.state = 'idle';
    this.resetTimer = null;
    this.handleToggle = () => {
      this.setPanelOpen(!!this.panel?.hidden);
    };

    if (!root || !button || !panel || !listEl) return;

    ensureActivityIndicatorStyles(doc);
    root.classList.add('activity-indicator-host');
    button.classList.add('activity-indicator-btn');
    panel.classList.add('activity-indicator-panel');
    button.addEventListener('click', this.handleToggle);
    this.setState('idle');
    this.setPanelOpen(false);
    this.renderHistory();
  }

  clearResetTimer(): void {
    if (this.resetTimer) this.win.clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }

  setState(state: ActivityState = 'idle'): void {
    this.state = state;
    if (this.button) this.button.dataset.state = state;
  }

  setPanelOpen(isOpen: boolean): void {
    if (!this.panel || !this.button) return;
    const open = !!isOpen;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  addEntry(message: string, state: ActivityEntry['state']): void {
    this.entries.unshift({
      message: String(message || ''),
      state,
    });
    this.entries = this.entries.slice(0, this.maxEntries);
    this.renderHistory();
  }

  renderHistory(): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    for (const entry of this.entries) {
      const itemEl = this.doc.createElement('li');
      itemEl.className = 'activity-indicator-entry';
      itemEl.dataset.state = entry.state;
      itemEl.textContent = entry.message;
      this.listEl.appendChild(itemEl);
    }
  }

  show(message: string, timeout = 2500): void {
    this.showSuccess(message, timeout);
  }

  showProgress(message: string): void {
    this.clearResetTimer();
    this.setState('progress');
    this.addEntry(message, 'progress');
  }

  showSuccess(message: string, timeout = 2500): void {
    this.clearResetTimer();
    this.setState('success');
    this.addEntry(message, 'success');
    this.resetTimer = this.win.setTimeout(() => {
      this.setState('idle');
      this.resetTimer = null;
    }, nextStateTimeout(timeout));
  }

  showError(message: string): void {
    this.clearResetTimer();
    this.setState('error');
    this.addEntry(message, 'error');
    this.setPanelOpen(true);
  }
}

export function createActivityIndicatorControl(options?: ConstructorParameters<typeof ActivityIndicatorControl>[0]): ActivityIndicatorControl {
  return new ActivityIndicatorControl(options);
}

