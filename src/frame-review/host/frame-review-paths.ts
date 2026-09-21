import path from 'node:path';

export class FrameReviewPaths {
  readonly applicationFolder: string;
  readonly frameIndexCache: string;
  readonly proxyCache: string;

  constructor(applicationFolder: string) {
    if (!path.isAbsolute(applicationFolder)) throw new Error('Application folder must be an absolute path.');
    this.applicationFolder = path.resolve(applicationFolder);
    this.frameIndexCache = path.join(this.applicationFolder, 'frame-index-cache');
    this.proxyCache = path.join(this.applicationFolder, 'proxy-cache');
    Object.freeze(this);
  }
}
