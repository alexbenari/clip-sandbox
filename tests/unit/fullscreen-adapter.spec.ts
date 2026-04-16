// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { FullscreenAdapter } from '../../src/adapters/browser/fullscreen-adapter.js';

describe('fullscreen adapter', () => {
  it('enters fullscreen through the document element', async () => {
    const requestFullscreen = vi.fn(async () => {});
    const adapter = new FullscreenAdapter({
      doc: {
        documentElement: { requestFullscreen },
      },
    });

    await adapter.enterFullScreen();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('exits fullscreen and reports active state from the document', async () => {
    const exitFullscreen = vi.fn(async () => {});
    const doc = {
      exitFullscreen,
      fullscreenElement: { id: 'fs' },
      documentElement: {},
    };
    const adapter = new FullscreenAdapter({ doc });

    expect(adapter.isFullScreenActive()).toBe(true);
    await adapter.exitFullScreen();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
