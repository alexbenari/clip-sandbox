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

  // null until the bootstrap (or packaging) has written the manifest.
  dependencyManifest() {
    return this.#readManifest(this.packaged
      ? path.join(this.resourcesPath, 'frame-review', 'dependency-manifest.json')
      : this.#developmentManifestPath());
  }

  #developmentManifest() {
    if (this.#manifest) return this.#manifest;
    try {
      this.#manifest = this.#readManifest(this.#developmentManifestPath());
    } catch (cause) {
      throw this.#unavailableManifest(cause);
    }
    if (!this.#manifest) throw this.#unavailableManifest();
    return this.#manifest;
  }

  #developmentManifestPath() {
    return path.join(this.projectFolder, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');
  }

  #readManifest(manifestPath) {
    if (this.existsSync(manifestPath)) {
      // Windows PowerShell 5 tools may write the manifest with a UTF-8 byte-order mark.
      const text = this.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(text);
    }
    return null;
  }

  #unavailableManifest(cause) {
    const error = new Error(`The staged native-product manifest is unavailable. ${RECOVERY_MESSAGE}`, cause ? { cause } : undefined);
    error.code = 'missing-binary';
    return error;
  }
}

module.exports = { NativeProductLocator, RECOVERY_MESSAGE };
