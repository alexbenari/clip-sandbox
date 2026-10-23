import type { ActivityInput } from '../../src/app/activity-logger.js';
import type { IActivityLog } from '../../src/app/activity-reporter.js';

export function recordedActivityLog(): IActivityLog & { readonly entries: ActivityInput[] } {
  const entries: ActivityInput[] = [];
  return {
    entries,
    log: entry => `activity-${entries.push(entry)}`,
    resolveError: () => undefined,
  };
}
