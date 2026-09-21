import { BackendError } from './model/backend-error.js';

interface IMail<TInput, TOutput> {
  readonly input: TInput;
  readonly sourceGeneration: number;
  readonly resolve: (value: TOutput) => void;
  readonly reject: (error: Error) => void;
}

export class ProgressiveFrameMailbox<TInput, TOutput> {
  private inFlight = false;
  private pending: IMail<TInput, TOutput> | null = null;
  private sourceGeneration = 0;

  constructor(private readonly execute: (input: TInput) => Promise<TOutput>) {}

  submit(input: TInput): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const mail = { input, sourceGeneration: this.sourceGeneration, resolve, reject };
      if (this.inFlight) {
        this.pending?.reject(this.stale('Superseded before native execution.'));
        this.pending = mail;
      } else {
        void this.run(mail);
      }
    });
  }

  invalidate(): void {
    this.sourceGeneration += 1;
    this.pending?.reject(this.stale('Mailbox invalidated by a source change.'));
    this.pending = null;
  }

  get queuedCount(): number {
    return (this.inFlight ? 1 : 0) + (this.pending ? 1 : 0);
  }

  private async run(mail: IMail<TInput, TOutput>): Promise<void> {
    this.inFlight = true;
    try {
      const value = await this.execute(mail.input);
      if (mail.sourceGeneration === this.sourceGeneration) mail.resolve(value);
      else mail.reject(this.stale('Native response belongs to an obsolete source.'));
    } catch (error) {
      mail.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      const next = this.pending;
      this.pending = null;
      if (next) void this.run(next);
      else this.inFlight = false;
    }
  }

  private stale(message: string): BackendError {
    return new BackendError('stale-response', message, true);
  }
}
