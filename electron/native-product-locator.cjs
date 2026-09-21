const fs = require('node:fs');
const path = require('node:path');

const RECOVERY_MESSAGE = 'Run npm run frame-review:bootstrap, then npm run frame-review:build.';

class NativeProductLocator {
  #manifest = null;

  constructor({
    projectFolder = path.resolve(__dirname, '..'),
    resourcesPath = process.resourcesPath || '',
    packaged = false,
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
  } = {}) {
    this.projectFolder = path.resolve(projectFolder);
    this.resourcesPath = resourcesPath ? path.resolve(resourcesPath) : '';
    this.packaged = packaged === true;
    this.existsSync = existsSync;
    this.readFileSync = readFileSync;
  }

  ffmpeg() { return this.#product('ffmpeg'); }
  ffprobe() { return this.#product('ffprobe'); }

  environment(baseEnvironment = process.env) {
    const entries = this.packaged
      ? [path.join(this.resourcesPath, 'frame-review', 'bin')]
      : [
        this.#developmentManifest()?.ffmpeg?.runtimeDllRoot,
        this.#developmentManifest()?.compiler?.runtimeDllRoot,
      ];
    return {
      ...baseEnvironment,
      PATH: [...entries.filter(value => typeof value === 'string' && value), baseEnvironment.PATH || '']
        .join(path.delimiter),
    };
  }

  #product(name) {
    const candidate = this.packaged
      ? path.join(this.resourcesPath, 'frame-review', 'bin', `${name}.exe`)
      : this.#developmentProduct(name);
    const resolved = path.resolve(candidate);
    if (!this.existsSync(resolved)) {
      const error = new Error(`The staged ${name} product is missing. ${RECOVERY_MESSAGE}`);
      error.code = 'missing-binary';
      throw error;
    }
    return resolved;
  }

  #developmentProduct(name) {
    const manifest = this.#developmentManifest();
    const configured = manifest?.[name]?.path;
    if (typeof configured !== 'string' || !configured.trim()) {
      const error = new Error(`The staged ${name} product is not configured. ${RECOVERY_MESSAGE}`);
      error.code = 'missing-binary';
      throw error;
    }
    return configured;
  }

  #developmentManifest() {
    if (this.#manifest) return this.#manifest;
    const manifestPath = path.join(
      this.projectFolder, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
    try {
      const text = this.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
      this.#manifest = JSON.parse(text);
      return this.#manifest;
    } catch (cause) {
      const error = new Error(`The staged native-product manifest is unavailable. ${RECOVERY_MESSAGE}`, { cause });
      error.code = 'missing-binary';
      throw error;
    }
  }
}

module.exports = { NativeProductLocator, RECOVERY_MESSAGE };
