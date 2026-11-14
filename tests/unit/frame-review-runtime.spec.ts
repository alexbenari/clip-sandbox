// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { deferred } from '../support/deferred.js';
import { flushPendingWork } from '../support/flush-pending-work.js';

const require = createRequire(import.meta.url);
const { FrameReviewRuntime } = require('../../electron/frame-review-runtime.cjs');

const configuration = { applicationFolder: 'D:\\clip-sandbox' };

function fakeHosts(dispose = () => Promise.resolve()) {
  const created: FakeHost[] = [];
  class FakeHost {
    dispose = vi.fn(dispose);
    forgetPreparedReview = vi.fn(async (_sourcePath: string) => undefined);
    constructor(readonly configuration: unknown) { created.push(this); }
  }
  return { hostClass: FakeHost, created };
}

describe('FrameReviewRuntime', () => {
  it('answers the host opened for the window an event came from', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });

    const host = runtime.openHost(7);

    expect(runtime.hostForEvent({ sender: { id: 7 } })).toBe(host);
  });

  it('refuses an event from a window that has no host', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });
    runtime.openHost(7);

    expect(() => runtime.hostForEvent({ sender: { id: 8 } })).toThrow('No frame-review host exists for this window.');
  });

  it('builds each host from the runtime configuration', () => {
    const hosts = fakeHosts();
    const runtime = new FrameReviewRuntime({ ...hosts, configuration });

    runtime.openHost(7);

    expect(hosts.created.map(host => host.configuration)).toEqual([configuration]);
  });

  it('stops answering a released window', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });

    runtime.releaseHost(7, runtime.openHost(7));

    expect(() => runtime.hostForEvent({ sender: { id: 7 } })).toThrow('No frame-review host exists for this window.');
  });

  it('disposes a released window\'s host', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });
    const host = runtime.openHost(7);

    runtime.releaseHost(7, host);

    expect(host.dispose).toHaveBeenCalled();
  });

  it('disposes a released window\'s host even when a release listener fails', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });
    runtime.onHostReleased(() => { throw new Error('listener failed'); });
    const host = runtime.openHost(7);

    expect(() => runtime.releaseHost(7, host)).toThrow('listener failed');
    expect(host.dispose).toHaveBeenCalled();
  });

  it('tells release listeners which window was released', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });
    const listener = vi.fn();
    runtime.onHostReleased(listener);

    runtime.releaseHost(7, runtime.openHost(7));

    expect(listener.mock.calls).toEqual([[7]]);
  });

  it('keeps a reopened window\'s new host when the old host is released late', () => {
    const runtime = new FrameReviewRuntime({ ...fakeHosts(), configuration });
    const oldHost = runtime.openHost(7);
    const newHost = runtime.openHost(7);

    runtime.releaseHost(7, oldHost);

    expect(runtime.hostForEvent({ sender: { id: 7 } })).toBe(newHost);
  });

  it('forgets prepared reviews on one host that no window owns', async () => {
    const hosts = fakeHosts();
    const runtime = new FrameReviewRuntime({ ...hosts, configuration });
    runtime.openHost(7);

    await runtime.forgetPreparedReview('D:\\cache\\a.mkv');
    await runtime.forgetPreparedReview('D:\\cache\\b.mkv');

    const maintenanceHost = hosts.created[1];
    expect(hosts.created).toHaveLength(2);
    expect(maintenanceHost.forgetPreparedReview.mock.calls).toEqual([['D:\\cache\\a.mkv'], ['D:\\cache\\b.mkv']]);
  });

  it('disposes every window host and the window-less host', async () => {
    const hosts = fakeHosts();
    const runtime = new FrameReviewRuntime({ ...hosts, configuration });
    runtime.openHost(7);
    runtime.openHost(8);
    await runtime.forgetPreparedReview('D:\\cache\\a.mkv');

    await runtime.dispose();

    expect(hosts.created.map(host => host.dispose.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('finishes disposing only after a released host has finished disposing', async () => {
    const releasedDisposal = deferred<void>();
    const runtime = new FrameReviewRuntime({ ...fakeHosts(() => releasedDisposal.promise), configuration });
    runtime.releaseHost(7, runtime.openHost(7));
    let disposed = false;

    const disposal = runtime.dispose().then(() => { disposed = true; });
    await flushPendingWork();
    expect(disposed).toBe(false);
    releasedDisposal.resolve();
    await disposal;

    expect(disposed).toBe(true);
  });
});
