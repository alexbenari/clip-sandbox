import { describe, expect, it, vi } from 'vitest';

import { RefineScreenLeavePolicy, type IRefineScreenSession } from '../../src/app/refine-screen-leave-policy.js';
import type { UnlockedEndpointChange } from '../../src/app/range-refinement-draft.js';

const stagedEnd: readonly UnlockedEndpointChange[] = [{ endpoint: 'end', frameIndex: 7 }];

function session({ extracting = false, unlockedChanges = [] as readonly UnlockedEndpointChange[] } = {}): IRefineScreenSession {
  return {
    snapshot: { extractionBatch: extracting ? { total: 1, completed: 0 } : null },
    refinementDraft: { unlockedChanges },
  };
}

function policy({ gif = session(), collection = session() as IRefineScreenSession | null } = {}) {
  const reporter = { progress: vi.fn() };
  const leavePolicy = new RefineScreenLeavePolicy({
    refineScreens: [{ id: 'refine-gif', session: gif }, { id: 'collection-refine', session: collection }],
    collectionRefineScreenId: 'collection-refine',
    reporter,
  });
  return { leavePolicy, reporter };
}

describe('RefineScreenLeavePolicy', () => {
  it('blocks leaving the collection Refine screen while its extraction batch runs, and says why', () => {
    const { leavePolicy, reporter } = policy({ collection: session({ extracting: true }) });

    expect(leavePolicy.canLeave({ id: 'collection-refine' })).toBe(false);
    expect(reporter.progress).toHaveBeenCalledWith(
      'Wait for the collection clip to finish saving, or cancel extraction before leaving Refine.');
  });

  it('allows leaving the collection Refine screen when no extraction is running and nothing is staged', () => {
    const { leavePolicy, reporter } = policy();

    expect(leavePolicy.canLeave({ id: 'collection-refine' })).toBe(true);
    expect(reporter.progress).not.toHaveBeenCalled();
  });

  it('allows leaving GIF Refine while its extraction runs, since extraction continues in the background', () => {
    const { leavePolicy } = policy({ gif: session({ extracting: true }) });

    expect(leavePolicy.canLeave({ id: 'refine-gif' })).toBe(true);
  });

  it('holds GIF Refine while it has staged endpoints that are not locked', () => {
    const { leavePolicy } = policy({ gif: session({ unlockedChanges: stagedEnd }) });

    expect(leavePolicy.canLeave({ id: 'refine-gif' })).toBe(false);
  });

  it('holds collection Refine while it has staged endpoints that are not locked', () => {
    const { leavePolicy } = policy({ collection: session({ unlockedChanges: stagedEnd }) });

    expect(leavePolicy.canLeave({ id: 'collection-refine' })).toBe(false);
  });

  it('names the staged endpoints that leaving a Refine screen would discard', () => {
    const { leavePolicy } = policy({ gif: session({ unlockedChanges: stagedEnd }) });

    expect(leavePolicy.unlockedChangesOn({ id: 'refine-gif' })).toEqual(stagedEnd);
    expect(leavePolicy.unlockedChangesOn({ id: 'collection-refine' })).toEqual([]);
  });

  it('says Collection Refine is held by its running extraction even when endpoints are also staged', () => {
    const { leavePolicy } = policy({ collection: session({ extracting: true, unlockedChanges: stagedEnd }) });

    expect(leavePolicy.holdOn({ id: 'collection-refine' })).toEqual({ kind: 'extraction-running' });
  });

  it('says a Refine screen with staged endpoints is held by those unlocked changes', () => {
    const { leavePolicy } = policy({ gif: session({ unlockedChanges: stagedEnd }) });

    expect(leavePolicy.holdOn({ id: 'refine-gif' })).toEqual({ kind: 'unlocked-changes', changes: stagedEnd });
  });

  it('allows leaving any other screen even while a refinement is staged or extracting', () => {
    const { leavePolicy } = policy({
      gif: session({ unlockedChanges: stagedEnd }),
      collection: session({ extracting: true, unlockedChanges: stagedEnd }),
    });

    expect(leavePolicy.canLeave({ id: 'collection' })).toBe(true);
    expect(leavePolicy.unlockedChangesOn({ id: 'collection' })).toEqual([]);
  });

  it('allows leaving when the host has no collection refinement session', () => {
    const { leavePolicy } = policy({ collection: null });

    expect(leavePolicy.canLeave({ id: 'collection-refine' })).toBe(true);
  });
});
