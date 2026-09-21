import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import type { IRefineGifSessionSnapshot } from '../../../src/app/refine-gif-session.js';
import { FrameReviewPlayerControl } from '../../../src/ui/frame-review-player-control.js';
import { GifWorkflowKeyboardController } from '../../../src/ui/gif-workflow-keyboard-controller.js';
import { RefineGifScreen } from '../../../src/ui/refine-gif-screen.js';

const identity = (frameIndex: number) => Object.freeze({
  frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
  timebaseNumerator: 1n, timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash: `frame-${frameIndex}`,
});

function refinementSnapshot(
  status: IRefineGifSessionSnapshot['status'] = 'editing',
): IRefineGifSessionSnapshot {
  const exact = status === 'committed';
  const original = Object.freeze({
    id: 'range-1' as never,
    kind: 'needs-exact-frames' as const,
    sourceGeneration: 1,
    start: Object.freeze({ kind: 'playback-timestamp' as const, timestampUs: 100_000n, sourceGeneration: 1 }),
    end: Object.freeze({ kind: 'playback-timestamp' as const, timestampUs: 300_000n, sourceGeneration: 1 }),
  });
  return Object.freeze({
    rangeId: original.id,
    sourceGeneration: 1,
    status,
    original,
    start: exact
      ? Object.freeze({ kind: 'exact-frame' as const, identity: identity(10), reviewTimeUs: 100_000n, sourceGeneration: 1 })
      : original.start,
    end: exact
      ? Object.freeze({ kind: 'exact-frame' as const, identity: identity(30), reviewTimeUs: 300_000n, sourceGeneration: 1 })
      : original.end,
    focusedEndpoint: 'start',
    seekTimeUs: 100_000n,
    seekRevision: 1,
    canCommit: exact,
    nextInexactRangeId: exact ? 'range-2' as never : null,
    message: exact ? 'Exact range locked' : null,
  });
}

function extractionSnapshot(refinement: IRefineGifSessionSnapshot): IGifExtractionSessionSnapshot {
  return Object.freeze({
    lifecycle: 'open',
    source: { name: 'Feature.mp4', sourceHandle: 'source_12345678' } as never,
    reviewState: null,
    capture: null,
    draftThumbnail: { kind: 'empty' as const },
    ranges: Object.freeze([Object.freeze({
      ...refinement.original,
      thumbnail: Object.freeze({ kind: 'empty' as const }),
    })]),
    selectedRangeId: refinement.rangeId,
    refinement,
    message: refinement.message,
  });
}

describe('RefineGifScreen', () => {
  it('enters exact review, routes Q/W/A, enables exact-only E, and preserves contextual continuation', async () => {
    let currentRefinement = refinementSnapshot();
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const refinement = {
      get snapshot() { return currentRefinement; },
      markStart: vi.fn(), markEnd: vi.fn(), focus: vi.fn(), commit: vi.fn(),
    };
    const session = {
      reviewSession: {} as never,
      get refinementSession() { return refinement; },
      subscribe: vi.fn((listener: (snapshot: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener(extractionSnapshot(currentRefinement));
        return vi.fn();
      }),
      abandonRefinement: vi.fn(() => currentRefinement.rangeId),
      beginRefinement: vi.fn(),
    };
    const rangesPanel = {
      mount: vi.fn(), showNeedsRefinement: vi.fn(), showAll: vi.fn(), focusRange: vi.fn(),
    };
    const player = new FrameReviewPlayerControl({
      document,
      frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() },
    });
    vi.spyOn(player, 'attachSession').mockImplementation(() => undefined);
    vi.spyOn(player, 'enterExactScrubAt').mockResolvedValue(null);
    const displayed = { point: { kind: 'exact-frame', identity: identity(10) } } as never;
    vi.spyOn(player, 'displayedCapture').mockReturnValue(displayed);
    const keyboard = new GifWorkflowKeyboardController();
    const onBack = vi.fn();
    const onExtractCurrent = vi.fn();
    const screen = new RefineGifScreen({
      player,
      keyboard,
      session: session as never,
      rangesPanel: rangesPanel as never,
      onBack,
      onExtractCurrent,
      document,
    });
    document.body.append(screen.commands, screen.root);
    screen.onActivate();
    expect(screen.commands.textContent).toContain('Refine Gif · Range 1');
    expect(screen.root.querySelector('[data-command="set-start"]')?.textContent).toContain('Set exact start');
    expect(screen.root.querySelector('[data-command="set-end"]')?.textContent).toContain('Set exact end');

    expect(player.enterExactScrubAt).toHaveBeenCalledWith(100_000n);
    expect(rangesPanel.showNeedsRefinement).toHaveBeenCalledWith('range-1');
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'q', cancelable: true }));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'w', cancelable: true }));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    expect(refinement.markStart).toHaveBeenCalledWith(displayed);
    expect(refinement.markEnd).toHaveBeenCalledWith(displayed);
    expect(refinement.commit).toHaveBeenCalledOnce();
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
    expect(onExtractCurrent).not.toHaveBeenCalled();

    currentRefinement = refinementSnapshot('committed');
    publish(extractionSnapshot(currentRefinement));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
    expect(onExtractCurrent).toHaveBeenCalledWith('range-1');
    screen.root.querySelector<HTMLButtonElement>('[data-command="next-inexact"]')?.click();
    expect(session.beginRefinement).toHaveBeenCalledWith('range-2');

    screen.commands.querySelector<HTMLButtonElement>('[data-command="back"]')?.click();
    expect(session.abandonRefinement).toHaveBeenCalled();
    expect(rangesPanel.showAll).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledWith('range-1');
    const panelContribution = screen.panelContributions[0];
    expect(panelContribution?.content).toBe(rangesPanel);
    expect(screen.panelContributions[0]).toBe(panelContribution);
    expect(screen.root.querySelectorAll('input[type="range"]')).toHaveLength(1);
  });
});
