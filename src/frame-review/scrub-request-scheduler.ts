import { BackendError } from './model/backend-error.js';

interface IScheduledRequest<TFrame> {
  readonly frameIndex: number;
  readonly revision: number;
  readonly resolve: (frame: TFrame) => void;
  readonly reject: (error: Error) => void;
}

export class ScrubRequestScheduler<TFrame> {
  private inFlight = false;
  private pending: IScheduledRequest<TFrame> | null = null;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly execute: (frameIndex: number) => Promise<TFrame>,
    private readonly debounceMs = 100,
  ) {
    if (!Number.isSafeInteger(debounceMs) || debounceMs < 0 || debounceMs > 1_000) {
      throw new Error('Scrub debounce must be an integer between 0 and 1000 milliseconds.');
    }
  }

  submit(frameIndex: number): Promise<TFrame> {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
      return Promise.reject(new BackendError('invalid-request', 'Scrub frame index must be non-negative.', true));
    }
    const requestRevision = ++this.revision;
    return new Promise((resolve, reject) => {
      this.pending?.reject(this.stale('Superseded during the scrub debounce interval.'));
      this.pending = { frameIndex, revision: requestRevision, resolve, reject };
      if (!this.inFlight) this.schedule();
    });
  }

  invalidate(): void {
    this.revision += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending?.reject(this.stale('Scrub request invalidated by a source change.'));
    this.pending = null;
  }

  get queuedCount(): number {
    return (this.inFlight ? 1 : 0) + (this.pending ? 1 : 0);
  }

  private schedule(): void {
    if (this.inFlight || !this.pending) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.debounceMs === 0) void this.executePending();
    else this.timer = setTimeout(() => { this.timer = null; void this.executePending(); }, this.debounceMs);
  }

  private async executePending(): Promise<void> {
    if (this.inFlight || !this.pending) return;
    const request = this.pending;
    this.pending = null;
    this.inFlight = true;
    try {
      const frame = await this.execute(request.frameIndex);
      if (request.revision === this.revision) request.resolve(frame);
      else request.reject(this.stale('Native scrub response was superseded by a newer position.'));
    } catch (error) {
      request.reject(request.revision === this.revision
        ? error instanceof Error ? error : new Error(String(error))
        : this.stale('Native scrub failure belonged to a superseded position.'));
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private stale(message: string): BackendError {
    return new BackendError('stale-response', message, true);
  }
}
