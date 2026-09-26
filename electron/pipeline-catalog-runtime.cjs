const fsPromises = require('fs/promises');
const path = require('path');
const { readFolderEntries, isVideoFilename } = require('./folder-entry.cjs');

class PipelineCatalogRuntime {
  constructor({ settingsStore, folderAccess, fs = fsPromises }) {
    this.settingsStore = settingsStore;
    this.folderAccess = folderAccess;
    this.fs = fs;
  }

  async listPipelines(webContents) {
    const rootPath = await this.configuredRootPath();
    if (!rootPath) {
      this.folderAccess.replaceCatalogPipelines(webContents, []);
      return { kind: 'unconfigured' };
    }

    const childDirectories = await this.fs.readdir(rootPath, { withFileTypes: true });
    const candidates = [];
    for (const child of childDirectories) {
      if (!child.isDirectory()) continue;
      const folderPath = path.join(rootPath, child.name);
      if (await this.hasTopLevelVideoFile(folderPath)) candidates.push({ folderPath, name: child.name });
    }

    candidates.sort((left, right) => this.comparePipelineNames(left.name, right.name));
    return {
      kind: 'available',
      entries: this.folderAccess.replaceCatalogPipelines(webContents, candidates),
    };
  }

  async describePipeline(webContents, pipelineId) {
    const folderPath = this.folderAccess.requireKnownCatalogPipeline(webContents, pipelineId);
    const entries = await this.fs.readdir(folderPath, { withFileTypes: true });
    const clipNames = entries
      .filter(entry => entry.isFile() && isVideoFilename(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
    const collectionFiles = entries
      .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt')
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
    const collections = await Promise.all(collectionFiles.map(async entry => ({
      name: path.basename(entry.name, path.extname(entry.name)),
      clipNames: this.collectionClipNames(await this.fs.readFile(path.join(folderPath, entry.name), 'utf8')),
    })));
    return { clipNames, collections };
  }

  async openPipeline(webContents, pipelineId) {
    const folderPath = this.folderAccess.requireKnownCatalogPipeline(webContents, pipelineId);
    const files = await readFolderEntries(folderPath);
    this.folderAccess.remember(webContents, folderPath);
    return {
      folderPath,
      folderName: path.basename(folderPath),
      files,
    };
  }

  async configuredRootPath() {
    const settingsResult = await this.settingsStore.load();
    if (!settingsResult.ok) throw new Error(settingsResult.error || 'Could not load Pipelines settings.');
    const rootPath = settingsResult.settings?.pipelinesRootPath;
    return typeof rootPath === 'string' && path.isAbsolute(rootPath) ? path.resolve(rootPath) : null;
  }

  async hasTopLevelVideoFile(folderPath) {
    const entries = await this.fs.readdir(folderPath, { withFileTypes: true });
    return entries.some(entry => entry.isFile() && isVideoFilename(entry.name));
  }

  collectionClipNames(content) {
    return String(content)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  comparePipelineNames(left, right) {
    const isLeftExtraction = left.localeCompare('extraction-tmp', undefined, { sensitivity: 'base' }) === 0;
    const isRightExtraction = right.localeCompare('extraction-tmp', undefined, { sensitivity: 'base' }) === 0;
    if (isLeftExtraction !== isRightExtraction) return isLeftExtraction ? -1 : 1;
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }
}

module.exports = { PipelineCatalogRuntime };
