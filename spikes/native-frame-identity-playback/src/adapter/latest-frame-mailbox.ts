import { BackendError } from '../model/backend-error.js';

interface Mail<TInput, TOutput> {
  readonly input: TInput;
  readonly revision: number;
  readonly resolve: (value: TOutput) => void;
  readonly reject: (error: Error) => void;
}

export class LatestFrameMailbox<TInput, TOutput> {
  #inFlight = false;
  #pending: Mail<TInput, TOutput> | null = null;
  #revision = 0;

  constructor(private readonly execute: (input: TInput) => Promise<TOutput>) {}

  submit(input: TInput): Promise<TOutput> {
    const revision = ++this.#revision;
    return new Promise<TOutput>((resolve, reject) => {
      const mail = { input, revision, resolve, reject };
      if (this.#inFlight) {
        this.#pending?.reject(stale('Superseded before native execution.'));
        this.#pending = mail;
      } else {
        void this.#run(mail);
      }
    });
  }

  invalidate(): void {
    ++this.#revision;
    this.#pending?.reject(stale('Mailbox invalidated by a source change.'));
    this.#pending = null;
  }

  get queuedCount(): number {
    return (this.#inFlight ? 1 : 0) + (this.#pending ? 1 : 0);
  }

  async #run(mail: Mail<TInput, TOutput>): Promise<void> {
    this.#inFlight = true;
    try {
      const value = await this.execute(mail.input);
      if (mail.revision === this.#revision) mail.resolve(value);
      else mail.reject(stale('Native response was superseded by a newer request.'));
    } catch (error) {
      mail.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      const next = this.#pending;
      this.#pending = null;
      if (next) void this.#run(next);
      else this.#inFlight = false;
    }
  }
}

function stale(message: string): BackendError {
  return new BackendError('stale-response', message, true);
}
