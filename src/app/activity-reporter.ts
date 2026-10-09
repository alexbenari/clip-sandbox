import type { ActivityErrorOptions, ActivityInput } from './activity-logger.js';

export interface IActivityLog {
  log(entry: ActivityInput): void;
}

// Methods are bound properties because collaborators receive them as plain callbacks.
export class ActivityReporter {
  constructor(private readonly activityLog: IActivityLog) {}

  readonly success = (message: string, timeoutMs = 2500): void => {
    this.activityLog.log({ kind: 'success', message, timeoutMs });
  };

  readonly progress = (message: string): void => {
    this.activityLog.log({ kind: 'progress', message });
  };

  readonly failure = (message: string, options?: ActivityErrorOptions): void => {
    this.activityLog.log({ kind: 'error', message, ...options });
  };

  technicalDetailsOf(error: unknown): string {
    return error instanceof Error ? error.stack ?? error.message : String(error);
  }
}
