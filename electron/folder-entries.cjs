const fsPromises = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { VideoFilenames } = require('./video-filenames.cjs');

class FolderEntries {
  #fs;
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
      mediaSource: this.mediaSource(absolutePath, stat.mtimeMs),
      type: isText ? 'text/plain' : this.#videoFilenames.mimeType(name),
      lastModifiedMs: stat.mtimeMs,
      size: stat.size,
    };
    if (isText) entry.text = await this.#fs.readFile(absolutePath, 'utf8');
    return entry;
  }

  // The address names the file's version, so a file replaced under the same name is not shown from the
  // renderer's media cache of the previous one.
  mediaSource(absolutePath, lastModifiedMs) {
    return `${pathToFileURL(absolutePath).href}?modified=${Math.round(lastModifiedMs)}`;
  }
}

module.exports = { FolderEntries };
