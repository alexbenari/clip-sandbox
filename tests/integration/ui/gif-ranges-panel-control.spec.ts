import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import { GifRangesPanelControl } from '../../../src/ui/gif-ranges-panel-control.js';

describe('GifRangesPanelControl', () => {
  it('mounts its owned root into a shell panel host', () => {
    const root = document.createElement('section');
    const host = document.createElement('div');
    const session = { subscribe: vi.fn(() => vi.fn()) };
    const control = new GifRangesPanelControl(root, session as never, { document });

    control.mount(host);

    expect(host.firstElementChild).toBe(root);
  });

  it('shows the start thumbnail and makes inexact state visible with text and shape', () => {
    const snapshot: IGifExtractionSessionSnapshot = {
      lifecycle: 'open', source: null, reviewState: null, capture: null,
      draftThumbnail: { kind: 'empty' }, selectedRangeId: null, refinement: null, message: null,
      ranges: [{
        id: 'range_1' as never,
        kind: 'needs-exact-frames',
        sourceGeneration: 1,
        start: { kind: 'playback-timestamp', timestampUs: 10_000n, sourceGeneration: 1 },
        end: { kind: 'playback-timestamp', timestampUs: 20_000n, sourceGeneration: 1 },
        thumbnail: { kind: 'ready', id: 'thumbnail_12345678' as never, url: 'blob:start-frame' },
      }],
    };
    const session = {
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        listener(snapshot);
        return vi.fn();
      }),
      retryThumbnail: vi.fn(), selectRange: vi.fn(),
    };
    const root = document.createElement('section');
    new GifRangesPanelControl(root, session as never, { document });

    expect(root.querySelector('img')?.getAttribute('src')).toBe('blob:start-frame');
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Captured start frame');
    expect(root.querySelector('.gif-range-card')?.classList.contains('is-inexact')).toBe(true);
    expect(root.textContent).toContain('Needs exact frames');
    expect(root.textContent).toContain('0 exact');
    const card = root.querySelector<HTMLElement>('.gif-range-card')!;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(session.selectRange).toHaveBeenCalledWith('range_1');
  });

  it('filters refinement work, opens from double-click or Refine, and retains the just-committed item', () => {
    const inexact = {
      id: 'range_1' as never,
      kind: 'needs-exact-frames' as const,
      sourceGeneration: 1,
      start: { kind: 'playback-timestamp' as const, timestampUs: 10_000n, sourceGeneration: 1 },
      end: { kind: 'playback-timestamp' as const, timestampUs: 20_000n, sourceGeneration: 1 },
      thumbnail: { kind: 'empty' as const },
    };
    const exact = {
      id: 'range_2' as never,
      kind: 'ready-to-extract' as const,
      sourceGeneration: 1,
      start: { kind: 'exact-frame' as const, identity: {
        frameIndex: 2, originalFrameIndex: 2, pts: 2_000n, duration: 1_000n,
        timebaseNumerator: 1n, timebaseDenominator: 1_000n, frameInfoPts: 2_000n, frameInfoHash: 'frame-2',
      }, reviewTimeUs: 20_000n, sourceGeneration: 1 },
      end: { kind: 'exact-frame' as const, identity: {
        frameIndex: 3, originalFrameIndex: 3, pts: 3_000n, duration: 1_000n,
        timebaseNumerator: 1n, timebaseDenominator: 1_000n, frameInfoPts: 3_000n, frameInfoHash: 'frame-3',
      }, reviewTimeUs: 30_000n, sourceGeneration: 1 },
      thumbnail: { kind: 'empty' as const },
    };
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const session = {
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener({
          lifecycle: 'open', source: null, reviewState: null, capture: null,
          draftThumbnail: { kind: 'empty' }, selectedRangeId: inexact.id, refinement: null,
          message: null, ranges: [inexact, exact] as never,
        });
        return vi.fn();
      }),
      retryThumbnail: vi.fn(), selectRange: vi.fn(),
    };
    const onRefine = vi.fn();
    const root = document.createElement('section');
    document.body.append(root);
    const control = new GifRangesPanelControl(root, session as never, { document, onRefine });
    control.showNeedsRefinement(inexact.id);

    expect(root.querySelectorAll('.gif-range-card')).toHaveLength(1);
    root.querySelector<HTMLElement>('[data-range-id="range_1"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-refine-range="range_1"]')?.click();
    expect(onRefine).toHaveBeenNthCalledWith(1, inexact.id);
    expect(onRefine).toHaveBeenNthCalledWith(2, inexact.id);

    publish({
      lifecycle: 'open', source: null, reviewState: null, capture: null,
      draftThumbnail: { kind: 'empty' }, selectedRangeId: inexact.id, refinement: null,
      message: null, ranges: [{ ...exact, id: inexact.id }, exact] as never,
    });
    expect(root.querySelectorAll('.gif-range-card')).toHaveLength(1);
    expect(root.textContent).toContain('Ready to extract');
    expect(control.focusRange(inexact.id)).toBe(true);
    expect(document.activeElement?.getAttribute('data-range-id')).toBe('range_1');
  });

  it('extracts actionable exact ranges and exposes publication retry without re-encoding', () => {
    const exact = {
      id: 'range_1' as never,
      kind: 'ready-to-extract' as const,
      sourceGeneration: 1,
      start: { kind: 'exact-frame' as const, identity: { frameIndex: 2 }, reviewTimeUs: 2_000n, sourceGeneration: 1 },
      end: { kind: 'exact-frame' as const, identity: { frameIndex: 3 }, reviewTimeUs: 3_000n, sourceGeneration: 1 },
      thumbnail: { kind: 'empty' as const },
      extraction: { kind: 'publication-failed' as const, message: 'disk busy', media: {
        kind: 'created-media' as const, mediaHandle: 'media_12345678', filename: 'Movie-001.mp4',
      } },
    };
    const session = {
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        listener({
          lifecycle: 'open', source: null, reviewState: null, capture: null,
          draftThumbnail: { kind: 'empty' }, selectedRangeId: exact.id, refinement: null,
          message: null, extractionAvailable: true, ranges: [exact] as never,
        });
        return vi.fn();
      }),
      retryThumbnail: vi.fn(), selectRange: vi.fn(), extractAll: vi.fn(), extractRange: vi.fn(),
      retryExtractionPublication: vi.fn(),
    };
    const root = document.createElement('section');
    new GifRangesPanelControl(root, session as never, { document });

    expect(root.textContent).toContain('Clip created; collection save failed');
    expect(root.textContent).toContain('Save failed');
    expect(root.querySelector('[data-range-id="range_1"]')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector<HTMLButtonElement>('[data-extract-all]')?.title).toBe('Resolve the failed ranges below.');
    root.querySelector<HTMLButtonElement>('[data-retry-publication="range_1"]')?.click();
    expect(session.retryExtractionPublication).toHaveBeenCalledWith(exact.id);
    expect(root.querySelector<HTMLButtonElement>('[data-extract-all]')?.disabled).toBe(true);
  });
});
