const fsPromises = require('fs/promises');
const path = require('path');

class FolderFileOperations {
  #folderAccess;
  #fileNameValidity;
  #trashItem;
  #fs;

  constructor({ folderAccess, fileNameValidity, trashItem, fs = fsPromises }) {
    if (!folderAccess || !fileNameValidity || typeof trashItem !== 'function') {
      throw new Error('Folder file operation dependencies are invalid.');
    }
    this.#folderAccess = folderAccess;
    this.#fileNameValidity = fileNameValidity;
    this.#trashItem = trashItem;
    this.#fs = fs;
  }

  async saveText(sender, payload = {}) {
    await this.#fs.writeFile(this.#textFilePath(sender, payload), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  }

  async appendText(sender, payload = {}) {
    await this.#fs.appendFile(this.#textFilePath(sender, payload), String(payload.text || ''), 'utf8');
    return { mode: 'saved' };
  }

  async trash(sender, payload = {}) {
    const folderPath = this.#folderAccess.requireKnownPath(sender, payload.folderPath);
    const filenames = Array.from(payload.filenames || []).map(filename => String(filename || '').trim()).filter(Boolean);
    try {
      filenames.forEach(filename => this.#topLevelFilename(filename));
    } catch (error) {
      return { ok: false, code: 'partial', results: filenames.map(filename => this.#trashFailure(filename, error)) };
    }
    const results = [];
    for (const filename of filenames) {
      try {
        await this.#trashItem(path.join(folderPath, filename));
        results.push({ filename, ok: true });
      } catch (error) {
        results.push(this.#trashFailure(filename, error));
      }
    }
    const allTrashed = results.every(result => result.ok);
    return { ok: allTrashed, code: allTrashed ? 'trashed' : 'partial', results };
  }

  #textFilePath(sender, payload) {
    const folderPath = this.#folderAccess.requireKnownPath(sender, payload.folderPath);
    return path.join(folderPath, this.#topLevelFilename(payload.filename));
  }

  #topLevelFilename(filename) {
    const normalizedFilename = String(filename || '').trim();
    if (!this.#fileNameValidity.isLegalWindowsFileName(normalizedFilename)) {
      throw new Error(`Invalid top-level filename: ${filename}`);
    }
    return normalizedFilename;
  }

  #trashFailure(filename, error) {
    return { filename, ok: false, code: 'trash-failed', error: { message: error?.message || String(error) } };
  }
}

module.exports = { FolderFileOperations };
