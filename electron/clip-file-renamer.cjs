const fs = require('node:fs/promises');
const path = require('node:path');
const { ClipFilenameRule } = require('./clip-filename-rule.cjs');
const { createFolderEntry } = require('./folder-entry.cjs');
const { GrantedClipRefusal, GrantedClipResolver } = require('./granted-clip-resolver.cjs');

class ClipFileRenamer {
  #grantedClips;
  #fs;
  #filenameRule = new ClipFilenameRule();
  #fileNameValidity;

  constructor({ folderAccess, fileNameValidity, fileSystem = fs }) {
    if (typeof fileNameValidity?.isLegalWindowsFileName !== 'function') {
      throw new Error('Clip renamer dependencies are invalid.');
    }
    this.#grantedClips = new GrantedClipResolver({ folderAccess, fileSystem });
    this.#fileNameValidity = fileNameValidity;
    this.#fs = fileSystem;
  }

  async rename(sender, request) {
    const { folderPath, filename, newFilename } = request ?? {};
    let clip;
    try {
      clip = await this.#grantedClips.resolve(sender, { folderPath, filename });
    } catch (error) {
      if (error instanceof GrantedClipRefusal) return { kind: 'refused', reason: error.reason };
      throw error;
    }
    if (!this.#filenameRule.isPlainVideoFilename(newFilename)
      || !this.#fileNameValidity.isLegalWindowsFileName(newFilename)
      || !this.#keepsExtension(filename, newFilename)) {
      return { kind: 'refused', reason: 'invalid-name' };
    }
    const target = path.join(clip.folder, newFilename);
    // Windows names ignore case, so a change of case alone names the clip itself.
    if (newFilename.toLowerCase() !== filename.toLowerCase() && await this.#exists(target)) {
      return { kind: 'refused', reason: 'name-taken' };
    }
    await this.#fs.rename(clip.path, target);
    return { kind: 'renamed', entry: await createFolderEntry(target) };
  }

  #keepsExtension(filename, newFilename) {
    return path.extname(filename).toLowerCase() === path.extname(newFilename).toLowerCase();
  }

  async #exists(filePath) {
    try {
      await this.#fs.lstat(filePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }
}

module.exports = { ClipFileRenamer };
