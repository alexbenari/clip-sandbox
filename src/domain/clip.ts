export type ClipFile = File & {
  mediaSource?: string;
  path?: string;
  relativePath?: string;
  webkitRelativePath?: string;
};

export class ClipFileSnapshot extends File {
  declare readonly mediaSource: string;
  declare readonly path: string | undefined;
  declare readonly relativePath: string | undefined;

  constructor(file: ClipFile, mediaSource = file.mediaSource || '') {
    super([file], file.name, { type: file.type, lastModified: file.lastModified });
    Object.defineProperties(this, {
      mediaSource: { value: String(mediaSource), enumerable: true },
      path: { value: file.path, enumerable: true },
      relativePath: { value: file.relativePath, enumerable: true },
      webkitRelativePath: { value: file.webkitRelativePath || '', enumerable: true },
    });
    Object.freeze(this);
  }
}

export type ClipMetadata = {
  durationSec?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
};

type ClipParams = ClipMetadata & {
  id: string;
  file: ClipFile;
  mediaSource?: string;
};

export class Clip {
  #id: string;
  #file: ClipFileSnapshot;
  #durationSec: number | null;
  #videoWidth: number | null;
  #videoHeight: number | null;
  #metadataFailed: boolean;

  constructor({ id, file, durationSec = null, videoWidth = null, videoHeight = null, mediaSource = '' }: ClipParams) {
    if (!id) throw new Error('Clip id is required.');
    if (!file) throw new Error('Clip file is required.');
    this.#id = id;
    this.#file = new ClipFileSnapshot(file, mediaSource || file.mediaSource);
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
  }

  get id() {
    return this.#id;
  }

  get name() {
    return this.#file.name;
  }

  get file() {
    return this.#file;
  }

  get mediaSource() {
    return this.#file.mediaSource || '';
  }

  get videoWidth() {
    return this.#videoWidth;
  }

  get videoHeight() {
    return this.#videoHeight;
  }

  get durationSec() {
    return this.#durationSec;
  }

  get metadataFailed() {
    return this.#metadataFailed;
  }

  hasUsableDimensions() {
    const videoWidth = this.#videoWidth;
    const videoHeight = this.#videoHeight;
    return typeof videoWidth === 'number' && Number.isFinite(videoWidth) && videoWidth > 0
      && typeof videoHeight === 'number' && Number.isFinite(videoHeight) && videoHeight > 0;
  }

  setDuration(durationSec: number | null | undefined): void {
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
  }

  setVideoMetadata({ durationSec = this.#durationSec, videoWidth = this.#videoWidth, videoHeight = this.#videoHeight }: ClipMetadata = {}): void {
    this.setDuration(durationSec);
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
  }

  markMetadataFailed(): void {
    this.#metadataFailed = true;
  }

  replaceFile(file: ClipFile): void {
    if (!file) throw new Error('Clip file is required.');
    this.#file = new ClipFileSnapshot(file);
  }

  static #usableDimension(value: number | null | undefined): number | null {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0 ? dimension : null;
  }
}

