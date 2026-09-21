import { describe, expect, it, vi } from 'vitest';

import { ApplicationShutdownCoordinator } from '../../src/app/application-shutdown-coordinator.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('ApplicationShutdownCoordinator', () => {
  it('stops actions and begins disposal synchronously, then destroys controls after successful disposal', async () => {
    const events: string[] = [];
    const disposal = deferred<void>();
    const coordinator = new ApplicationShutdownCoordinator({
      stopActions: () => { events.push('stop-actions'); },
      disposeWorkflow: () => {
        events.push('dispose-workflow');
        return disposal.promise;
      },
      destroyControls: () => { events.push('destroy-controls'); },
    });

    const cleanup = coordinator.begin();
    expect(events).toEqual(['stop-actions', 'dispose-workflow']);

    disposal.resolve();
    await cleanup;

    expect(events).toEqual(['stop-actions', 'dispose-workflow', 'destroy-controls']);
  });

  it('defers control destruction while workflow disposal remains pending', async () => {
    const disposal = deferred<void>();
    const destroyControls = vi.fn();
    const coordinator = new ApplicationShutdownCoordinator({
      stopActions: vi.fn(),
      disposeWorkflow: () => disposal.promise,
      destroyControls,
    });

    const cleanup = coordinator.begin();
    await Promise.resolve();
    expect(destroyControls).not.toHaveBeenCalled();

    disposal.resolve();
    await cleanup;
    expect(destroyControls).toHaveBeenCalledOnce();
  });

  it('reports disposal failure, still destroys controls, and resolves cleanup', async () => {
    const disposalError = new Error('workflow disposal failed');
    const reportFailure = vi.fn();
    const destroyControls = vi.fn();
    const coordinator = new ApplicationShutdownCoordinator({
      stopActions: vi.fn(),
      disposeWorkflow: () => Promise.reject(disposalError),
      destroyControls,
      reportFailure,
    });

    await expect(coordinator.begin()).resolves.toBeUndefined();

    expect(reportFailure).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(disposalError);
    expect(destroyControls).toHaveBeenCalledOnce();
  });

  it('reports synchronous phase failures while continuing the remaining shutdown phases', async () => {
    const stopError = new Error('stop failed');
    const destroyError = new Error('destroy failed');
    const disposeWorkflow = vi.fn(async () => undefined);
    const reportFailure = vi.fn();
    const coordinator = new ApplicationShutdownCoordinator({
      stopActions: () => { throw stopError; },
      disposeWorkflow,
      destroyControls: () => { throw destroyError; },
      reportFailure,
    });

    await expect(coordinator.begin()).resolves.toBeUndefined();

    expect(disposeWorkflow).toHaveBeenCalledOnce();
    expect(reportFailure.mock.calls).toEqual([[stopError], [destroyError]]);
  });

  it('returns one cleanup promise and performs shutdown work only once', async () => {
    const disposal = deferred<void>();
    const stopActions = vi.fn();
    const disposeWorkflow = vi.fn(() => disposal.promise);
    const destroyControls = vi.fn();
    const coordinator = new ApplicationShutdownCoordinator({
      stopActions,
      disposeWorkflow,
      destroyControls,
    });

    const first = coordinator.begin();
    const second = coordinator.begin();
    expect(second).toBe(first);
    expect(stopActions).toHaveBeenCalledOnce();
    expect(disposeWorkflow).toHaveBeenCalledOnce();
    expect(destroyControls).not.toHaveBeenCalled();

    disposal.resolve();
    await first;

    const third = coordinator.begin();
    expect(third).toBe(first);
    expect(stopActions).toHaveBeenCalledOnce();
    expect(disposeWorkflow).toHaveBeenCalledOnce();
    expect(destroyControls).toHaveBeenCalledOnce();
  });
});
