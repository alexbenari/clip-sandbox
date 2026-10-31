export interface IActivityField {
  readonly label: string;
  readonly value: string;
}

export type ActivityErrorOptions = Readonly<{
  affected?: string;
  recovery?: string;
  technicalDetails?: string;
  retry?: () => Promise<void | { ok: true } | { ok: false; error: string }>;
}>;

type ActivityContent = Readonly<{
  message: string;
  details?: string;
  fields?: readonly IActivityField[];
}>;

export type ActivityInput = ActivityContent & (
  | Readonly<{ kind: 'information' | 'progress' }>
  | Readonly<{ kind: 'success'; timeoutMs?: number }>
  | (Readonly<{ kind: 'error' }> & ActivityErrorOptions)
);

type EntryBase = ActivityContent & { id: string };
export type ActivityErrorEntry = EntryBase & ActivityErrorOptions & {
  kind: 'error'; resolution: 'unresolved' | 'resolved'; retryBusy: boolean; copyBusy: boolean; feedback: string;
};
export type ActivityEntry = (EntryBase & { kind: 'information' | 'progress' | 'success' }) | ActivityErrorEntry;
export type ActivityState = 'idle' | 'progress' | 'success';
export type ActivityChange = Readonly<{ entries: readonly ActivityEntry[]; state: ActivityState; added?: ActivityEntry }>;

export class ActivityLogger {
  private entries: ActivityEntry[] = [];
  private state: ActivityState = 'idle';
  private nextEntryNumber = 1;
  private resetTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private readonly listeners = new Set<(change: ActivityChange) => void>();
  private readonly maxEntries: number;
  private readonly clock: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;

  constructor({ maxEntries = 50, clock = globalThis }: {
    maxEntries?: number;
    clock?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
  } = {}) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 50;
    this.clock = clock;
  }

  get snapshot(): ActivityChange { return { entries: [...this.entries], state: this.state }; }

  subscribe(listener: (change: ActivityChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  log(input: ActivityInput): string {
    if (input.kind !== 'information') this.clearResetTimer();
    if (input.kind === 'progress') this.state = 'progress';
    else if (input.kind === 'success') this.state = 'success';
    else if (input.kind === 'error') this.state = 'idle';
    const id = `activity-${input.kind === 'error' ? 'error-' : ''}${this.nextEntryNumber++}`;
    const content = {
      id, message: input.message, details: input.details,
      fields: input.fields?.map(field => ({ label: field.label, value: field.value })),
    };
    let entry: ActivityEntry;
    if (input.kind === 'error') {
      entry = { ...content, kind: 'error', affected: input.affected, recovery: input.recovery,
        technicalDetails: input.technicalDetails, retry: input.retry,
        resolution: 'unresolved', retryBusy: false, copyBusy: false, feedback: '' };
    } else {
      entry = { ...content, kind: input.kind };
    }
    this.entries.unshift(entry);
    this.trimEntries();
    if (input.kind === 'success') {
      const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs !== undefined && input.timeoutMs >= 0
        ? input.timeoutMs : 2500;
      this.resetTimer = this.clock.setTimeout(() => {
        this.resetTimer = null;
        this.state = 'idle';
        this.publish();
      }, timeout);
    }
    this.publish(entry);
    return id;
  }

  resolveError(id: string): void {
    const entry = this.error(id);
    if (!entry) return;
    entry.resolution = 'resolved';
    entry.retryBusy = false;
    entry.feedback = '';
    this.trimEntries();
    this.publish();
  }

  updateError(id: string, change: Partial<Pick<ActivityErrorEntry, 'retryBusy' | 'copyBusy' | 'feedback'>>): void {
    const entry = this.error(id);
    if (!entry) return;
    Object.assign(entry, change);
    this.publish();
  }

  dismissError(id: string): void {
    const entry = this.error(id);
    if (!entry || entry.retryBusy) return;
    this.entries = this.entries.filter(candidate => candidate.id !== id);
    this.publish();
  }

  clearHistory(): { removed: number; retainedErrors: number } {
    const retained = this.entries.filter(entry => entry.kind === 'error' && entry.resolution === 'unresolved');
    const removed = this.entries.length - retained.length;
    this.entries = retained;
    this.publish();
    return { removed, retainedErrors: retained.length };
  }

  has(id: string): boolean { return this.entries.some(entry => entry.id === id); }

  dispose(): void {
    this.clearResetTimer();
    this.listeners.clear();
    this.entries = [];
  }

  private error(id: string): ActivityErrorEntry | undefined {
    const entry = this.entries.find(candidate => candidate.id === id);
    return entry?.kind === 'error' ? entry : undefined;
  }

  private trimEntries(): void {
    let clearable = 0;
    this.entries = this.entries.filter(entry =>
      (entry.kind === 'error' && entry.resolution === 'unresolved') || ++clearable <= this.maxEntries);
  }

  private clearResetTimer(): void {
    if (this.resetTimer !== null) this.clock.clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }

  private publish(added?: ActivityEntry): void {
    const change = { entries: [...this.entries], state: this.state, added };
    for (const listener of this.listeners) listener(change);
  }
}
