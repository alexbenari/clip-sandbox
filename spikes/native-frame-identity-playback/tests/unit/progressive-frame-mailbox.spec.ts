import { describe, expect, it } from 'vitest';

import { ProgressiveFrameMailbox } from '../../src/adapter/progressive-frame-mailbox.js';

describe('progressive frame mailbox', () => {
  it('delivers completed in-flight frames while retaining only the newest pending position', async () => {
    const releases: Array<() => void> = [];
    const executed: number[] = [];
    const mailbox = new ProgressiveFrameMailbox<number, number>(async (value) => {
      executed.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
      return value;
    });

    const first = mailbox.submit(10);
    await Promise.resolve();
    const superseded = mailbox.submit(20);
    const latest = mailbox.submit(30);

    await expect(superseded).rejects.toMatchObject({ category: 'stale-response' });
    releases.shift()?.();
    await expect(first).resolves.toBe(10);
    await Promise.resolve();
    releases.shift()?.();
    await expect(latest).resolves.toBe(30);
    expect(executed).toEqual([10, 30]);
  });

  it('rejects an in-flight result after the source generation is invalidated', async () => {
    let release: (() => void) | undefined;
    const mailbox = new ProgressiveFrameMailbox<number, number>(async (value) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return value;
    });

    const request = mailbox.submit(10);
    await Promise.resolve();
    mailbox.invalidate();
    release?.();

    await expect(request).rejects.toMatchObject({ category: 'stale-response' });
  });
});
