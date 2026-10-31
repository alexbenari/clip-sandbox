import { vi } from 'vitest';

// jsdom does not implement media playback, so controls that play video need these stubbed.
export function stubMediaPlayback(): () => void {
  const media = HTMLMediaElement.prototype;
  const original = { play: media.play, pause: media.pause, load: media.load };
  media.play = vi.fn(() => Promise.resolve());
  media.pause = vi.fn();
  media.load = vi.fn();
  return () => Object.assign(media, original);
}
