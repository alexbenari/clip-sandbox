import { describe, expect, it } from 'vitest';

import type { ActivityInput } from '../../src/app/activity-logger.js';
import { ActivityReporter } from '../../src/app/activity-reporter.js';

function reporterWithLog(): { reporter: ActivityReporter; entries: ActivityInput[] } {
  const entries: ActivityInput[] = [];
  return { reporter: new ActivityReporter({ log: entry => { entries.push(entry); } }), entries };
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

  it('describes an error by its stack, and any other value as text', () => {
    const { reporter } = reporterWithLog();
    const error = new Error('disk full');

    expect(reporter.technicalDetailsOf(error)).toBe(error.stack);
    expect(reporter.technicalDetailsOf('EBUSY')).toBe('EBUSY');
  });
});
