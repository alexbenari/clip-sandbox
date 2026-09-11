const ACTIVITY_INDICATOR_STYLE_ID = 'activityIndicatorStyles';
const DEFAULT_ACTIVITY_INDICATOR_CSS = `
.activity-indicator-host{position:relative;display:flex;align-items:center}
.activity-indicator-btn{min-width:108px;height:34px;padding:0 12px;display:inline-flex;align-items:center;gap:8px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:rgba(71,85,105,.8);box-shadow:none}
.activity-status-dot{width:8px;height:8px;flex:0 0 8px;border-radius:999px;background:var(--muted,#94a3b8)}
.activity-indicator-btn[data-state="progress"] .activity-status-dot{background:var(--ready,#22c55e);animation:activity-indicator-pulse 1.1s ease-in-out infinite}
.activity-indicator-btn[data-state="success"] .activity-status-dot{background:var(--ready,#22c55e)}
.activity-indicator-btn[data-state="error"] .activity-status-dot{background:var(--danger,#ef4444)}
.activity-indicator-panel{position:absolute;top:calc(100% + 10px);right:0;width:min(360px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.96);box-shadow:0 18px 38px rgba(0,0,0,.35)}
.activity-indicator-panel[hidden]{display:none!important}
.activity-history-region{position:relative;min-height:0;max-height:min(55vh,420px);overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
.activity-history-region::-webkit-scrollbar{display:none;width:0;height:0}
.activity-history-region[data-overflow-bottom="true"]{mask-image:linear-gradient(#000 calc(100% - 12px),transparent)}
.activity-history-region[data-overflow-top="true"]{mask-image:linear-gradient(transparent,#000 12px)}
.activity-history-region[data-overflow-top="true"][data-overflow-bottom="true"]{mask-image:linear-gradient(transparent,#000 12px,#000 calc(100% - 12px),transparent)}
.activity-indicator-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.activity-indicator-entry{padding:8px 10px;border-radius:10px;background:rgba(15,23,42,.92);color:#e5e7eb;overflow-wrap:anywhere;font-size:13px;line-height:1.4}
.activity-indicator-entry[data-state="error"]{border:1px solid rgba(239,68,68,.4)}
.activity-indicator-entry[data-state="progress"]{border:1px solid rgba(34,197,94,.25)}
.activity-indicator-entry[data-resolution="resolved"]{border-color:#334155;color:#cbd5e1}
.activity-indicator-entry-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.activity-indicator-entry-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.activity-indicator-entry button,.activity-clear-history{font:inherit;font-size:12px;padding:4px 7px}
.activity-indicator-feedback{display:block;margin-top:7px;color:#cbd5e1;font-size:12px}
.activity-indicator-details{margin-top:8px}
.activity-indicator-details pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.activity-indicator-clear-feedback{min-height:1.2em;color:#cbd5e1;font-size:12px}
@media(prefers-reduced-motion:reduce){.activity-indicator-btn[data-state="progress"] .activity-status-dot{animation:none}}
@keyframes activity-indicator-pulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(34,197,94,.32)}70%{transform:scale(1.06);box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(34,197,94,0)}}
`;

export type ActivityErrorOptions = {
  affected?: string;
  recovery?: string;
  technicalDetails?: string;
  retry?: () => Promise<void | { ok: true } | { ok: false; error: string }>;
};

type ActivityState = 'idle' | 'progress' | 'success';
type EntryBase = { id: string; message: string };
type ErrorEntry = EntryBase & ActivityErrorOptions & {
  kind: 'error'; resolution: 'unresolved' | 'resolved'; retryBusy: boolean; copyBusy: boolean; feedback: string;
};
type ActivityEntry = (EntryBase & { kind: 'progress' | 'success' | 'information' }) | ErrorEntry;
type EntryView = { node: HTMLLIElement; error?: {
  status: HTMLElement; feedback: HTMLElement; clear: HTMLButtonElement; retry?: HTMLButtonElement; copy?: HTMLButtonElement;
} };
type ActivityWindow = Window & typeof globalThis;

