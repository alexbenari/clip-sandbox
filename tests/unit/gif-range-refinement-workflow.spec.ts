import { describe, expect, it, vi } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import { GifRangeRefinementWorkflow } from '../../src/app/gif-range-refinement-workflow.js';
import type { BeginRefinementResult } from '../../src/app/range-refinement.js';
import type { CapturedRangeId } from '../../src/domain/captured-range.js';
import { flushPendingWork } from '../support/flush-pending-work.js';

const range1 = 'range-1' as CapturedRangeId;
const range2 = 'range-2' as CapturedRangeId;
const started = { kind: 'started', session: {} } as unknown as BeginRefinementResult;

function gifRefinement({ discardStaged = true } = {}) {
  const pending = new Map<CapturedRangeId, (result: BeginRefinementResult) => void>();
  const session = {
    beginRefinement: vi.fn((rangeId: CapturedRangeId) => new Promise<BeginRefinementResult>(resolve => { pending.set(rangeId, resolve); })),
  };
  const captureList = Object.assign(new EventSource<{ refineRequested: CapturedRangeId }>(), { focusRange: vi.fn() });
  const refineScreen = Object.assign(new EventSource<{ backRequested: CapturedRangeId | null }>(), { id: 'refine-gif' });
  const navigation = { activate: vi.fn() };
  const reporter = { failure: vi.fn() };
  const stagedChanges = { confirmDiscard: vi.fn(async () => discardStaged) };
  const workflow = new GifRangeRefinementWorkflow({
    session, captureList, refineScreen, extractionScreenId: 'gif-extraction', navigation, stagedChanges, reporter,
  });
  const resolveWhenRequested = async (rangeId: CapturedRangeId, result: BeginRefinementResult) => {
    await vi.waitFor(() => expect(pending.has(rangeId)).toBe(true));
    pending.get(rangeId)?.(result);
  };
  return { workflow, resolveWhenRequested, session, captureList, refineScreen, navigation, reporter, stagedChanges };
}

describe('GifRangeRefinementWorkflow', () => {
  it('opens a started refinement on the Refine screen', async () => {
    const { captureList, resolveWhenRequested, navigation, session } = gifRefinement();

    captureList.emit('refineRequested', range1);
    await resolveWhenRequested(range1, started);

    await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledWith('refine-gif'));
    expect(session.beginRefinement).toHaveBeenCalledWith(range1);
  });

  it('acts only on the newest request when the user picks another range meanwhile', async () => {
    const { captureList, resolveWhenRequested, navigation } = gifRefinement();

    captureList.emit('refineRequested', range1);
    captureList.emit('refineRequested', range2);
    await resolveWhenRequested(range2, started);
    await resolveWhenRequested(range1, started);

    await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledOnce());
    await flushPendingWork();
    expect(navigation.activate).toHaveBeenCalledOnce();
  });

  it('keeps the staged refinement when the user keeps editing instead of choosing another range', async () => {
    const { workflow, session, stagedChanges } = gifRefinement({ discardStaged: false });

    await workflow.refine(range2);

    expect(stagedChanges.confirmDiscard).toHaveBeenCalledWith({ id: 'refine-gif' });
    expect(session.beginRefinement).not.toHaveBeenCalled();
  });

  it('reports a rejected refinement and stays on the current screen', async () => {
    const { workflow, resolveWhenRequested, navigation, reporter } = gifRefinement();

    const refining = workflow.refine(range1);
    await resolveWhenRequested(range1, { kind: 'rejected', message: 'Exact frame review is not ready for this range.' });
    await refining;

    expect(reporter.failure).toHaveBeenCalledWith('Exact frame review is not ready for this range.');
    expect(navigation.activate).not.toHaveBeenCalled();
  });

  it('says nothing more when the saved-frame check already reported why it stopped', async () => {
    const { workflow, resolveWhenRequested, navigation, reporter } = gifRefinement();

    const refining = workflow.refine(range1);
    await resolveWhenRequested(range1, { kind: 'stopped' });
    await refining;

    expect(reporter.failure).not.toHaveBeenCalled();
    expect(navigation.activate).not.toHaveBeenCalled();
  });

  it('goes back to GIF Extraction and focuses the range that was being refined', async () => {
    const { refineScreen, navigation, captureList } = gifRefinement();

    refineScreen.emit('backRequested', range1);

    await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledWith('gif-extraction'));
    expect(captureList.focusRange).toHaveBeenCalledWith(range1);
  });

  it('stays on Refine when the user keeps editing instead of discarding staged endpoints on Back', async () => {
    const { refineScreen, navigation, stagedChanges } = gifRefinement({ discardStaged: false });

    refineScreen.emit('backRequested', range1);
    await vi.waitFor(() => expect(stagedChanges.confirmDiscard).toHaveBeenCalledWith({ id: 'refine-gif' }));
    await flushPendingWork();

    expect(navigation.activate).not.toHaveBeenCalled();
  });
});
