const fsPromises = require('node:fs').promises;
const path = require('node:path');

const SETTINGS_FILENAME = 'app-settings.json';
const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = Object.freeze({
  pipelinesRootPath: null,
  singleClipAudioDefault: false,
});

let temporaryFileCounter = 0;

function cloneSettings(settings) {
  return {
    pipelinesRootPath: settings.pipelinesRootPath,
    singleClipAudioDefault: settings.singleClipAudioDefault,
  };
}

function validateSettings(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Settings must be an object with exactly two fields';
  }

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'pipelinesRootPath' || keys[1] !== 'singleClipAudioDefault') {
    return 'Settings must be an object with exactly two fields';
  }

  const { pipelinesRootPath, singleClipAudioDefault } = value;
  if (pipelinesRootPath !== null &&
      (typeof pipelinesRootPath !== 'string' ||
       pipelinesRootPath.trim().length === 0 ||
       pipelinesRootPath.includes('\0') ||
       !path.isAbsolute(pipelinesRootPath))) {
    return 'pipelinesRootPath must be null or a nonempty absolute folder path';
  }
  if (typeof singleClipAudioDefault !== 'boolean') {
    return 'singleClipAudioDefault must be a boolean';
  }

  return null;
}

class AppSettingsStore {
  #directoryPath;
  #settingsFilePath;
  #fs;
  #saveQueue = Promise.resolve();

  constructor(directoryPath, fs = fsPromises) {
    if (typeof directoryPath !== 'string' || directoryPath.length === 0) {
      throw new TypeError('directoryPath must be a nonempty string');
    }
    this.#directoryPath = directoryPath;
    this.#settingsFilePath = path.join(directoryPath, SETTINGS_FILENAME);
    this.#fs = fs;
  }

  async load() {
    let text;
    try {
      text = await this.#fs.readFile(this.#settingsFilePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { ok: true, settings: cloneSettings(DEFAULT_SETTINGS) };
      }
      return this.#loadWarning(`Could not read settings: ${this.#errorMessage(error)}`);
    }

    try {
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      const document = JSON.parse(text);
      if (document === null || typeof document !== 'object' || Array.isArray(document) || document.version !== SETTINGS_VERSION) {
        throw new Error('unsupported settings version');
      }
      const settings = {
        pipelinesRootPath: document.pipelinesRootPath,
        singleClipAudioDefault: document.singleClipAudioDefault,
      };
      const validationError = validateSettings(settings);
      if (validationError !== null || Object.keys(document).some((key) => !['version', 'pipelinesRootPath', 'singleClipAudioDefault'].includes(key))) {
        throw new Error(validationError || 'unexpected settings fields');
      }
      return { ok: true, settings };
    } catch (error) {
      return this.#loadWarning(`Could not load settings: ${this.#errorMessage(error)}`);
    }
  }

  save(value) {
    const validationError = validateSettings(value);
    if (validationError !== null) {
      return Promise.resolve({ ok: false, error: validationError });
    }

    const settings = cloneSettings(value);
    const operation = this.#saveQueue.then(() => this.#writeSettings(settings));
    this.#saveQueue = operation.catch(() => undefined);
    return operation;
  }

  async #writeSettings(settings) {
    let temporaryPath;
    try {
      await this.#fs.mkdir(this.#directoryPath, { recursive: true });
      temporaryPath = this.#temporaryPath();
      const serialized = `${JSON.stringify({ version: SETTINGS_VERSION, ...settings })}\n`;
      await this.#fs.writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await this.#fs.rename(temporaryPath, this.#settingsFilePath);
      temporaryPath = undefined;
      return { ok: true, settings: cloneSettings(settings) };
    } catch (error) {
      if (temporaryPath !== undefined) {
        try {
          await this.#fs.unlink(temporaryPath);
        } catch {
          // The original settings file remains untouched if cleanup also fails.
        }
      }
      return { ok: false, error: this.#errorMessage(error) };
    }
  }

  #temporaryPath() {
    temporaryFileCounter += 1;
    return path.join(
      this.#directoryPath,
      `.${SETTINGS_FILENAME}.${process.pid}.${Date.now()}-${temporaryFileCounter}.tmp`,
    );
  }

  #loadWarning(message) {
    return { ok: true, settings: cloneSettings(DEFAULT_SETTINGS), warning: message };
  }

  #errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }
}

module.exports = { AppSettingsStore };
