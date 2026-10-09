import { describe, expect, it, vi } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import { GifRangeRefinementWorkflow } from '../../src/app/gif-range-refinement-workflow.js';
import type { CapturedRangeId } from '../../src/domain/captured-range.js';

const range1 = 'range-1' as CapturedRangeId;
const range2 = 'range-2' as CapturedRangeId;

function gifRefinement({ beginResult = { kind: 'started' as const } as { kind: 'started' } | { kind: 'rejected'; message: string } } = {}) {
  const preparations = new Map<CapturedRangeId, (prepared: boolean) => void>();
  const session = {
    prepareSavedRange: vi.fn((rangeId: CapturedRangeId) => new Promise<boolean>(resolve => { preparations.set(rangeId, resolve); })),
    beginRefinement: vi.fn(() => ({ ...beginResult, session: {} }) as never),
  };
  const captureList = Object.assign(new EventSource<{ refineRequested: CapturedRangeId }>(), { focusRange: vi.fn() });
  const refineScreen = Object.assign(new EventSource<{ backRequested: CapturedRangeId | null }>(), { id: 'refine-gif' });
  const navigation = { activate: vi.fn() };
  const reporter = { failure: vi.fn() };
  const workflow = new GifRangeRefinementWorkflow({
    session, captureList, refineScreen, extractionScreenId: 'gif-extraction', navigation, reporter,
  });
  return { workflow, preparations, session, captureList, refineScreen, navigation, reporter };
}

describe('GifRangeRefinementWorkflow', () => {
  it('checks a saved range, then opens it on the Refine screen', async () => {
    const { captureList, preparations, navigation, session } = gifRefinement();

    captureList.emit('refineRequested', range1);
    preparations.get(range1)?.(true);

    await vi.waitFor(() => expect(navigation.activate).toHaveBeenCalledWith('refine-gif'));
    expect(session.beginRefinement).toHaveBeenCalledWith(range1);
  });

  it('acts only on the newest request when the user picks another range during the check', async () => {
    const { captureList, preparations, session } = gifRefinement();

    captureList.emit('refineRequested', range1);
    captureList.emit('refineRequested', range2);
    preparations.get(range1)?.(true);
    preparations.get(range2)?.(true);

    await vi.waitFor(() => expect(session.beginRefinement).toHaveBeenCalledOnce());
    expect(session.beginRefinement).toHaveBeenCalledWith(range2);
  });

  it('reports a rejected refinement and stays on the current screen', async () => {
    const { workflow, preparations, navigation, reporter } = gifRefinement({ beginResult: { kind: 'rejected', message: 'Exact frame review is not ready for this range.' } });

    const refining = workflow.refine(range1);
    preparations.get(range1)?.(true);
    await refining;

    expect(reporter.failure).toHaveBeenCalledWith('Exact frame review is not ready for this range.');
    expect(navigation.activate).not.toHaveBeenCalled();
  });

  it('goes back to GIF Extraction and focuses the range that was being refined', () => {
    const { refineScreen, navigation, captureList } = gifRefinement();

    refineScreen.emit('backRequested', range1);

    expect(navigation.activate).toHaveBeenCalledWith('gif-extraction');
    expect(captureList.focusRange).toHaveBeenCalledWith(range1);
  });
});
