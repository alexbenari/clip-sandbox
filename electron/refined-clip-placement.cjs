const fs = require('node:fs/promises');
const { constants: { COPYFILE_EXCL } } = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { mediaSourceOf } = require('./folder-entry.cjs');

const MAX_KEEP_BOTH_NAMES = 1000;
const MAX_TEMPORARY_NAMES = 8;

class RefinedClipKeptUnderTemporaryName extends Error {
  constructor() {
    super('The refined clip was kept under a temporary name in the folder.');
    this.code = 'kept-under-temporary-name';
  }
}

// Names come only from the granted clip's own name; existing files are never overwritten.
class RefinedClipPlacement {
  #trashItem;
  #fs;
  #randomId;
  #replacing = Promise.resolve();

  constructor({ trashItem, fileSystem = fs, randomId = () => randomBytes(6).toString('hex') }) {
    if (typeof trashItem !== 'function') throw new Error('Refined clip placement dependencies are invalid.');
    this.#trashItem = trashItem;
    this.#fs = fileSystem;
    this.#randomId = randomId;
  }

  // The suffix names the staged edits, such as `-refined-looped`; Keep both adds it to the original's name.
  keepBoth(clip, mediaPath, suffix) {
    return this.#keptBoth({ ...clip, suffix: this.#checkedSuffix(suffix) }, mediaPath, {});
  }

  // Replace saves run one at a time, so two of them never both find a name free and rename onto it.
  replace(clip, mediaPath, suffix) {
    const named = { ...clip, suffix: this.#checkedSuffix(suffix) };
    const replacing = this.#replacing.catch(() => undefined).then(() => this.#replaced(named, mediaPath));
    this.#replacing = replacing;
    return replacing;
  }

  #checkedSuffix(suffix) {
    if (typeof suffix !== 'string' || !/^(-[a-z]+)+$/.test(suffix)) throw new Error('The saved clip name suffix is invalid.');
    return suffix;
  }

  // The original goes to the Recycle Bin only once its replacement is complete, so the folder never loses the clip.
  async #replaced(clip, mediaPath) {
    const target = this.#replacementOf(clip);
    if (target.replacedFilename !== undefined && await this.#exists(target.path)) {
      return this.#keptBoth(clip, mediaPath, { notice: 'name-taken' });
    }
    const temporary = await this.#temporaryCopy(clip, mediaPath);
    try {
      await this.#trashItem(clip.path);
    } catch (error) {
      console.warn('[zoom-edit-save] recycle-bin-refused', { kind: error instanceof Error ? error.name : 'unknown' });
      return this.#keptBesideOriginal(clip, temporary);
    }
    return this.#placedAfterTrash(clip, temporary, target);
  }

  #replacementOf(clip) {
    if (path.extname(clip.filename).toLowerCase() === '.mp4') return { filename: clip.filename, path: clip.path };
    const filename = `${path.parse(clip.filename).name}.mp4`;
    return { filename, path: path.join(clip.folder, filename), replacedFilename: clip.filename };
  }

  // The name is not a video, so a folder listing never shows the file while it is being placed.
  async #temporaryCopy(clip, mediaPath) {
    for (let attempt = 1; attempt <= MAX_TEMPORARY_NAMES; attempt += 1) {
      const temporary = path.join(clip.folder, `${path.parse(clip.filename).name}.${this.#randomId()}.refining`);
      if (await this.#copiedExclusively(mediaPath, temporary)) return temporary;
    }
    throw new Error('No free temporary name is left for the refined clip.');
  }

  async #keptBesideOriginal(clip, temporary) {
    try {
      return await this.#keptBoth(clip, temporary, { notice: 'recycle-bin-refused' });
    } finally {
      await this.#removeTemporary(temporary);
    }
  }

  // With the original in the Recycle Bin, the temporary file is the only copy of the clip until it is placed.
  async #placedAfterTrash(clip, temporary, target) {
    const movedAside = notice => this.#movedToKeepBothName(clip, temporary, { outcome: 'replaced', replacedFilename: clip.filename, notice });
    // fs.rename replaces an existing file, so a name taken meanwhile, or one that cannot be checked, is not used.
    const nameTaken = await this.#exists(target.path).catch(() => true);
    if (nameTaken) return movedAside('name-taken');
    try {
      await this.#fs.rename(temporary, target.path);
    } catch (error) {
      console.warn('[zoom-edit-save] rename-failed', { code: error?.code });
      return movedAside('rename-failed');
    }
    const { replacedFilename } = target;
    return this.#saved(clip.folder, target.filename, { outcome: 'replaced', ...(replacedFilename === undefined ? {} : { replacedFilename }) });
  }

  async #movedToKeepBothName(clip, temporary, details) {
    let saved;
    try {
      saved = await this.#keptBoth(clip, temporary, details);
    } catch (error) {
      console.warn('[zoom-edit-save] kept-under-temporary-name', { code: error?.code });
      throw new RefinedClipKeptUnderTemporaryName();
    }
    await this.#removeTemporary(temporary);
    return saved;
  }

  // The clip is already saved under another name, so a leftover temporary file does not fail the save.
  async #removeTemporary(temporary) {
    try {
      await this.#fs.rm(temporary, { force: true });
    } catch (error) {
      console.warn('[zoom-edit-save] temporary-cleanup-failed', { code: error?.code });
    }
  }

  // False when the name is taken. Exclusive creation proves that a partly written file is this copy's own.
  async #copiedExclusively(source, destination) {
    try {
      await this.#fs.copyFile(source, destination, COPYFILE_EXCL);
      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      await this.#fs.rm(destination, { force: true });
      throw error;
    }
  }

  async #keptBoth(clip, mediaPath, details) {
    const stem = path.parse(clip.filename).name;
    for (let sequence = 1; sequence <= MAX_KEEP_BOTH_NAMES; sequence += 1) {
      const filename = sequence === 1 ? `${stem}${clip.suffix}.mp4` : `${stem}${clip.suffix}-${sequence}.mp4`;
      if (!(await this.#copiedExclusively(mediaPath, path.join(clip.folder, filename)))) continue;
      return this.#saved(clip.folder, filename, { outcome: 'kept-both', ...details });
    }
    throw new Error('No free name is left for the refined clip.');
  }

  async #exists(filePath) {
    try {
      await this.#fs.stat(filePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async #saved(folder, filename, details) {
    const filePath = path.join(folder, filename);
    const stat = await this.#fs.stat(filePath);
    const entry = { name: filename, path: filePath, mediaSource: mediaSourceOf(filePath, stat.mtimeMs), type: 'video/mp4', size: stat.size, lastModifiedMs: stat.mtimeMs };
    return { filename, entry, ...details };
  }
}

module.exports = { RefinedClipKeptUnderTemporaryName, RefinedClipPlacement };
