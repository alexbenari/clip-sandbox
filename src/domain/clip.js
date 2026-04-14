/**
 * @typedef {File & { mediaSource?: string }} ClipFile
 */

export class Clip {
  #id;
  #file;
  #durationSec;
  #mediaSource;

  /**
   * @param {{ id?: string, file?: ClipFile, durationSec?: number | null, mediaSource?: string }} [params]
   */
  constructor({ id, file, durationSec = null, mediaSource = '' } = {}) {
    if (!id) throw new Error('Clip id is required.');
    if (!file) throw new Error('Clip file is required.');
    this.#id = id;
    this.#file = file;
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
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

  get durationSec() {
    return this.#durationSec;
  }

  /**
   * @param {number | null | undefined} durationSec
   * @returns {void}
   */
  setDuration(durationSec) {
    this.#durationSec = typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : null;
  }
}
