const fs = require('node:fs/promises');
const path = require('node:path');
const { ClipFilenameRule } = require('./clip-filename-rule.cjs');

class GrantedClipRefusal extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

// A renderer names a clip only by a folder it was granted and a plain video name inside it.
class GrantedClipResolver {
  #folderAccess;
  #fs;
  #filenameRule = new ClipFilenameRule();

  constructor({ folderAccess, fileSystem = fs }) {
    this.#folderAccess = folderAccess;
    this.#fs = fileSystem;
  }

  async resolve(sender, { folderPath, filename } = {}) {
    let folder;
    try {
      folder = this.#folderAccess.requireKnownPath(sender, folderPath);
    } catch {
      throw new GrantedClipRefusal('folder-not-open', 'Folder access is unavailable for this folder session.');
    }
    if (!this.#filenameRule.isPlainVideoFilename(filename)) throw new GrantedClipRefusal('invalid-name', 'Clip filename is invalid.');
    const clipPath = path.join(folder, filename);
    const stat = await this.#fs.stat(clipPath).catch(() => null);
    if (!stat?.isFile()) throw new GrantedClipRefusal('not-a-file', 'Clip is not a file.');
    return Object.freeze({ folder, filename, path: clipPath });
  }
}

module.exports = { GrantedClipRefusal, GrantedClipResolver };
