import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import type { IRangeCaptureSnapshot } from '../../../src/domain/range-capture-model.js';
import { GifExtractionScreen } from '../../../src/ui/gif-extraction-screen.js';
import { FrameReviewPlayerControl } from '../../../src/ui/frame-review-player-control.js';
import { GifWorkflowKeyboardController } from '../../../src/ui/gif-workflow-keyboard-controller.js';

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
    message: ready ? 'Exact capture ready' : 'Building exact frame index',
  });
}

describe('GifExtractionScreen', () => {
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
    };
    const player = new FrameReviewPlayerControl({
      document,
      frameRenderer: { render: vi.fn(async () => undefined), clear: vi.fn() },
    });
    const capture = { point: { kind: 'playback-timestamp', timestampUs: 1n }, positionUs: 1n, sourceGeneration: 1, thumbnail: {} };
    vi.spyOn(player, 'displayedCapture').mockReturnValue(capture as never);
    const keyboard = new GifWorkflowKeyboardController();
    const rangesPanel = { mount: vi.fn() };
    const screen = new GifExtractionScreen({ player, keyboard, session: session as never, rangesPanel, document });
    document.body.append(screen.commands, screen.root);
    screen.onActivate();

    expect(screen.root.querySelector<HTMLButtonElement>('[data-command="mark-start"]')?.disabled).toBe(true);
    publish(snapshot(true));
    expect(screen.commands.textContent).toContain('Feature.mp4');
    expect(screen.root.querySelector<HTMLButtonElement>('[data-command="mark-start"]')?.disabled).toBe(false);

    keyboard.handleKeyDown(new KeyboardEvent('keydown', { key: 'q' }));
    expect(session.markStart).toHaveBeenCalledWith(capture);
    expect(screen.panelContributions[0]?.content).toBe(rangesPanel);
    expect(screen.root.querySelectorAll('input[type="range"]')).toHaveLength(1);
  });
});