export class ActivityIndicatorControl {
  private readonly button: HTMLButtonElement | null;
  private readonly panel: HTMLElement | null;
  private readonly listEl: HTMLElement | null;
  private readonly doc: Document;
  private readonly win: ActivityWindow;
  private readonly maxEntries: number;
  private readonly requestPanelOpen?: () => void;
  private readonly writeClipboard?: (text: string) => Promise<void>;
  private readonly statusDot: HTMLElement | null;
  private readonly statusLabel: HTMLElement | null;
  private entries: ActivityEntry[] = [];
  private readonly views = new Map<string, EntryView>();
  private readonly listeners: (() => void)[] = [];
  private historyRegion: HTMLElement | null = null;
  private empty: HTMLElement | null = null;
  private clearHistoryButton: HTMLButtonElement | null = null;
  private clearFeedback: HTMLElement | null = null;
  private resizeObserver?: ResizeObserver;
  private state: ActivityState = 'idle';
  private resetTimer: number | null = null;
  private nextEntryNumber = 1;
  private destroyed = false;

  constructor({
    root, button, panel, listEl,
    document: doc = root?.ownerDocument || document,
    win = doc.defaultView || window,
    maxEntries = 50, requestPanelOpen, requestPanelClose, writeClipboard,
  }: {
    root?: HTMLElement | null; button?: HTMLButtonElement | null; panel?: HTMLElement | null; listEl?: HTMLElement | null;
    document?: Document; win?: ActivityWindow; maxEntries?: number;
    requestPanelClose?: () => void; requestPanelOpen?: () => void; writeClipboard?: (text: string) => Promise<void>;
  } = {}) {
    this.button = button || null;
    this.panel = panel || null;
    this.listEl = listEl || null;
    this.doc = doc;
    this.win = win;
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 50;
    this.requestPanelOpen = requestPanelOpen;
    this.writeClipboard = writeClipboard;
    this.statusDot = button ? this.ensureStatusElement(button, 'activity-status-dot') : null;
    this.statusLabel = button ? this.ensureStatusElement(button, 'activity-status-label') : null;
    this.statusDot?.setAttribute('aria-hidden', 'true');
    if (!root || !button || !panel || !listEl) return;
    this.ensureStyles();
    root.classList.add('activity-indicator-host');
    button.classList.add('activity-indicator-btn');
    panel.classList.add('activity-indicator-panel');
    listEl.classList.add('activity-indicator-list');
    if (!requestPanelOpen) this.listen(button, 'click', () => this.setPanelOpen(!!panel.hidden));
    const closeButton = panel.querySelector<HTMLButtonElement>('[data-utility-close]');
    if (closeButton) this.listen(closeButton, 'click', () => {
      if (requestPanelClose) requestPanelClose();
      else this.setPanelOpen(false);
    });
    this.prepareHistoryRegion();
    this.setState('idle');
    this.setPanelOpen(false);
    this.renderHistory();
  }

  show(message: string, timeout = 2500): void { this.showSuccess(message, timeout); }

  showProgress(message: string): void {
    this.clearResetTimer();
    this.setState('progress');
    this.addEntry(message, 'progress');
  }

  showInformation(message: string): void { this.addEntry(message, 'information'); }

  showSuccess(message: string, timeout = 2500): void {
    this.clearResetTimer();
    this.setState('success');
    this.addEntry(message, 'success');
    this.resetTimer = this.win.setTimeout(() => {
      this.resetTimer = null;
      this.setState('idle');
    }, Number.isFinite(timeout) && timeout >= 0 ? timeout : 2500);
  }

  showError(message: string, options?: ActivityErrorOptions): string {
    this.clearResetTimer();
    this.state = 'idle';
    const id = `activity-error-${this.nextEntryNumber++}`;
    this.entries.unshift({ id, kind: 'error', message, ...options, resolution: 'unresolved', retryBusy: false, copyBusy: false, feedback: '' });
    this.trimEntries();
    this.renderHistory();
    this.renderStatus();
    if (this.requestPanelOpen) this.requestPanelOpen();
    else this.setPanelOpen(true);
    return id;
  }

  resolveError(id: string): void {
    const entry = this.entries.find(candidate => candidate.id === id);
    if (entry?.kind !== 'error') return;
    entry.resolution = 'resolved';
    entry.retryBusy = false;
    entry.feedback = '';
    this.trimEntries();
    this.renderHistory();
    this.renderStatus();
  }

