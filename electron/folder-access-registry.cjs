const path = require('path');

class FolderAccessRegistry {
  constructor() {
    this.pathsByWebContentsId = new Map();
    this.catalogPipelinesByWebContentsId = new Map();
    this.nextCatalogPipelineId = 0;
  }

  remember(webContents, folderPath) {
    const resolvedPath = this.resolveAbsolutePath(folderPath);
    this.pathsFor(webContents).add(resolvedPath);
    return resolvedPath;
  }

  pathsFor(webContents) {
    let paths = this.pathsByWebContentsId.get(webContents.id);
    if (!paths) {
      paths = new Set();
      this.pathsByWebContentsId.set(webContents.id, paths);
      webContents.once('destroyed', () => {
        this.pathsByWebContentsId.delete(webContents.id);
        this.catalogPipelinesByWebContentsId.delete(webContents.id);
      });
    }
    return paths;
  }

  replaceCatalogPipelines(webContents, pipelines) {
    this.pathsFor(webContents);
    const catalogPipelines = new Map();
    const descriptors = [];
    for (const pipeline of pipelines) {
      const folderPath = this.resolveAbsolutePath(pipeline.folderPath);
      const id = `pipeline_${++this.nextCatalogPipelineId}`;
      catalogPipelines.set(id, folderPath);
      descriptors.push({ id, name: pipeline.name });
    }
    this.catalogPipelinesByWebContentsId.set(webContents.id, catalogPipelines);
    return descriptors;
  }

  requireKnownCatalogPipeline(webContents, pipelineId) {
    if (typeof pipelineId !== 'string' || !pipelineId) {
      throw new Error('Pipeline access is unavailable for this catalog entry.');
    }
    const folderPath = this.catalogPipelinesByWebContentsId.get(webContents.id)?.get(pipelineId);
    if (!folderPath) throw new Error('Pipeline access is unavailable for this catalog entry.');
    return folderPath;
  }

  requireKnownPath(webContents, folderPath) {
    const resolvedPath = this.resolveAbsolutePath(folderPath);
    if (!this.pathsByWebContentsId.get(webContents.id)?.has(resolvedPath)) {
      throw new Error('Folder access is unavailable for this folder session.');
    }
    return resolvedPath;
  }

  resolveAbsolutePath(folderPath) {
    const requestedPath = String(folderPath || '').trim();
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
      throw new Error('Folder access requires an absolute folder path.');
    }
    return path.resolve(requestedPath);
  }
}

module.exports = { FolderAccessRegistry };
