import { describe, expect, it, vi } from 'vitest';

import { RefineScreenLeavePolicy } from '../../src/app/refine-screen-leave-policy.js';

const runningBatch = { snapshot: { extractionBatch: { total: 1, completed: 0 } } };
const idleSession = { snapshot: { extractionBatch: null } };

describe('RefineScreenLeavePolicy', () => {
  it('blocks leaving the collection Refine screen while its extraction batch runs, and says why', () => {
    const reportBlocked = vi.fn();
    const policy = new RefineScreenLeavePolicy('collection-refine', runningBatch, reportBlocked);

    expect(policy.canLeave({ id: 'collection-refine' })).toBe(false);
    expect(reportBlocked).toHaveBeenCalledWith(
      'Wait for the collection clip to finish saving, or cancel extraction before leaving Refine.');
  });

  it('allows leaving the collection Refine screen when no extraction is running', () => {
    const reportBlocked = vi.fn();
    const policy = new RefineScreenLeavePolicy('collection-refine', idleSession, reportBlocked);

    expect(policy.canLeave({ id: 'collection-refine' })).toBe(true);
    expect(reportBlocked).not.toHaveBeenCalled();
  });

  it('allows leaving any other screen even while the refinement extraction runs', () => {
    const policy = new RefineScreenLeavePolicy('collection-refine', runningBatch, vi.fn());

    expect(policy.canLeave({ id: 'collection' })).toBe(true);
  });

  it('allows leaving when the host has no collection refinement session', () => {
    const policy = new RefineScreenLeavePolicy('collection-refine', null, vi.fn());

    expect(policy.canLeave({ id: 'collection-refine' })).toBe(true);
  });
});
