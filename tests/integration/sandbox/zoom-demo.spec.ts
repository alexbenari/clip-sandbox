import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMediaPlayback } from '../../support/media-playback.js';
import { pageBodyOf } from '../../support/page-markup.js';

let restoreMediaPlayback: () => void;

async function loadDemo(): Promise<void> {
  document.body.innerHTML = pageBodyOf('sandbox/zoom-demo.html');
  vi.resetModules();
  await import('../../../sandbox/zoom-demo.js');
}

function shownClip(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('#zoomOverlay video');
}

describe('zoom overlay sandbox demo', () => {
  beforeEach(async () => {
    restoreMediaPlayback = stubMediaPlayback();
    await loadDemo();
  });

  afterEach(() => restoreMediaPlayback());

  it('shows the sample clip in the zoom overlay when its button is clicked', () => {
    document.getElementById('viewBtn')!.click();

    expect(shownClip()?.getAttribute('src')).toBe('./hand-closes-curtain.mp4');
  });

  it('closes the shown clip on Escape', () => {
    document.getElementById('viewBtn')!.click();
    expect(shownClip(), 'the clip must be shown before Escape').not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(shownClip()).toBeNull();
  });
});
