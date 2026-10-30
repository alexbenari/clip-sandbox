const fs = require('node:fs/promises');
const path = require('node:path');
const { isVideoFilename } = require('./folder-entry.cjs');

// Movie paths stay in the main process; the renderer never receives one.
class SourceMovieLocator {
  constructor({ folderAccess, capturesStore, locatedMovies, hostForEvent, chooseSourcePath, fileSystem = fs }) {
    this.folderAccess = folderAccess;
    this.capturesStore = capturesStore;
    this.locatedMovies = locatedMovies;
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
        if (await this.#holdsMovie(host, resolved, sourceMovie.fingerprint)) return this.#located(sourceMovie, resolved);
      } catch { unreadableCandidates += 1; }
    }
    if (unreadableCandidates > 0) {
      console.warn('[source-movie] candidates-unavailable', { count: unreadableCandidates });
    }
    const selected = await this.chooseSourcePath(event);
    if (!selected) return { kind: 'cancelled' };
    if (!path.isAbsolute(selected) || !await this.#holdsMovie(host, path.resolve(selected), sourceMovie.fingerprint)) {
      throw new Error('The selected movie does not match this clip’s original source.');
    }
    return this.#located(sourceMovie, path.resolve(selected));
  }

  // Fingerprinting reads the file, so a file of another size is ruled out first.
  async #holdsMovie(host, moviePath, fingerprint) {
    const details = await this.fs.stat(moviePath);
    if (!details.isFile() || BigInt(details.size) !== BigInt(fingerprint.sourceBytes)) return false;
    return host.sourceMatchesFingerprint(moviePath, fingerprint);
  }

  async #located(sourceMovie, moviePath) {
    await this.locatedMovies.remember(sourceMovie.fingerprint, moviePath);
    return { kind: 'located', moviePath };
  }

  async candidates(event, sourceMovie) {
    const remembered = [];
    const lastLocated = await this.locatedMovies.pathOf(sourceMovie.fingerprint);
    if (lastLocated) remembered.push(lastLocated);
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
