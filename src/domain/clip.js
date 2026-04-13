export class Clip {
  #id;
  #file;
  #durationSec;
  #mediaSource;

  constructor({ id, file, durationSec = null, mediaSource = '' } = {}) {
    if (!id) throw new Error('Clip id is required.');
    if (!file) throw new Error('Clip file is required.');
    this.#id = id;
    this.#file = file;
    this.#durationSec = Number.isFinite(durationSec) ? durationSec : null;
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

  setDuration(durationSec) {
    this.#durationSec = Number.isFinite(durationSec) ? durationSec : null;
  }
}
