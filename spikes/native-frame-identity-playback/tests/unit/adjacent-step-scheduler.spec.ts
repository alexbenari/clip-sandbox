import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdjacentStepScheduler } from '../../src/adapter/adjacent-step-scheduler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('adjacent step scheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for a deliberate hold before issuing the second adjacent request', async () => {
    vi.useFakeTimers();
    const first = deferred<number>();
    const second = deferred<number>();
    const third = deferred<number>();
    const pending = [first, second, third];
    const calls: number[] = [];
    const frames: number[] = [];
    const scheduler = new AdjacentStepScheduler({
      stepAdjacent: (direction) => {
        calls.push(direction);
        return pending.shift()!.promise;
      },
    }, (frame) => frames.push(frame));

    scheduler.setSourceGeneration(7);
    scheduler.press(1);
    scheduler.press(1);
    expect(calls).toEqual([1]);

    first.resolve(101);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);
    expect(frames).toEqual([101]);

    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([1, 1]);

    second.resolve(102);
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toEqual([101, 102]);
    expect(calls).toEqual([1, 1]);

    await vi.advanceTimersByTimeAsync(149);
    expect(calls).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([1, 1, 1]);

    scheduler.release(1);
    third.resolve(103);
    await scheduler.whenIdle();
    expect(calls).toEqual([1, 1, 1]);
  });

  it('suppresses a response from an old source generation', async () => {
    const request = deferred<number>();
    const frames: number[] = [];
    const scheduler = new AdjacentStepScheduler({
      stepAdjacent: () => request.promise,
    }, (frame) => frames.push(frame));

    scheduler.setSourceGeneration(1);
    scheduler.press(-1);
    scheduler.setSourceGeneration(2);
    request.resolve(99);
    await scheduler.whenIdle();

    expect(frames).toEqual([]);
  });

  it('delivers the requested frame after a quick key tap', async () => {
    const request = deferred<number>();
    const frames: number[] = [];
    const scheduler = new AdjacentStepScheduler({
      stepAdjacent: () => request.promise,
    }, (frame) => frames.push(frame));

    scheduler.setSourceGeneration(1);
    scheduler.press(1);
    scheduler.release(1);
    request.resolve(41);
    await scheduler.whenIdle();

    expect(frames).toEqual([41]);
  });
});
