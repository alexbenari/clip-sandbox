// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { VideoFilenames } = createRequire(import.meta.url)('../../electron/video-filenames.cjs');

describe('VideoFilenames', () => {
  const videoFilenames = new VideoFilenames();

  it('treats a movie extension as video whatever its letter case', () => {
    expect(['clip.mp4', 'CLIP.MKV', 'take.Mov'].map(name => videoFilenames.isVideo(name))).toEqual([true, true, true]);
  });

  it('does not treat collection text files or images as video', () => {
    expect(['order.txt', 'poster.png', 'notes'].map(name => videoFilenames.isVideo(name))).toEqual([false, false, false]);
  });

  it('gives each movie the media type the renderer plays it as', () => {
    expect(['clip.m4v', 'clip.mkv', 'clip.webm'].map(name => videoFilenames.mimeType(name)))
      .toEqual(['video/mp4', 'video/x-matroska', 'video/webm']);
  });

  it('gives a file that is not a movie no media type', () => {
    expect(videoFilenames.mimeType('order.txt')).toBe('');
  });
});
