// @ts-nocheck
import { describe, expect, test, vi } from 'vitest';
import { GridVideoMetadataTracker } from '../../src/ui/grid-video-metadata-tracker.js';
import { Clip } from '../../src/domain/clip.js';

function clip(id, name = `${id}.mp4`) {
  return new Clip({ id, file: new File(['x'], name, { type: 'video/mp4' }) });
}

describe('grid video metadata tracker', () => {
  test('treats clips with known dimensions as already loaded', () => {
    const complete = vi.fn();
    const alpha = clip('clip_1', 'alpha.mp4');
    alpha.setVideoMetadata({ videoWidth: 640, videoHeight: 360 });
    const tracker = new GridVideoMetadataTracker({
      onComplete: complete,
      setTimer: (callback) => {
        callback();
        return 1;
      },
    });

    tracker.start([alpha]);

    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('completes once after every pending clip has loaded or failed', () => {
    const complete = vi.fn();
    const failure = vi.fn();
    const alpha = clip('clip_1', 'alpha.mp4');
    const bravo = clip('clip_2', 'bravo.mp4');
    const tracker = new GridVideoMetadataTracker({
      onComplete: complete,
      onFailure: failure,
      setTimer: (callback) => {
        callback();
        return 1;
      },
    });
    const token = tracker.start([alpha, bravo]);

    expect(complete).not.toHaveBeenCalled();
    expect(tracker.markLoaded(token, alpha)).toBe(true);
    expect(complete).not.toHaveBeenCalled();
    expect(tracker.markFailed(token, bravo, new Error('metadata unavailable'))).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);

    tracker.markLoaded(token, bravo);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('ignores stale sequence events', () => {
    const complete = vi.fn();
    const alpha = clip('clip_1', 'alpha.mp4');
    const tracker = new GridVideoMetadataTracker({
      onComplete: complete,
      setTimer: (callback) => {
        callback();
        return 1;
      },
    });
    const staleToken = tracker.start([alpha]);
    const currentToken = tracker.start([alpha]);

    expect(tracker.markLoaded(staleToken, alpha)).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(tracker.markLoaded(currentToken, alpha)).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('logs one failure per clip within a sequence', () => {
    const failure = vi.fn();
    const alpha = clip('clip_1', 'alpha.mp4');
    const tracker = new GridVideoMetadataTracker({
      onFailure: failure,
      setTimer: (callback) => {
        callback();
        return 1;
      },
    });
    const token = tracker.start([alpha]);

    tracker.markFailed(token, alpha, new Error('first'));
    tracker.markFailed(token, alpha, new Error('second'));

    expect(failure).toHaveBeenCalledTimes(1);
    expect(alpha.metadataFailed).toBe(true);
  });
});
