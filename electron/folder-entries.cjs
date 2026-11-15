const fsPromises = require('fs/promises');
const path = require('path');
const { MediaAddresses } = require('./media-addresses.cjs');
const { VideoFilenames } = require('./video-filenames.cjs');

class FolderEntries {
  #fs;
  #mediaAddresses = new MediaAddresses();
  #videoFilenames = new VideoFilenames();

  constructor({ fs = fsPromises } = {}) {
    this.#fs = fs;
  }

  async read(folderPath) {
    const dirents = await this.#fs.readdir(folderPath, { withFileTypes: true });
    const files = [];
    for (const dirent of dirents.filter(entry => entry?.isFile?.() === true)) {
      files.push(await this.entry(path.join(folderPath, dirent.name)));
    }
    return files;
  }

  async entry(absolutePath) {
    const stat = await this.#fs.stat(absolutePath);
    const name = path.basename(absolutePath);
    const isText = path.extname(name).toLowerCase() === '.txt';
    const entry = {
      name,
      path: absolutePath,
      relativePath: name,
      mediaSource: this.#mediaAddresses.address(absolutePath, stat.mtimeMs),
      type: isText ? 'text/plain' : this.#videoFilenames.mimeType(name),
      lastModifiedMs: stat.mtimeMs,
      size: stat.size,
    };
    if (isText) entry.text = await this.#fs.readFile(absolutePath, 'utf8');
    return entry;
  }
}

module.exports = { FolderEntries };
