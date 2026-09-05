import { describe, expect, it, vi } from 'vitest';

import { ScrubRequestScheduler } from '../../src/adapter/scrub-request-scheduler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

describe('scrub request scheduler', () => {
  it('executes only the newest position after the debounce interval', async () => {
    vi.useFakeTimers();
    const executed: number[] = [];
    const scheduler = new ScrubRequestScheduler<number>((frameIndex) => {
      executed.push(frameIndex);
      return Promise.resolve(frameIndex);
    }, 100);

    const first = scheduler.submit(10);
    const second = scheduler.submit(20);
    const newest = scheduler.submit(30);

    await expect(first).rejects.toMatchObject({ category: 'stale-response' });
    await expect(second).rejects.toMatchObject({ category: 'stale-response' });
    expect(executed).toEqual([]);

    await vi.advanceTimersByTimeAsync(99);
    expect(executed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(newest).resolves.toBe(30);
    expect(executed).toEqual([30]);
    vi.useRealTimers();
  });

  it('waits for an obsolete in-flight landing before scheduling the newest position', async () => {
    vi.useFakeTimers();
    const firstLanding = deferred<number>();
    const executed: number[] = [];
    const scheduler = new ScrubRequestScheduler<number>((frameIndex) => {
      executed.push(frameIndex);
      return frameIndex === 10 ? firstLanding.promise : Promise.resolve(frameIndex);
    }, 100);

    const obsolete = scheduler.submit(10);
    await vi.advanceTimersByTimeAsync(100);
    const newest = scheduler.submit(30);
    await vi.advanceTimersByTimeAsync(100);
    expect(executed).toEqual([10]);

    firstLanding.resolve(10);
    await expect(obsolete).rejects.toMatchObject({ category: 'stale-response' });
    await vi.advanceTimersByTimeAsync(100);
    await expect(newest).resolves.toBe(30);
    expect(executed).toEqual([10, 30]);
    vi.useRealTimers();
  });

  it('does not surface a backend failure from a superseded landing', async () => {
    vi.useFakeTimers();
    const obsoleteLanding = deferred<number>();
    const scheduler = new ScrubRequestScheduler<number>((frameIndex) =>
      frameIndex === 10 ? obsoleteLanding.promise : Promise.resolve(frameIndex), 100);

    const obsolete = scheduler.submit(10);
    await vi.advanceTimersByTimeAsync(100);
    const newest = scheduler.submit(30);
    obsoleteLanding.reject(new Error('obsolete decoder failure'));

    await expect(obsolete).rejects.toMatchObject({ category: 'stale-response' });
    await vi.advanceTimersByTimeAsync(100);
    await expect(newest).resolves.toBe(30);
    vi.useRealTimers();
  });
});
