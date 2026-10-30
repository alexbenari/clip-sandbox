import path from 'node:path';

export class FrameReviewPaths {
  readonly applicationFolder: string;
  readonly frameIndexCache: string;
  readonly exactReviewProxyCache: string;
  readonly playbackProxyCache: string;
  readonly sourceMeasurementCacheFile: string;

  constructor(applicationFolder: string) {
    if (!path.isAbsolute(applicationFolder)) throw new Error('Application folder must be an absolute path.');
    this.applicationFolder = path.resolve(applicationFolder);
    this.frameIndexCache = path.join(this.applicationFolder, 'frame-index-cache');
    this.exactReviewProxyCache = path.join(this.applicationFolder, 'exact-review-proxy-cache');
    this.playbackProxyCache = path.join(this.applicationFolder, 'playback-proxy-cache');
    this.sourceMeasurementCacheFile = path.join(this.applicationFolder, 'source-measurement-cache', 'measurements.json');
    Object.freeze(this);
  }
}
