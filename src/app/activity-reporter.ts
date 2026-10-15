import type { ActivityErrorOptions, ActivityInput } from './activity-logger.js';

export interface IActivityLog {
  log(entry: ActivityInput): void;
}

export class ActivityReporter {
  constructor(private readonly activityLog: IActivityLog) {}

  success(message: string, timeoutMs = 2500): void {
    this.activityLog.log({ kind: 'success', message, timeoutMs });
  }

  progress(message: string): void {
    this.activityLog.log({ kind: 'progress', message });
  }

  failure(message: string, options?: ActivityErrorOptions): void {
    this.activityLog.log({ kind: 'error', message, ...options });
  }

  technicalDetailsOf(error: unknown): string {
    return error instanceof Error ? error.stack ?? error.message : String(error);
  }
}
