const path = require('path');

class FolderAccessRegistry {
  constructor() {
    this.pathsByWebContentsId = new Map();
  }

  remember(webContents, folderPath) {
    const resolvedPath = this.resolveAbsolutePath(folderPath);
    let paths = this.pathsByWebContentsId.get(webContents.id);
    if (!paths) {
      paths = new Set();
      this.pathsByWebContentsId.set(webContents.id, paths);
      webContents.once('destroyed', () => this.pathsByWebContentsId.delete(webContents.id));
    }
    paths.add(resolvedPath);
    return resolvedPath;
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
