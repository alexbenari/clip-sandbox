export class GridPreviewPlaybackController {
  private readonly playbackTokens = new WeakMap<HTMLElement, number>();

  cancel(grid: HTMLElement | null | undefined): void {
    if (!grid) return;
    this.playbackTokens.set(grid, (this.playbackTokens.get(grid) || 0) + 1);
  }

  schedule(grid: HTMLElement): void {
    const view = grid.ownerDocument.defaultView || window;
    const token = (this.playbackTokens.get(grid) || 0) + 1;
    this.playbackTokens.set(grid, token);
    const batchDelayMs = 120;

    const scheduleCallback = (callback: () => void, delay = 0): void => {
      if (delay > 0) {
        view.setTimeout(callback, delay);
      } else if (typeof view.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(callback);
      } else {
        setTimeout(callback, 0);
      }
    };

    const runBatch = (retryIndex = 0, startIndex = 0): void => {
      if (this.playbackTokens.get(grid) !== token) return;
      const videos = Array.from(grid.querySelectorAll('video')) as HTMLVideoElement[];
      const readyVideos = videos.filter(video => video.readyState >= 2 && (video.paused || video.ended));
      const video = readyVideos[startIndex];
      if (video) this.start(video);

      const nextIndex = startIndex + (video ? 1 : 0);
      if (readyVideos.length > nextIndex) {
        scheduleCallback(() => runBatch(retryIndex, nextIndex), batchDelayMs);
        return;
      }

      if (retryIndex === 0) scheduleCallback(() => runBatch(1, 0), 800);
    };

    scheduleCallback(() => scheduleCallback(() => runBatch()));
  }

  start(video: HTMLVideoElement | null | undefined): void {
    try {
      const result = video?.play();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Preview playback is best-effort because media APIs are not available in every renderer host.
    }
  }
}
