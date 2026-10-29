import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import type { IRangeRefinementDraftSnapshot } from '../../../src/app/range-refinement-draft.js';
import type { FrameReviewPlayerControl } from '../../../src/ui/frame-review-player-control.js';
import { GifWorkflowKeyboard } from '../../../src/ui/gif-workflow-keyboard.js';
import { RefineGifScreen } from '../../../src/ui/refine-gif-screen.js';
import { captureTransportListener, moviePlayer } from '../../support/movie-player.js';

const identity = (frameIndex: number) => Object.freeze({
  frameIndex, originalFrameIndex: frameIndex, pts: BigInt(frameIndex * 1_000), duration: 1_000n,
  timebaseNumerator: 1n, timebaseDenominator: 1_000n,
  frameInfoPts: BigInt(frameIndex * 1_000), frameInfoHash: `frame-${frameIndex}`,
});

function refinementSnapshot(
  status: IRangeRefinementDraftSnapshot['status'] = 'editing',
): IRangeRefinementDraftSnapshot {
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
    stagedRevision: 0,
    canCommit: exact,
    nextInexactRangeId: exact ? 'range-2' as never : null,
    message: exact ? 'Exact range locked' : null,
  });
}

function extractionSnapshot(refinement: IRangeRefinementDraftSnapshot): IGifExtractionSessionSnapshot {
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
    capturesLoading: false,
    previewTarget: null,
    previewRevision: 0,
  });
}

function activeRefineScreen(
  refinement: IRangeRefinementDraftSnapshot,
  { player = moviePlayer(), canExtract = false }: {
    player?: FrameReviewPlayerControl; canExtract?: boolean;
  } = {},
) {
  let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
  const session = {
    reviewSession: {} as never,
    get snapshot() { return extractionSnapshot(refinement); },
    refinementDraft: null,
    subscribe: (listener: (snapshot: IGifExtractionSessionSnapshot) => void) => {
      publish = listener;
      listener(extractionSnapshot(refinement));
      return vi.fn();
    },
    abandonRefinement: vi.fn(),
    canExtractRange: () => canExtract,
  };
  vi.spyOn(player, 'attachSession').mockImplementation(() => undefined);
  vi.spyOn(player, 'enterExactScrubAt').mockResolvedValue({} as never);
  const screen = RefineGifScreen.forGifExtraction({
    player, keyboard: new GifWorkflowKeyboard(), session: session as never, document });
  document.body.replaceChildren(screen.commands, screen.root);
  screen.onActivate();
  const hint = () => screen.root.querySelector('.gif-refinement-workbench [role="status"]')?.textContent;
  return { screen, player, hint, publish: (snapshot: IGifExtractionSessionSnapshot) => publish(snapshot) };
}

