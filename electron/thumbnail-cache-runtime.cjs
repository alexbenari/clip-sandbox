const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

class ThumbnailCacheRuntime {
  constructor(userDataPath, options = {}) {
    const resolvedUserData = path.resolve(String(userDataPath || ''));
    if (!path.isAbsolute(resolvedUserData) || resolvedUserData === path.parse(resolvedUserData).root) {
      throw new Error('Thumbnail-cache user-data path is invalid.');
    }
    this.thumbnailRoot = path.join(resolvedUserData, 'cache', 'thumbnails');
    this.maxPngBytes = options.maxPngBytes ?? 8 * 1024 * 1024;
  }

  async initialize() {
    await fs.rm(this.thumbnailRoot, { recursive: true, force: true });
    await fs.mkdir(this.thumbnailRoot, { recursive: true });
  }

  async save(value) {
    const bytes = this.pngBytes(value);
    await fs.mkdir(this.thumbnailRoot, { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = `thumbnail_${crypto.randomBytes(18).toString('base64url')}`;
      try {
        await fs.writeFile(this.filePath(id), bytes, { flag: 'wx' });
        return Object.freeze({ id });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    throw new Error('Could not allocate an opaque thumbnail id.');
  }

  async load(value) {
    const id = this.thumbnailId(value);
    const bytes = await fs.readFile(this.filePath(id));
    this.pngBytes(bytes);
    return Object.freeze({ id, bytes: Uint8Array.from(bytes) });
  }

  async delete(value) {
    const id = this.thumbnailId(value);
    try {
      await fs.unlink(this.filePath(id));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  async cleanup() {
    await fs.rm(this.thumbnailRoot, { recursive: true, force: true });
  }

  filePath(id) {
    return path.join(this.thumbnailRoot, this.thumbnailId(id) + '.png');
  }

  thumbnailId(value) {
    if (typeof value !== 'string' || !/^thumbnail_[a-zA-Z0-9_-]{8,120}$/.test(value)) {
      throw new Error('Thumbnail id is invalid.');
    }
    return value;
  }

  pngBytes(value) {
    if (!(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
      throw new Error('Thumbnail payload must be PNG bytes.');
    }
    if (value.byteLength > this.maxPngBytes) {
      throw new Error('Thumbnail PNG exceeds the byte limit.');
    }
    if (value.byteLength < PNG_SIGNATURE.byteLength
      || !PNG_SIGNATURE.every((byte, index) => value[index] === byte)) {
      throw new Error('Thumbnail payload is not a PNG image.');
    }
    return Buffer.from(value);
  }
}

module.exports = { ThumbnailCacheRuntime };
