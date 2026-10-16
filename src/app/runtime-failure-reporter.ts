import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';

// Shows a failure in Activity and, when an error came with it, logs that error for diagnosis.
export class RuntimeFailureReporter {
  constructor(
    private readonly reporter?: Pick<ActivityReporter, 'failure'>,
    private readonly diagnostics?: Pick<AppDiagnostics, 'logRuntimeError'>,
  ) {}

  report(message: string, error?: unknown): void {
    this.reporter?.failure(message);
    if (error !== undefined) void this.diagnostics?.logRuntimeError(message, error);
  }
}