describe('RefineGifScreen', () => {
  it('states the next step once, in the workbench and not in the command bar', () => {
    const { screen, hint } = activeRefineScreen(refinementSnapshot());

    expect(hint()).toBe('Scrub to the exact start frame, then set it with Q.');
    expect(screen.commands.textContent).not.toContain('start');
    expect(screen.commands.querySelector('[role="status"]')).toBeNull();
  });

  it('names a refined GIF range by its number, with its movie as secondary text', () => {
    const { screen } = activeRefineScreen(refinementSnapshot());

    expect(screen.commands.querySelector('[data-refine-command-title]')?.textContent).toBe('Refine Gif · Range 1');
    expect(screen.commands.querySelector('.gif-workflow-source span')?.textContent).toBe('Feature.mp4');
  });

  it('keeps the jump length chosen on the movie player when Refine opens', () => {
    const player = moviePlayer();
    const jumpBy = player.root.querySelector<HTMLSelectElement>('select[aria-label="Jump by seconds"]')!;
    jumpBy.value = '7';
    jumpBy.dispatchEvent(new Event('change', { bubbles: true }));

    const { screen } = activeRefineScreen(refinementSnapshot(), { player });

    expect(screen.root.querySelector<HTMLSelectElement>('select[aria-label="Jump by seconds"]')?.value).toBe('7');
    expect(screen.root.querySelector('[data-command="jump-seconds"]')?.textContent).toBe('Jump +7s');
  });

  it('makes Extract unavailable while the locked range loops', () => {
    const committed = refinementSnapshot('committed');
    const player = moviePlayer();
    const previewPhase = vi.spyOn(player, 'exactPreviewPhase').mockReturnValue('inactive');
    const notifyTransport = captureTransportListener(player);
    const { screen } = activeRefineScreen(committed, { player, canExtract: true });
    const extract = screen.root.querySelector<HTMLButtonElement>('[data-command="extract-current"]')!;
    expect(extract.disabled).toBe(false);

    previewPhase.mockReturnValue('running');
    notifyTransport();

    expect(extract.disabled).toBe(true);
  });

  it('enters as a contextual screen that opens the Clips panel and keeps Pipelines folded', () => {
    const screen = RefineGifScreen.forGifExtraction({
      player: moviePlayer(), keyboard: new GifWorkflowKeyboard(), rangesPanel: { mount: vi.fn() } as never, document,
    });

    expect([screen.selectorStatus, screen.openPanelIdsOnEntry, screen.initiallyFoldedPanelIds])
      .toEqual(['contextual', ['clips'], ['pipelines']]);
  });

  it('says in the workbench that the staged range is looping while the loop runs', () => {
    const { player, hint, publish } = activeRefineScreen(refinementSnapshot());
    vi.spyOn(player, 'exactPreviewPhase').mockReturnValue('running');

    publish(extractionSnapshot(refinementSnapshot()));

    expect(hint()).toBe('Looping the staged range. Press Space to pause and scrub.');
  });

  it('shows extraction progress in the workbench while the locked range is extracted', () => {
    const committed = refinementSnapshot('committed');
    const { hint, publish } = activeRefineScreen(committed);

    publish(Object.freeze({ ...extractionSnapshot(committed), extractionBatch: Object.freeze({
      currentRangeId: 'range-1', currentPosition: 1, total: 2, completed: 0, cancelling: false,
      usingExactFallback: false, progress: {} as never,
    }) }));

    expect(hint()).toBe('Extracting clip 1 of 2');
  });

  it('shows in the workbench that extraction is being cancelled', () => {
    const committed = refinementSnapshot('committed');
    const { hint, publish } = activeRefineScreen(committed);

    publish(Object.freeze({ ...extractionSnapshot(committed), extractionBatch: Object.freeze({
      currentRangeId: 'range-1', currentPosition: 1, total: 2, completed: 0, cancelling: true,
      usingExactFallback: false, progress: {} as never,
    }) }));

    expect(hint()).toBe('Cancelling extraction…');
  });

  it('enters exact review, routes Q/W/X, enables exact-only E, and preserves contextual continuation', async () => {
    let currentRefinement = refinementSnapshot();
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const refinement = {
      get snapshot() { return currentRefinement; },
      markStart: vi.fn(), markEnd: vi.fn(), focus: vi.fn(), commit: vi.fn(),
    };
    const session = {
      reviewSession: {} as never,
      get snapshot() { return extractionSnapshot(currentRefinement); },
      get refinementDraft() { return refinement; },
      subscribe: vi.fn((listener: (snapshot: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener(extractionSnapshot(currentRefinement));
        return vi.fn();
      }),
      abandonRefinement: vi.fn(() => currentRefinement.rangeId),
      beginRefinement: vi.fn(),
    };
    const rangesPanel = { mount: vi.fn(), focusRange: vi.fn() };
    const player = moviePlayer();
    vi.spyOn(player, 'attachSession').mockImplementation(() => undefined);
    let finishInitialSeek: (capture: null) => void = () => undefined;
    const initialSeek = new Promise<null>(resolve => { finishInitialSeek = resolve; });
    let secondSeekStarted: () => void = () => undefined;
    const secondSeek = new Promise<void>(resolve => { secondSeekStarted = resolve; });
    vi.spyOn(player, 'enterExactScrubAt').mockImplementation(timestamp => {
      if (timestamp === 100_000n) return initialSeek;
      secondSeekStarted();
      return Promise.resolve(null);
    });
    vi.spyOn(player, 'enterExactScrubAtFrame').mockResolvedValue(null);
    const displayed = { point: { kind: 'exact-frame', identity: identity(10) } } as never;
    vi.spyOn(player, 'displayedCapture').mockReturnValue(displayed);
    const keyboard = new GifWorkflowKeyboard();
    const onBack = vi.fn();
    const onExtractCurrent = vi.fn();
    const screen = RefineGifScreen.forGifExtraction({
      player,
      keyboard,
      session: session as never,
      rangesPanel: rangesPanel as never,
      onExtractCurrent,
      document,
    });
    screen.on('backRequested', onBack);
    document.body.append(screen.commands, screen.root);
    screen.onActivate();
    expect(screen.commands.textContent).toContain('Refine Gif · Range 1');
    expect(screen.root.querySelector('[data-command="jump-start"]')?.textContent).toContain('Jump to start');
    expect(screen.root.querySelector('[data-command="jump-end"]')?.textContent).toContain('Jump to end');

    expect(player.enterExactScrubAt).toHaveBeenCalledWith(100_000n);
    screen.root.querySelector<HTMLButtonElement>('[data-command="jump-end"]')?.click();
    expect(refinement.focus).toHaveBeenCalledWith('end');
    currentRefinement = Object.freeze({ ...currentRefinement, focusedEndpoint: 'end', seekRevision: 2 });
    publish(extractionSnapshot(currentRefinement));
    expect(player.enterExactScrubAt).toHaveBeenCalledTimes(1);
    finishInitialSeek(null);
    await secondSeek;
    expect(player.enterExactScrubAt).toHaveBeenCalledWith(300_000n);
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'q', cancelable: true }));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'w', cancelable: true }));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'x', cancelable: true }));
    expect(refinement.markStart).toHaveBeenCalledWith(displayed);
    expect(refinement.markEnd).toHaveBeenCalledWith(displayed);
    expect(refinement.commit).not.toHaveBeenCalled();
    currentRefinement = Object.freeze({ ...refinementSnapshot('committed'), status: 'editing', canCommit: true });
    publish(extractionSnapshot(currentRefinement));
    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'x', cancelable: true }));
    await Promise.resolve();
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
    expect(onBack).toHaveBeenCalledWith('range-1');
    const panelContribution = screen.panelContributions[0];
    expect(panelContribution?.content).toBe(rangesPanel);
    expect(screen.panelContributions[0]).toBe(panelContribution);
    expect(screen.root.querySelectorAll('input[type="range"]')).toHaveLength(1);
  });
});
