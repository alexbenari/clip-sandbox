import { BackendError } from '../model/backend-error.js';

interface IScheduledRequest<TFrame> {
  readonly frameIndex: number;
  readonly revision: number;
  readonly resolve: (frame: TFrame) => void;
  readonly reject: (error: Error) => void;
}

export class ScrubRequestScheduler<TFrame> {
  #inFlight = false;
  #pending: IScheduledRequest<TFrame> | null = null;
  #revision = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;

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
      return Promise.reject(new BackendError(
        'invalid-request', 'Scrub frame index must be a non-negative safe integer.', true));
    }
    const revision = ++this.#revision;
    return new Promise<TFrame>((resolve, reject) => {
      this.#pending?.reject(stale('Superseded during the scrub debounce interval.'));
      this.#pending = { frameIndex, revision, resolve, reject };
      if (!this.#inFlight) this.#schedule();
    });
  }

  invalidate(): void {
    ++this.#revision;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#pending?.reject(stale('Scrub request invalidated by a source change.'));
    this.#pending = null;
  }

  get queuedCount(): number {
    return (this.#inFlight ? 1 : 0) + (this.#pending ? 1 : 0);
  }

  #schedule(): void {
    if (this.#inFlight || !this.#pending) return;
    if (this.#timer) clearTimeout(this.#timer);
    if (this.debounceMs === 0) {
      void this.#executePending();
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#executePending();
    }, this.debounceMs);
  }

  async #executePending(): Promise<void> {
    if (this.#inFlight || !this.#pending) return;
    const request = this.#pending;
    this.#pending = null;
    this.#inFlight = true;
    try {
      const frame = await this.execute(request.frameIndex);
      if (request.revision === this.#revision) request.resolve(frame);
      else request.reject(stale('Native scrub response was superseded by a newer position.'));
    } catch (error) {
      if (request.revision !== this.#revision) {
        request.reject(stale('Native scrub failure belonged to a superseded position.'));
      } else {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.#inFlight = false;
      this.#schedule();
    }
  }
}

function stale(message: string): BackendError {
  return new BackendError('stale-response', message, true);
}
