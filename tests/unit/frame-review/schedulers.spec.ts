import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdjacentStepScheduler } from '../../../src/frame-review/adjacent-step-scheduler.js';
import { ProgressiveFrameMailbox } from '../../../src/frame-review/progressive-frame-mailbox.js';
import { ScrubRequestScheduler } from '../../../src/frame-review/scrub-request-scheduler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

describe('bounded frame request scheduling', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('keeps one executing scrub and only the newest pending scrub', async () => {
    const firstLanding = deferred<number>();
    const calls: number[] = [];
    const mailbox = new ProgressiveFrameMailbox<number, number>((frame) => {
      calls.push(frame);
      return frame === 10 ? firstLanding.promise : Promise.resolve(frame);
    });

    const first = mailbox.submit(10);
    const replaced = mailbox.submit(20);
    const newest = mailbox.submit(30);

    await expect(replaced).rejects.toMatchObject({ category: 'stale-response' });
    firstLanding.resolve(10);
    await expect(first).resolves.toBe(10);
    await expect(newest).resolves.toBe(30);
    expect(calls).toEqual([10, 30]);
  });

  it('suppresses an obsolete scrub landing after a source change', async () => {
    const landing = deferred<number>();
    const mailbox = new ProgressiveFrameMailbox<number, number>(() => landing.promise);
    const request = mailbox.submit(7);
    mailbox.invalidate();
    landing.resolve(7);
    await expect(request).rejects.toMatchObject({ category: 'stale-response' });
  });

  it('debounces progress-bar scrubbing to its newest target', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const scheduler = new ScrubRequestScheduler(async (frame) => { calls.push(frame); return frame; }, 100);
    const first = scheduler.submit(1);
    const newest = scheduler.submit(8);
    await expect(first).rejects.toMatchObject({ category: 'stale-response' });
    await vi.advanceTimersByTimeAsync(100);
    await expect(newest).resolves.toBe(8);
    expect(calls).toEqual([8]);
  });

  it('accelerates a held adjacent-frame action without dropping its first tap', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const frames: number[] = [];
    const secondLanding = deferred<number>();
    const scheduler = new AdjacentStepScheduler(
      { stepAdjacent: async (direction) => {
        calls.push(direction);
        return calls.length === 1 ? 1 : secondLanding.promise;
      } },
      (frame) => frames.push(frame),
      undefined,
      { holdRepeatDelayMs: 250, repeatIntervalMs: 100 },
    );
    scheduler.setSourceGeneration(1);
    scheduler.press(1);
    await Promise.resolve();
    expect(frames).toEqual([1]);
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    scheduler.release(1);
    secondLanding.resolve(2);
    await scheduler.whenIdle();
  });

  it('repeats held adjacent-frame actions at four times the normal 150 ms cadence', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const scheduler = new AdjacentStepScheduler(
      { stepAdjacent: async (direction) => { calls.push(direction); return calls.length; } },
      () => undefined,
    );

    scheduler.press(1);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(37);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    scheduler.release(1);
    await vi.advanceTimersByTimeAsync(38);
    await scheduler.whenIdle();
  });
});
