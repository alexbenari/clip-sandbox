import { describe, expect, it } from 'vitest';

import { RefineScreenLeavePolicy, type IRefineScreenSession } from '../../src/app/refine-screen-leave-policy.js';
import type { UnlockedEndpointChange } from '../../src/app/range-refinement-draft.js';

const stagedEnd: readonly UnlockedEndpointChange[] = [{ endpoint: 'end', frameIndex: 7 }];

function session(unlockedChanges: readonly UnlockedEndpointChange[] = []): IRefineScreenSession {
  return { refinementDraft: { unlockedChanges } };
}

function policy(gif: IRefineScreenSession | null = session()) {
  return new RefineScreenLeavePolicy({ refineScreen: { id: 'refine-gif', session: gif } });
}

describe('RefineScreenLeavePolicy', () => {
  it('allows leaving Refine when nothing is staged', () => {
    expect(policy().canLeave({ id: 'refine-gif' })).toBe(true);
  });

  it('holds Refine while it has staged endpoints that are not locked', () => {
    expect(policy(session(stagedEnd)).canLeave({ id: 'refine-gif' })).toBe(false);
  });

  it('names the staged endpoints that leaving Refine would discard', () => {
    expect(policy(session(stagedEnd)).unlockedChangesOn({ id: 'refine-gif' })).toEqual(stagedEnd);
  });

  it('allows leaving any other screen even while a refinement is staged', () => {
    const leavePolicy = policy(session(stagedEnd));

    expect(leavePolicy.canLeave({ id: 'collection' })).toBe(true);
    expect(leavePolicy.unlockedChangesOn({ id: 'collection' })).toEqual([]);
  });

  it('allows leaving when the host has no GIF Extraction session', () => {
    expect(policy(null).canLeave({ id: 'refine-gif' })).toBe(true);
  });
});
