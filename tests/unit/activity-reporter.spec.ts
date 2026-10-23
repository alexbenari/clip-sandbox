import { describe, expect, it } from 'vitest';

import { ActivityLogger } from '../../src/app/activity-logger.js';
import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

function reporterWithLog() {
  const activityLog = recordedActivityLog();
  return { reporter: new ActivityReporter(activityLog), entries: activityLog.entries };
}

describe('ActivityReporter', () => {
  it('records a success that clears after a default time, or after the time the caller gives', () => {
    const { reporter, entries } = reporterWithLog();

    reporter.success('Saved subset.txt');
    reporter.success('Deleted 2 clips', 4500);

    expect(entries).toEqual([
      { kind: 'success', message: 'Saved subset.txt', timeoutMs: expect.any(Number) },
      { kind: 'success', message: 'Deleted 2 clips', timeoutMs: 4500 },
    ]);
    expect((entries[0] as { timeoutMs: number }).timeoutMs).toBeGreaterThan(0);
  });

  it('records progress and failures with their recovery details', () => {
    const { reporter, entries } = reporterWithLog();

    reporter.progress('Saving settings…');
    reporter.failure('Could not open archive.', { affected: 'Open pipeline', recovery: 'Refresh Pipelines.' });

    expect(entries).toEqual([
      { kind: 'progress', message: 'Saving settings…' },
      { kind: 'error', message: 'Could not open archive.', affected: 'Open pipeline', recovery: 'Refresh Pipelines.' },
    ]);
  });

  it('records a note that is neither progress nor an error', () => {
    const { reporter, entries } = reporterWithLog();

    reporter.information('Ignored unknown settings: version');

    expect(entries).toEqual([{ kind: 'information', message: 'Ignored unknown settings: version' }]);
  });

  it('resolves a failure it reported once the caller says the problem is gone', () => {
    const activity = new ActivityLogger();
    const reporter = new ActivityReporter(activity);

    const failure = reporter.failure('Could not load Pipelines.', { affected: 'Pipelines' });
    reporter.resolveFailure(failure);

    expect(activity.snapshot.entries).toEqual([expect.objectContaining({ message: 'Could not load Pipelines.', resolution: 'resolved' })]);
  });

  it('describes an error by its stack, and any other value as text', () => {
    const { reporter } = reporterWithLog();
    const error = new Error('disk full');

    expect(reporter.technicalDetailsOf(error)).toBe(error.stack);
    expect(reporter.technicalDetailsOf('EBUSY')).toBe('EBUSY');
  });
});
