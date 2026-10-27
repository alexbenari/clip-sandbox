const fs = require('node:fs/promises');
const path = require('node:path');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { isVideoFilename } = require('./folder-entry.cjs');

class CollectionClipRefinement {
  constructor({ folderAccess, capturesStore, hostForEvent, chooseSourcePath,
    fileSystem = fs, provenance = new Mp4Provenance() }) {
    this.folderAccess = folderAccess;
    this.capturesStore = capturesStore;
    this.hostForEvent = hostForEvent;
    this.chooseSourcePath = chooseSourcePath;
    this.fs = fileSystem;
    this.provenance = provenance;
  }

  async inspect(event, request) {
    return { available: (await this.clipProvenance(event, request)) !== null };
  }

  async resolve(event, request) {
    const record = await this.clipProvenance(event, request);
    if (!record) throw new Error('This clip has no valid source movie and range metadata.');
    const fingerprint = record.sourceMovie.fingerprint;
    const displayName = record.sourceMovie.displayName;
    const host = this.hostForEvent(event);
    const candidates = [];
    const matchingNames = [];
    const otherNames = [];
    let remembered = null;
    try { remembered = await this.capturesStore.load(fingerprint); }
    catch (error) {
      console.warn('[collection-refine] remembered-source-unavailable', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
    if (remembered?.lastKnownPath) candidates.push(remembered.lastKnownPath);
    for (const folder of this.folderAccess.knownPipelinePaths(event.sender)) {
      let entries;
      try { entries = await this.fs.readdir(folder, { withFileTypes: true }); }
      catch { continue; }
      const videoNames = entries.filter(entry => entry.isFile() && isVideoFilename(entry.name))
        .map(entry => entry.name);
      for (const name of videoNames) {
        (name === displayName ? matchingNames : otherNames).push(path.join(folder, name));
      }
    }
    candidates.push(...matchingNames, ...otherNames);
    const checked = new Set();
    let unreadableCandidates = 0;
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (checked.has(resolved)) continue;
      checked.add(resolved);
      try {
        if (await host.sourceMatchesFingerprint(resolved, fingerprint)) {
          return this.selection(host, resolved, record);
        }
      } catch { unreadableCandidates += 1; }
    }
    if (unreadableCandidates > 0) {
      console.warn('[collection-refine] source-candidates-unavailable', { count: unreadableCandidates });
    }
    const selected = await this.chooseSourcePath(event);
    if (!selected) return { kind: 'cancelled' };
    if (!path.isAbsolute(selected) || !await host.sourceMatchesFingerprint(selected, fingerprint)) {
      throw new Error('The selected movie does not match this clip’s original source.');
    }
    return this.selection(host, path.resolve(selected), record);
  }

  selection(host, sourcePath, record) {
    return {
      kind: 'resolved',
      source: { name: path.basename(sourcePath), sourceHandle: host.registerSource(sourcePath) },
      range: record.sourceFrameRange,
    };
  }

  async clipProvenance(event, request) {
    const folder = this.folderAccess.requireKnownPath(event.sender, request?.folderPath);
    const filename = request?.filename;
    if (typeof filename !== 'string' || path.basename(filename) !== filename
      || !isVideoFilename(filename) || filename === '.' || filename === '..') {
      throw new Error('Collection clip filename is invalid.');
    }
    if (!this.provenance.canBeTagged(filename)) return null;
    const clipPath = path.join(folder, filename);
    const stat = await this.fs.stat(clipPath);
    if (!stat.isFile()) throw new Error('Collection clip is not a file.');
    return this.provenance.read(clipPath);
  }
}

module.exports = { CollectionClipRefinement };
