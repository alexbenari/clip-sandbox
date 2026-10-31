import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityLogger } from '../../src/app/activity-logger.js';

afterEach(() => { vi.useRealTimers(); });

describe('ActivityLogger', () => {
  it('keeps ordered named fields for a later subscriber', () => {
    const logger = new ActivityLogger();
    logger.log({ kind: 'information', message: 'Extracted clip.mp4 in 12 ms.', fields: [
      { label: 'Clip', value: 'clip.mp4' },
      { label: 'Destination folder', value: 'D:\\Clips' },
      { label: 'Source movie', value: 'movie.mp4' },
    ] });

    const seen: string[] = [];
    const unsubscribe = logger.subscribe(change => seen.push(change.added?.message ?? 'changed'));
    expect(logger.snapshot.entries).toMatchObject([{ message: 'Extracted clip.mp4 in 12 ms.', fields: [
      { label: 'Clip', value: 'clip.mp4' },
      { label: 'Destination folder', value: 'D:\\Clips' },
      { label: 'Source movie', value: 'movie.mp4' },
    ] }]);
    logger.log({ kind: 'progress', message: 'Saving collection' });
    unsubscribe();
    logger.log({ kind: 'success', message: 'Saved collection' });
    expect(seen).toEqual(['Saving collection']);
    logger.dispose();
  });

  it('retains unresolved errors through trimming and clearing, then resolves them', () => {
    const logger = new ActivityLogger({ maxEntries: 2 });
    const errorId = logger.log({ kind: 'error', message: 'Could not save', recovery: 'Try again' });
    for (const message of ['One', 'Two', 'Three']) logger.log({ kind: 'information', message });
    expect(logger.snapshot.entries.map(entry => entry.message)).toEqual(['Three', 'Two', 'Could not save']);
    expect(logger.clearHistory()).toEqual({ removed: 2, retainedErrors: 1 });
    logger.resolveError(errorId);
    expect(logger.snapshot.entries[0]).toMatchObject({ resolution: 'resolved' });
    logger.dismissError(errorId);
    expect(logger.snapshot.entries).toEqual([]);
    logger.dispose();
  });

  it('preserves progress and success status across informational entries and resets success', async () => {
    vi.useFakeTimers();
    const logger = new ActivityLogger();
    logger.log({ kind: 'progress', message: 'Working' });
    logger.log({ kind: 'information', message: 'Clip complete' });
    expect(logger.snapshot.state).toBe('progress');
    logger.log({ kind: 'success', message: 'Done', timeoutMs: 20 });
    expect(logger.snapshot.state).toBe('success');
    await vi.advanceTimersByTimeAsync(20);
    expect(logger.snapshot.state).toBe('idle');
    logger.dispose();
  });

  it('does not let an earlier success reset newer progress logged by a subscriber', async () => {
    vi.useFakeTimers();
    const logger = new ActivityLogger();
    logger.subscribe(change => {
      if (change.added?.message === 'Saved first clip') {
        logger.log({ kind: 'progress', message: 'Extracting next clip' });
      }
    });
    logger.log({ kind: 'success', message: 'Saved first clip', timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(logger.snapshot.state).toBe('progress');
    logger.dispose();
  });
});
