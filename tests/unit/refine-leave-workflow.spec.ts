import { describe, expect, it, vi } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import type { UnlockedEndpointChange } from '../../src/app/range-refinement-draft.js';
import { RefineLeaveWorkflow, type IScreenChangeRequest } from '../../src/app/refine-leave-workflow.js';
import { RefineScreenLeavePolicy } from '../../src/app/refine-screen-leave-policy.js';
import { flushPendingWork } from '../support/flush-pending-work.js';

const stagedEnd: readonly UnlockedEndpointChange[] = [{ endpoint: 'end', frameIndex: 7 }];
const refineGif = { id: 'refine-gif' };
const extractionScreen = { id: 'gif-extraction' };

class FakeDiscardPrompt extends EventSource<{ confirmed: void; cancelled: void }> {
  open = vi.fn();
  close = vi.fn();
}

class FakeRefineSession {
  unlockedChanges: readonly UnlockedEndpointChange[];
  constructor(staged: readonly UnlockedEndpointChange[]) { this.unlockedChanges = staged; }
  get refinementDraft() { return { unlockedChanges: this.unlockedChanges }; }
  abandonRefinement = vi.fn(() => { this.unlockedChanges = []; return null; });
}

function leaveWorkflow({ staged = stagedEnd } = {}) {
  const session = new FakeRefineSession(staged);
  const refineScreens = [{ id: refineGif.id, session }];
  const policy = new RefineScreenLeavePolicy({ refineScreens });
  const prompt = new FakeDiscardPrompt();
  const navigation = { activeScreen: refineGif as { id: string }, activate: vi.fn((id: string) => { navigation.activeScreen = { id }; }) };
  const screenChanges = new EventSource<{ screenChangeRefused: IScreenChangeRequest; screenChanged: { id: string } }>();
  const workflow = new RefineLeaveWorkflow({ policy, prompt, refineScreens, navigation, screenChanges });
  return { workflow, session, prompt, navigation, screenChanges };
}

describe('RefineLeaveWorkflow', () => {
  it('asks what will be lost before discarding staged endpoints, and discards them on Discard', async () => {
    const { workflow, session, prompt } = leaveWorkflow();

    const answer = workflow.confirmDiscard(refineGif);
    expect(prompt.open).toHaveBeenCalledWith(stagedEnd);
    prompt.emit('confirmed');

    expect(await answer).toBe(true);
    expect(session.abandonRefinement).toHaveBeenCalledOnce();
  });

  it('keeps the staged endpoints when the user keeps editing', async () => {
    const { workflow, session, prompt } = leaveWorkflow();

    const answer = workflow.confirmDiscard(refineGif);
    prompt.emit('cancelled');

    expect(await answer).toBe(false);
    expect(session.abandonRefinement).not.toHaveBeenCalled();
  });

  it('does not ask when nothing staged differs from the captured range', async () => {
    const { workflow, prompt } = leaveWorkflow({ staged: [] });

    expect(await workflow.confirmDiscard(refineGif)).toBe(true);
    expect(prompt.open).not.toHaveBeenCalled();
  });

  it('completes a screen change held for staged endpoints once the user discards them', async () => {
    const { prompt, navigation, screenChanges } = leaveWorkflow();

    screenChanges.emit('screenChangeRefused', { from: refineGif, to: extractionScreen });
    expect(prompt.open).toHaveBeenCalledWith(stagedEnd);
    prompt.emit('confirmed');

    await vi.waitFor(() => expect(navigation.activeScreen).toEqual(extractionScreen));
  });

  it('stays on Refine when the user keeps editing after a held screen change', async () => {
    const { prompt, navigation, screenChanges } = leaveWorkflow();

    screenChanges.emit('screenChangeRefused', { from: refineGif, to: extractionScreen });
    prompt.emit('cancelled');
    await flushPendingWork();

    expect(navigation.activeScreen).toEqual(refineGif);
  });

  it('withdraws an open question when another screen becomes active', async () => {
    const { workflow, prompt, screenChanges } = leaveWorkflow();
    const answer = workflow.confirmDiscard(refineGif);

    screenChanges.emit('screenChanged', { id: 'collection' });

    expect(await answer).toBe(false);
    expect(prompt.close).toHaveBeenCalled();
  });

  it('settles an open question as Keep editing and closes the prompt when disposed', async () => {
    const { workflow, prompt } = leaveWorkflow();

    const answer = workflow.confirmDiscard(refineGif);
    workflow.dispose();

    expect(await answer).toBe(false);
    expect(prompt.close).toHaveBeenCalled();
  });
});
