const fs = require('node:fs/promises');
const path = require('node:path');
const { isVideoFilename } = require('./folder-entry.cjs');

// Movie paths stay in the main process; the renderer never receives one.
class SourceMovieLocator {
  constructor({ folderAccess, capturesStore, hostForEvent, chooseSourcePath, fileSystem = fs }) {
    this.folderAccess = folderAccess;
    this.capturesStore = capturesStore;
    this.hostForEvent = hostForEvent;
    this.chooseSourcePath = chooseSourcePath;
    this.fs = fileSystem;
  }

  async locate(event, sourceMovie) {
    const host = this.hostForEvent(event);
    const checked = new Set();
    let unreadableCandidates = 0;
    for (const candidate of await this.candidates(event, sourceMovie)) {
      const resolved = path.resolve(candidate);
      if (checked.has(resolved)) continue;
      checked.add(resolved);
      try {
        if (await host.sourceMatchesFingerprint(resolved, sourceMovie.fingerprint)) return { kind: 'located', moviePath: resolved };
      } catch { unreadableCandidates += 1; }
    }
    if (unreadableCandidates > 0) {
      console.warn('[source-movie] candidates-unavailable', { count: unreadableCandidates });
    }
    const selected = await this.chooseSourcePath(event);
    if (!selected) return { kind: 'cancelled' };
    if (!path.isAbsolute(selected) || !await host.sourceMatchesFingerprint(selected, sourceMovie.fingerprint)) {
      throw new Error('The selected movie does not match this clip’s original source.');
    }
    return { kind: 'located', moviePath: path.resolve(selected) };
  }

  async candidates(event, sourceMovie) {
    const remembered = [];
    try {
      const saved = await this.capturesStore.load(sourceMovie.fingerprint);
      if (saved?.lastKnownPath) remembered.push(saved.lastKnownPath);
    } catch (error) {
      console.warn('[source-movie] remembered-source-unavailable', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
    const matchingNames = [];
    const otherNames = [];
    for (const folder of this.folderAccess.knownPipelinePaths(event.sender)) {
      let entries;
      try { entries = await this.fs.readdir(folder, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (!entry.isFile() || !isVideoFilename(entry.name)) continue;
        (entry.name === sourceMovie.displayName ? matchingNames : otherNames).push(path.join(folder, entry.name));
      }
    }
    return [...remembered, ...matchingNames, ...otherNames];
  }
}

module.exports = { SourceMovieLocator };