  focusInitial(): void {
    (this.historyRegion || this.panel)?.focus({ preventScroll: true });
    this.updateOverflow();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearResetTimer();
    this.resizeObserver?.disconnect();
    for (const remove of this.listeners.splice(0)) remove();
    this.views.clear();
    this.entries = [];
  }

  private clearResetTimer(): void {
    if (this.resetTimer !== null) this.win.clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }

  private listen<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener);
    this.listeners.push(() => target.removeEventListener(type, listener));
  }

  private prepareHistoryRegion(): void {
    if (!this.panel || !this.listEl) return;
    const region = this.doc.createElement('div');
    region.className = 'activity-history-region';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Activity history');
    this.listEl.parentElement?.insertBefore(region, this.listEl);
    this.empty = this.doc.createElement('p');
    this.empty.textContent = 'No activity yet.';
    region.append(this.empty, this.listEl);
    this.historyRegion = region;
    this.listen(region, 'keydown', (event: KeyboardEvent) => this.handleHistoryKeyDown(event));
    this.listen(region, 'scroll', () => this.updateOverflow());
    if (this.win.ResizeObserver) {
      this.resizeObserver = new this.win.ResizeObserver(() => this.updateOverflow());
      this.resizeObserver.observe(region);
      this.resizeObserver.observe(this.listEl);
    }
    this.clearHistoryButton = this.makeButton('Clear history', () => this.clearHistory());
    this.clearHistoryButton.className = 'activity-clear-history';
    this.clearFeedback = this.doc.createElement('div');
    this.clearFeedback.className = 'activity-indicator-clear-feedback';
    this.clearFeedback.setAttribute('role', 'status');
    this.panel.append(this.clearHistoryButton, this.clearFeedback);
  }

  private ensureStatusElement(button: HTMLButtonElement, className: string): HTMLElement {
    const existing = button.querySelector<HTMLElement>(`.${className}`);
    if (existing) return existing;
    const element = this.doc.createElement('span');
    element.className = className;
    button.append(element);
    return element;
  }

  private setState(state: ActivityState): void {
    this.state = state;
    this.renderStatus();
  }

  private renderStatus(): void {
    if (!this.button) return;
    const unresolvedErrorCount = this.entries.filter(
      entry => entry.kind === 'error' && entry.resolution === 'unresolved',
    ).length;
    const renderedState = unresolvedErrorCount > 0 ? 'error' : this.state;
    const visibleStatus = unresolvedErrorCount > 0
      ? `${unresolvedErrorCount} error${unresolvedErrorCount === 1 ? '' : 's'}`
      : this.state === 'progress' ? 'Working…' : 'Ready';
    const accessibleStatus = unresolvedErrorCount > 0
      ? `${unresolvedErrorCount} unresolved error${unresolvedErrorCount === 1 ? '' : 's'}`
      : this.state === 'progress' ? 'Working' : 'Ready';
    const semanticName = `Activity and Errors: ${accessibleStatus}`;

    this.button.dataset.state = renderedState;
    this.button.setAttribute('aria-label', semanticName);
    this.button.title = semanticName;
    if (this.statusLabel) this.statusLabel.textContent = visibleStatus;
  }

  private setPanelOpen(open: boolean): void {
    if (!this.panel || !this.button) return;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) this.updateOverflow();
  }

  private addEntry(message: string, kind: 'progress' | 'success' | 'information'): void {
    if (this.clearFeedback) this.clearFeedback.textContent = '';
    this.entries.unshift({ id: `activity-${this.nextEntryNumber++}`, kind, message });
    this.trimEntries();
    this.renderHistory();
  }

  private trimEntries(): void {
    let clearable = 0;
    this.entries = this.entries.filter(entry => (entry.kind === 'error' && entry.resolution === 'unresolved') || ++clearable <= this.maxEntries);
  }

  private renderHistory(): void {
    if (!this.listEl || this.destroyed) return;
    const liveIds = new Set(this.entries.map(entry => entry.id));
    for (const [id, view] of this.views) {
      if (liveIds.has(id)) continue;
      if (view.node.contains(this.doc.activeElement)) this.focusInitial();
      view.node.remove();
      this.views.delete(id);
    }
    let previous: Node | null = null;
    for (const entry of this.entries) {
      let view = this.views.get(entry.id);
      if (!view) { view = this.createEntryView(entry); this.views.set(entry.id, view); }
      this.updateEntryView(entry, view);
      const next: ChildNode | null = previous ? previous.nextSibling : this.listEl.firstChild;
      if (next !== view.node) this.listEl.insertBefore(view.node, next);
      previous = view.node;
    }
    if (this.empty) this.empty.hidden = this.entries.length > 0;
    this.updateOverflow();
  }

  private createEntryView(entry: ActivityEntry): EntryView {
    const node = this.doc.createElement('li');
    node.className = 'activity-indicator-entry';
    node.tabIndex = -1;
    node.dataset.entryId = entry.id;
    node.dataset.state = entry.kind;
    const message = this.doc.createElement('div');
    message.textContent = entry.message;
    node.append(message);
    const view: EntryView = { node };
    if (entry.kind !== 'error') return view;
    const status = this.doc.createElement('div');
    status.className = 'activity-indicator-feedback';
    node.append(status);
    if (entry.affected) this.appendText(node, 'Affected: ', entry.affected);
    if (entry.recovery) this.appendText(node, 'Recovery: ', entry.recovery);
    let copy: HTMLButtonElement | undefined;
    if (entry.technicalDetails) {
      const details = this.doc.createElement('details');
      details.className = 'activity-indicator-details';
      const summary = this.doc.createElement('summary');
      summary.textContent = 'Technical details';
      const pre = this.doc.createElement('pre');
      pre.textContent = entry.technicalDetails;
      copy = this.makeButton('Copy details', () => { void this.copyDetails(entry); });
      details.append(summary, pre, copy);
      details.addEventListener('toggle', () => this.updateOverflow());
      node.append(details);
    }
    const actions = this.doc.createElement('div');
    actions.className = 'activity-indicator-entry-actions';
    let retry: HTMLButtonElement | undefined;
    if (entry.retry) { retry = this.makeButton('Retry', () => { void this.retryEntry(entry); }); actions.append(retry); }
    const clear = this.makeButton('Clear error', () => this.dismissError(entry));
    actions.append(clear);
    const feedback = this.doc.createElement('div');
    feedback.className = 'activity-indicator-feedback';
    feedback.setAttribute('role', 'status');
    node.append(actions, feedback);
    view.error = { status, feedback, retry, clear, copy };
    return view;
  }

  private updateEntryView(entry: ActivityEntry, view: EntryView): void {
    if (entry.kind !== 'error' || !view.error) return;
    view.node.dataset.resolution = entry.resolution;
    view.node.setAttribute('aria-busy', String(entry.retryBusy));
    const { status, feedback, retry, clear, copy } = view.error;
    status.textContent = entry.resolution === 'resolved' ? 'Resolved' : 'Unresolved';
    if (feedback.textContent !== entry.feedback) feedback.textContent = entry.feedback;
    if (retry) {
      retry.textContent = entry.retryBusy ? 'Retrying…' : 'Retry';
      this.setDisabled(retry, entry.retryBusy || entry.resolution === 'resolved', view.node);
    }
    this.setDisabled(clear, entry.retryBusy, view.node);
    if (copy) this.setDisabled(copy, entry.copyBusy, view.node);
  }

  private setDisabled(button: HTMLButtonElement, disabled: boolean, fallback: HTMLElement): void {
    if (disabled && this.doc.activeElement === button) fallback.focus({ preventScroll: true });
    button.disabled = disabled;
  }

  private makeButton(label: string, action: () => void): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button'; button.textContent = label;
    // Row listeners are collected with their removed nodes, not retained in the control's disposal list.
    button.addEventListener('click', () => { if (!this.destroyed) action(); });
    return button;
  }

  private appendText(parent: HTMLElement, prefix: string, value: string): void {
    const line = this.doc.createElement('div');
    const label = this.doc.createElement('strong'); label.textContent = prefix;
    line.append(label, this.doc.createTextNode(value));
    parent.append(line);
  }

  private clearHistory(): void {
    const retained = this.entries.filter(entry => entry.kind === 'error' && entry.resolution === 'unresolved');
    const removed = this.entries.length - retained.length;
    this.entries = retained;
    this.renderHistory();
    if (this.clearFeedback) this.clearFeedback.textContent = retained.length ? `Cleared ${removed} entries; ${retained.length} unresolved error${retained.length === 1 ? '' : 's'} retained.` : `Cleared ${removed} entries.`;
    this.renderStatus();
  }

  private dismissError(entry: ErrorEntry): void {
    if (entry.retryBusy) return;
    this.entries = this.entries.filter(candidate => candidate !== entry);
    this.renderHistory();
    this.renderStatus();
  }

  private async retryEntry(entry: ErrorEntry): Promise<void> {
    if (!entry.retry || entry.retryBusy || entry.resolution === 'resolved') return;
    entry.retryBusy = true;
    entry.feedback = '';
    this.renderHistory();
    let failure: string | undefined;
    try {
      const result = await entry.retry();
      if (result && result.ok === false) failure = result.error;
    } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    if (this.destroyed || !this.entries.includes(entry)) return;
    entry.retryBusy = false;
    if (failure !== undefined) { entry.feedback = `Retry failed: ${failure}`; this.renderHistory(); }
    else this.resolveError(entry.id);
  }

  private async copyDetails(entry: ErrorEntry): Promise<void> {
    if (!entry.technicalDetails || entry.copyBusy) return;
    entry.copyBusy = true;
    this.renderHistory();
    let feedback: string;
    try {
      if (!this.writeClipboard) throw new Error('Clipboard is unavailable.');
      await this.writeClipboard(entry.technicalDetails);
      feedback = 'Technical details copied.';
    } catch (error) { feedback = `Copy failed: ${error instanceof Error ? error.message : String(error)}`; }
    if (this.destroyed || !this.entries.includes(entry)) return;
    entry.copyBusy = false;
    entry.feedback = feedback;
    this.renderHistory();
  }

  private handleHistoryKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('button,input,textarea,select,summary,a,[contenteditable]')) return;
    if (!this.entries.length) return;
    const active = this.doc.activeElement;
    const current = this.entries.findIndex(entry => this.views.get(entry.id)?.node === active);
    let target: number;
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = this.entries.length - 1;
    else if (event.key === 'ArrowDown') target = Math.min(this.entries.length - 1, current + 1);
    else if (event.key === 'ArrowUp') target = Math.max(0, current - 1);
    else if (event.key === 'PageDown' || event.key === 'PageUp') target = this.pageTarget(Math.max(0, current), event.key === 'PageDown' ? 1 : -1);
    else return;
    event.preventDefault();
    const view = this.views.get(this.entries[target].id);
    view?.node.focus({ preventScroll: true });
    view?.node.scrollIntoView?.({ block: 'nearest' });
  }

  private pageTarget(current: number, direction: 1 | -1): number {
    const start = this.views.get(this.entries[current].id)?.node.getBoundingClientRect().top ?? 0;
    const distance = this.historyRegion?.clientHeight ?? 0;
    let target = current;
    for (let index = current + direction; index >= 0 && index < this.entries.length; index += direction) {
      target = index;
      const top = this.views.get(this.entries[index].id)?.node.getBoundingClientRect().top ?? start;
      if (Math.abs(top - start) >= distance) break;
    }
    return target;
  }

  private updateOverflow(): void {
    const region = this.historyRegion;
    if (!region) return;
    region.dataset.overflowTop = String(region.scrollTop > 1);
    region.dataset.overflowBottom = String(region.scrollTop + region.clientHeight < region.scrollHeight - 1);
  }

  private ensureStyles(): void {
    if (this.doc.getElementById(ACTIVITY_INDICATOR_STYLE_ID)) return;
    const style = this.doc.createElement('style');
    style.id = ACTIVITY_INDICATOR_STYLE_ID;
    style.textContent = DEFAULT_ACTIVITY_INDICATOR_CSS;
    (this.doc.head || this.doc.documentElement).appendChild(style);
  }
}
