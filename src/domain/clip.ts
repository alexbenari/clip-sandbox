// @ts-nocheck
/**
 * @typedef {File & { mediaSource?: string }} ClipFile
 */

export class Clip {
  #id;
  #file;
  #durationSec;
  #videoWidth;
  #videoHeight;
  #metadataFailed;
  #mediaSource;

  /**
   * @param {{ id?: string, file?: ClipFile, durationSec?: number | null, videoWidth?: number | null, videoHeight?: number | null, mediaSource?: string }} [params]
   */
  constructor({ id, file, durationSec = null, videoWidth = null, videoHeight = null, mediaSource = '' } = {}) {
    if (!id) throw new Error('Clip id is required.');
    if (!file) throw new Error('Clip file is required.');
    this.#id = id;
    this.#file = file;
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
    this.#mediaSource = String(mediaSource || file?.mediaSource || '');
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
    return this.#mediaSource;
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
    return Number.isFinite(this.#videoWidth) && this.#videoWidth > 0
      && Number.isFinite(this.#videoHeight) && this.#videoHeight > 0;
  }

  /**
   * @param {number | null | undefined} durationSec
   * @returns {void}
   */
  setDuration(durationSec) {
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
  }

  /**
   * @param {{ durationSec?: number | null, videoWidth?: number | null, videoHeight?: number | null }} [metadata]
   * @returns {void}
   */
  setVideoMetadata({ durationSec = this.#durationSec, videoWidth = this.#videoWidth, videoHeight = this.#videoHeight } = {}) {
    this.setDuration(durationSec);
    this.#videoWidth = Clip.#usableDimension(videoWidth);
    this.#videoHeight = Clip.#usableDimension(videoHeight);
    this.#metadataFailed = false;
  }

  /**
   * @returns {void}
   */
  markMetadataFailed() {
    this.#metadataFailed = true;
  }

  /**
   * @param {ClipFile} file
   * @returns {void}
   */
  replaceFile(file) {
    if (!file) throw new Error('Clip file is required.');
    this.#file = file;
    this.#mediaSource = String(file?.mediaSource || '');
  }

  static #usableDimension(value) {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0 ? dimension : null;
  }
}

