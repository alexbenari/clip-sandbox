import { describe, expect, it, vi } from 'vitest';

import type { IGifExtractionSessionSnapshot } from '../../../src/app/gif-extraction-session.js';
import { GifRangesPanelControl } from '../../../src/ui/gif-ranges-panel-control.js';

describe('GifRangesPanelControl', () => {
  it('shows capture loading before the restored queue replaces the empty panel', () => {
    let publish = (_snapshot: IGifExtractionSessionSnapshot): void => undefined;
    const base = {
      lifecycle: 'empty' as const, source: null, reviewState: null, capture: null,
      draftThumbnail: { kind: 'empty' as const }, selectedRangeId: null, refinement: null,
      message: null, ranges: [],
    };
    const session = {
      subscribe: vi.fn((listener: (value: IGifExtractionSessionSnapshot) => void) => {
        publish = listener;
        listener({ ...base, capturesLoading: true });
        return vi.fn();
      }),
    };
    const root = document.createElement('section');
    new GifRangesPanelControl(root, session as never, { document });

    expect(root.querySelector('[role="status"]')?.textContent)
      .toBe('Checking for a saved movie… Playback will be available when it opens.');
    expect(root.textContent).not.toContain('No captured ranges yet');
    publish({ ...base, lifecycle: 'opening', source: { name: 'First.mp4', sourceHandle: 'source_12345678' } as never,
      capturesLoading: false });
    expect(root.querySelector('[role="status"]')?.textContent)
      .toBe('Opening another movie… These captures remain with the current movie.');
    publish({ ...base, lifecycle: 'open', source: { name: 'Movie.mp4', sourceHandle: 'source_12345678' } as never,
      reviewState: { captureEnabled: true } as never, capturesLoading: true });
    expect(root.querySelector('[role="status"]')?.textContent)
      .toBe('Checking for saved captures… You can play the movie during the check.');
    publish({ ...base, capturesLoading: false });
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.textContent).toContain('No captured ranges yet');
  });

  it('mounts its owned root into a shell panel host', () => {
    const root = document.createElement('section');
    const host = document.createElement('div');
    const session = { subscribe: vi.fn(() => vi.fn()) };
    const control = new GifRangesPanelControl(root, session as never, { document });

    control.mount(host);

    expect(host.firstElementChild).toBe(root);
  });

  it('makes an inexact range visually compact while retaining its unlocked state for assistive technology', () => {
    const snapshot: IGifExtractionSessionSnapshot = {
      lifecycle: 'open', source: null, reviewState: null, capture: null,
      draftThumbnail: { kind: 'empty' }, selectedRangeId: null, refinement: null, capturesLoading: false, message: null,
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
      retryThumbnail: vi.fn(), selectRange: vi.fn(), canRemoveRange: vi.fn(() => true), removeRange: vi.fn(() => true),
    };
    const root = document.createElement('section');
    new GifRangesPanelControl(root, session as never, { document });

    expect(root.querySelector('img')?.getAttribute('src')).toBe('blob:start-frame');
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Captured start frame');
    expect(root.querySelector('.gif-range-card')?.classList.contains('is-inexact')).toBe(true);
    expect(root.querySelector('.gif-range-lock')?.getAttribute('aria-label')).toBe('Unlocked range; exact frames required');
    expect([...root.querySelectorAll('.gif-range-details span')].map(item => item.textContent))
      .toEqual(['00:00.010 – 00:00.020', '(0.010 sec)']);
    expect(root.querySelector('.gif-range-state')).toBeNull();
    expect(root.textContent).toContain('0 exact');
    const card = root.querySelector<HTMLElement>('.gif-range-card')!;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(session.selectRange).toHaveBeenCalledWith('range_1');
  });

  it('keeps every capture visible while choosing and replacing the range to refine', () => {
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
          capturesLoading: false, message: null, ranges: [inexact, exact] as never,
        });
        return vi.fn();
      }),
      retryThumbnail: vi.fn(), selectRange: vi.fn(), canRemoveRange: vi.fn(() => true), removeRange: vi.fn(() => true),
    };
    const onRefine = vi.fn();
    const root = document.createElement('section');
    document.body.append(root);
    const control = new GifRangesPanelControl(root, session as never, { document, onRefine });

    expect(root.querySelectorAll('.gif-range-card')).toHaveLength(2);
    const close = root.querySelector<HTMLButtonElement>('[data-remove-range="range_2"]');
    expect(close?.classList.contains('gif-range-remove')).toBe(true);
    expect(close?.parentElement?.matches('.gif-range-card')).toBe(true);
    expect(close?.querySelector('svg')).not.toBeNull();
    expect(root.querySelector('.gif-range-actions [data-remove-range]')).toBeNull();
    close?.click();
    expect(session.removeRange).toHaveBeenCalledWith(exact.id);
    root.querySelector<HTMLElement>('[data-range-id="range_1"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    root.querySelector<HTMLButtonElement>('[data-refine-range="range_1"]')?.click();
    expect(onRefine).toHaveBeenNthCalledWith(1, inexact.id);
    expect(onRefine).toHaveBeenNthCalledWith(2, inexact.id);

    root.querySelector<HTMLElement>('[data-range-id="range_2"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    root.querySelector<HTMLButtonElement>('[data-refine-range="range_2"]')?.click();
    expect(onRefine).toHaveBeenNthCalledWith(3, exact.id);
    expect(onRefine).toHaveBeenNthCalledWith(4, exact.id);
    publish({
      lifecycle: 'open', source: null, reviewState: null, capture: null,
      draftThumbnail: { kind: 'empty' }, selectedRangeId: inexact.id, refinement: null,
      capturesLoading: false, message: null, ranges: [{ ...exact, id: inexact.id }, exact] as never,
    });
    expect(root.querySelectorAll('.gif-range-card')).toHaveLength(2);
    expect(root.querySelector('.gif-range-lock')?.getAttribute('aria-label')).toBe('Locked exact range');
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
          capturesLoading: false, message: null, extractionAvailable: true, ranges: [exact] as never,
        });
        return vi.fn();
      }),
      retryThumbnail: vi.fn(), selectRange: vi.fn(), extractAll: vi.fn(), extractRange: vi.fn(),
      canRemoveRange: vi.fn(() => false), removeRange: vi.fn(),
      retryExtractionPublication: vi.fn(), canExtractRange: vi.fn(() => false),
    };
    const root = document.createElement('section');
    new GifRangesPanelControl(root, session as never, { document });

    expect(root.textContent).toContain('Clip created; collection save failed');
    expect(root.querySelector('.gif-range-extraction')?.textContent).toContain('collection save failed');
    expect(root.querySelector('[data-range-id="range_1"]')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector<HTMLButtonElement>('[data-extract-all]')?.title).toBe('Resolve the failed ranges below.');
    root.querySelector<HTMLButtonElement>('[data-retry-publication="range_1"]')?.click();
    expect(session.retryExtractionPublication).toHaveBeenCalledWith(exact.id);
    expect(root.querySelector<HTMLButtonElement>('[data-extract-all]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-remove-range="range_1"]')?.disabled).toBe(true);
  });
});
