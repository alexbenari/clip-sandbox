import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import type { IRangeCaptureSnapshot } from '../../../src/domain/range-capture-model.js';
import type { IFrameReviewSession } from '../../../src/frame-review/frame-review-api.js';
import { GifExtractionScreen } from '../../../src/ui/gif-extraction-screen.js';
import type { FrameReviewPlayerControl } from '../../../src/ui/frame-review-player-control.js';
import { GifWorkflowKeyboard } from '../../../src/ui/gif-workflow-keyboard.js';
import { flushPendingWork } from '../../support/flush-pending-work.js';
import { captureTransportListener, moviePlayer, playingReview } from '../../support/movie-player.js';

function snapshot(ready: boolean): IGifExtractionSessionSnapshot {
  const capture: IRangeCaptureSnapshot = Object.freeze({
    sourceGeneration: 1,
    capture: Object.freeze({ kind: 'draft', start: null, end: null, message: null }),
    ranges: Object.freeze([]),
  });
  return Object.freeze({
    lifecycle: 'open',
    source: { name: 'Feature.mp4', sourceHandle: 'source_12345678' } as never,
    reviewState: {
      phase: ready ? 'exact-ready' as const : 'indexing' as const, sourceGeneration: 1, captureEnabled: ready,
      progressPercent: ready ? null : 50, message: ready ? null : 'Building exact frame index', playbackDurationUs: 1_000_000n,
      preparedReview: ready ? {
        cacheKey: 'a'.repeat(64), cacheHit: true, frameCount: 24, sourceWidth: 640, sourceHeight: 360, durationUs: 1_000_000n,
      } : null,
    },
    capture,
    draftThumbnail: { kind: 'empty' as const },
    ranges: Object.freeze([]),
    selectedRangeId: null,
    refinement: null,
    capturesLoading: false,
    previewTarget: null,
    previewRevision: 0,
    message: ready ? 'Exact capture ready' : 'Building exact frame index',
  });
}

const stagedDraft: IGifExtractionSessionSnapshot = Object.freeze({
  ...snapshot(true),
  previewTarget: Object.freeze({
    kind: 'draft' as const, rangeId: null, startFrameIndex: 5, endFrameIndex: 15, sourceGeneration: 1, revision: 1,
  }),
});

function activeExtractionScreen(
  player: FrameReviewPlayerControl, initial: IGifExtractionSessionSnapshot, reviewSession: IFrameReviewSession | null = null,
) {
  let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
  const session = {
    reviewSession,
    subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
      publish = listener;
      listener(initial);
      return vi.fn();
    }),
    reopenLastMovie: vi.fn(async () => undefined),
  };
  const screen = new GifExtractionScreen({
    player, keyboard: new GifWorkflowKeyboard(), session: session as never, rangesPanel: { mount: vi.fn() }, document,
  });
  document.body.replaceChildren(screen.commands, screen.root);
  screen.onActivate();
  const command = (name: string) => screen.root.querySelector<HTMLButtonElement>(`[data-command="${name}"]`)!;
  return { screen, command, publish: (value: IGifExtractionSessionSnapshot) => publish(value) };
}

