// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockAdapter } from '../../src/adapters/browser/clock-adapter.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('clock adapter', () => {
  it('resolves delays and scheduled callbacks through the instance', async () => {
    vi.useFakeTimers();
    const clock = new ClockAdapter();
    const callback = vi.fn();

    const delayed = clock.delay(25);
    clock.after(10, callback);

    await vi.advanceTimersByTimeAsync(10);
    expect(callback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15);
    await expect(delayed).resolves.toBeUndefined();
  });

  it('starts and clears intervals through the instance', async () => {
    vi.useFakeTimers();
    const clock = new ClockAdapter();
    const callback = vi.fn();

    const intervalId = clock.every(5, callback);
    await vi.advanceTimersByTimeAsync(16);
    expect(callback).toHaveBeenCalledTimes(3);

    clock.clear(intervalId);
    await vi.advanceTimersByTimeAsync(20);
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
