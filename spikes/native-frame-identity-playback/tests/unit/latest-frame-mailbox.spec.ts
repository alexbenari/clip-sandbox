import { describe, expect, it } from 'vitest';

import { LatestFrameMailbox } from '../../src/adapter/latest-frame-mailbox.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('latest frame mailbox', () => {
  it('keeps one in-flight and only the newest pending scrub request', async () => {
    const first = deferred<number>();
    const executed: number[] = [];
    const mailbox = new LatestFrameMailbox<number, number>((value) => {
      executed.push(value);
      return value === 1 ? first.promise : Promise.resolve(value);
    });

    const obsoleteInFlight = mailbox.submit(1);
    const supersededPending = mailbox.submit(2);
    const newest = mailbox.submit(3);
    expect(mailbox.queuedCount).toBe(2);
    await expect(supersededPending).rejects.toMatchObject({ category: 'stale-response' });

    first.resolve(1);
    await expect(obsoleteInFlight).rejects.toMatchObject({ category: 'stale-response' });
    await expect(newest).resolves.toBe(3);
    expect(executed).toEqual([1, 3]);
    expect(mailbox.queuedCount).toBe(0);
  });
});