describe('GifExtractionScreen', () => {
  it('offers Jump to start, Jump to end and Loop for a staged draft in exact frame review', () => {
    const player = moviePlayer();
    vi.spyOn(player, 'exactScrubActive').mockReturnValue(true);
    vi.spyOn(player, 'ordinaryPlaybackRunning').mockReturnValue(false);

    const { command } = activeExtractionScreen(player, stagedDraft);

    expect([command('jump-start').disabled, command('jump-end').disabled, command('loop-range').disabled])
      .toEqual([false, false, false]);
  });

  it('makes Loop unavailable while ordinary playback runs', () => {
    const player = moviePlayer();
    const scrubbing = vi.spyOn(player, 'exactScrubActive').mockReturnValue(true);
    const playing = vi.spyOn(player, 'ordinaryPlaybackRunning').mockReturnValue(false);
    const notifyTransport = captureTransportListener(player);
    const { command } = activeExtractionScreen(player, stagedDraft);
    expect(command('loop-range').disabled).toBe(false);

    scrubbing.mockReturnValue(false);
    playing.mockReturnValue(true);
    notifyTransport();

    expect(command('loop-range').disabled).toBe(true);
  });

  it('makes both capture marks unavailable while a range loops', () => {
    const player = moviePlayer();
    const previewPhase = vi.spyOn(player, 'exactPreviewPhase').mockReturnValue('inactive');
    const notifyTransport = captureTransportListener(player);
    const { command } = activeExtractionScreen(player, stagedDraft);
    expect([command('mark-start').disabled, command('mark-end').disabled]).toEqual([false, false]);

    previewPhase.mockReturnValue('running');
    notifyTransport();

    expect([command('mark-start').disabled, command('mark-end').disabled]).toEqual([true, true]);
  });

  it('leaves the player as Zoom edit mode set it while the screen is inactive', async () => {
    const player = moviePlayer();
    vi.spyOn(player, 'exactPreviewPhase').mockReturnValue('running');
    const stopLoop = vi.spyOn(player, 'stopExactPreview').mockResolvedValue(null);
    const notifyTransport = captureTransportListener(player);
    const { screen, publish } = activeExtractionScreen(player, stagedDraft);
    screen.onDeactivate();
    const zoomEditHost = document.createElement('div');
    document.body.append(zoomEditHost);
    player.mountInZoomEdit(zoomEditHost);
    const clip = playingReview();
    player.attachSession(clip.session);
    stopLoop.mockClear();

    publish({ ...stagedDraft, lifecycle: 'opening', previewRevision: 2 });
    notifyTransport();
    await flushPendingWork();
    player.jumpBySeconds(2);

    expect(zoomEditHost.contains(player.root)).toBe(true);
    await vi.waitFor(() => expect(clip.jumpPlaybackBy).toHaveBeenCalledWith(2_000_000n));
    expect(stopLoop).not.toHaveBeenCalled();
  });

  it('keeps jumping unavailable while a movie opens when the screen becomes active again', () => {
    const player = moviePlayer();
    const { screen } = activeExtractionScreen(player, { ...stagedDraft, lifecycle: 'opening' }, playingReview().session);
    screen.onDeactivate();
    player.mountInZoomEdit(document.createElement('div'));

    screen.onActivate();

    expect(player.root.querySelector<HTMLButtonElement>('[data-command="jump-seconds"]')?.disabled).toBe(true);
  });

  it('takes the player back into its own host when it becomes active again', () => {
    const player = moviePlayer();
    const { screen } = activeExtractionScreen(player, stagedDraft);
    screen.onDeactivate();
    player.mountInZoomEdit(document.createElement('div'));

    screen.onActivate();

    expect(screen.root.querySelector('.gif-workflow-player-host')?.contains(player.root)).toBe(true);
  });

  it('makes Lock range available only once the draft has a start and an end', () => {
    const ready = snapshot(true);
    const endpoint = Object.freeze({ kind: 'exact-frame' }) as never;
    const { command, publish } = activeExtractionScreen(moviePlayer(), ready);
    expect(command('lock-range').disabled).toBe(true);

    publish(Object.freeze({
      ...ready,
      capture: Object.freeze({ ...ready.capture!, capture: Object.freeze({ kind: 'draft', start: endpoint, end: endpoint, message: null }) }),
    }));

    expect(command('lock-range').disabled).toBe(false);
  });

  it('lists F and Escape for movie full screen among its keyboard shortcuts', () => {
    const screen = new GifExtractionScreen({ player: moviePlayer(), keyboard: new GifWorkflowKeyboard(), document });

    expect(screen.shortcuts).toEqual(expect.arrayContaining([
      { description: 'Enter or exit movie full screen', sequences: [['F']] },
      { description: 'Exit movie full screen', sequences: [['Escape']] },
    ]));
  });

  it('labels its movie and capture commands in sentence case', () => {
    const player = moviePlayer();
    const screen = new GifExtractionScreen({ player, keyboard: new GifWorkflowKeyboard(), document });
    const label = (command: string, root: ParentNode = screen.root) =>
      root.querySelector(`[data-command="${command}"]`)?.firstChild?.textContent;

    expect([label('open-movie', screen.commands), label('jump-start'), label('jump-end')])
      .toEqual(['Open movie…', 'Jump to start', 'Jump to end']);
  });

  it('explains when playback will become available during saved movie reopening', () => {
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const session = {
      reviewSession: null,
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener({ ...snapshot(false), lifecycle: 'empty', source: null, capturesLoading: true });
        return vi.fn();
      }),
      reopenLastMovie: vi.fn(async () => undefined),
    };
    const player = moviePlayer();
    const screen = new GifExtractionScreen({ player, keyboard: new GifWorkflowKeyboard(),
      session: session as never, document });

    expect(screen.root.querySelector('.gif-workflow-empty-copy')?.textContent)
      .toContain('Playback will be available when the movie opens.');
    publish({ ...snapshot(false), lifecycle: 'empty', source: null, capturesLoading: false });
    expect(screen.root.querySelector('.gif-workflow-empty-copy')?.textContent)
      .toContain('Choose a movie to begin');
  });

  it('enables Q/W only after exact preparation and routes keyboard capture through the displayed frame', () => {
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const session = {
      reviewSession: null,
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener(snapshot(false));
        return vi.fn();
      }),
      markStart: vi.fn(), markEnd: vi.fn(), lockRange: vi.fn(), openMovie: vi.fn(),
      reopenLastMovie: vi.fn(async () => undefined),
    };
    const player = moviePlayer();
    const capture = { point: { kind: 'playback-timestamp', timestampUs: 1n }, positionUs: 1n, sourceGeneration: 1, thumbnail: {} };
    vi.spyOn(player, 'displayedCapture').mockReturnValue(capture as never);
    const interrupt = vi.spyOn(player, 'interruptJumps');
    const keyboard = new GifWorkflowKeyboard();
    const rangesPanel = { mount: vi.fn() };
    const screen = new GifExtractionScreen({ player, keyboard, session: session as never, rangesPanel, document });
    document.body.append(screen.commands, screen.root);
    screen.onActivate();

    expect(session.reopenLastMovie).not.toHaveBeenCalled();
    expect(screen.root.querySelector<HTMLButtonElement>('[data-command="mark-start"]')?.disabled).toBe(true);
    expect(screen.root.querySelector('.gif-workflow-local-status')).toBeNull();
    publish(snapshot(true));
    expect(screen.commands.textContent).toContain('Feature.mp4');
    expect(screen.root.querySelector<HTMLButtonElement>('[data-command="mark-start"]')?.disabled).toBe(false);

    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'q' }));
    expect(session.markStart).toHaveBeenCalledWith(capture);
    expect(interrupt).toHaveBeenCalled();
    expect(screen.panelContributions[0]?.content).toBe(rangesPanel);
    expect(screen.root.querySelectorAll('input[type="range"]')).toHaveLength(1);
  });
});
