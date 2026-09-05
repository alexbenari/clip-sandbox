import { describe, expect, it } from 'vitest';

import { PreparationProgressTracker } from '../../src/preparation/preparation-progress.mjs';

describe('preparation progress', () => {
  it('reports monotonic phase progress and a progressively refined ETA', () => {
    let now = 1_000;
    const events: Array<Record<string, unknown>> = [];
    const tracker = new PreparationProgressTracker((event: Record<string, unknown>) => events.push(event), () => now);

    tracker.begin('indexing');
    now = 3_000;
    tracker.update(20, 100);
    now = 5_000;
    tracker.update(50, 100);
    now = 6_000;
    tracker.complete();

    expect(events.map((event) => event.percent)).toEqual([0, 20, 50, 100]);
    expect(events[1]).toMatchObject({ phase: 'indexing', etaMs: 8_000 });
    expect(events[2]).toMatchObject({ phase: 'indexing', etaMs: 4_000 });
  });

  it('does not move a phase backward when a tool repeats older progress', () => {
    const events: Array<Record<string, unknown>> = [];
    const tracker = new PreparationProgressTracker((event: Record<string, unknown>) => events.push(event));

    tracker.begin('preflight');
    tracker.update(50, 100);
    tracker.update(40, 100);

    expect(events.at(-1)?.percent).toBe(50);
  });
});
