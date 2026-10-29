const fs = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { MovieWindowAnchor } = require('./movie-window-anchor.cjs');
const { AnchoredMovieWindow } = require('./anchored-movie-window.cjs');
const { GrantedClipResolver } = require('./granted-clip-resolver.cjs');

const MAX_WIDEN = 2;
const WINDOW_ID = /^window_[A-Za-z0-9_-]{8,128}$/;

// Paths and movie identities stay in the main process; the renderer gets opaque handles and ids.
class ZoomEditSources {
  #hostForEvent;
  #locator;
  #windowCache;
  #placement;
  #anchor;
  #provenance;
  #fs;
  #randomId;
  #grantedClips;
  #windows = new Map();
  #locatedMovies = new Map();

  constructor({ folderAccess, hostForEvent, locator, windowCache, placement,
    provenance = new Mp4Provenance(), fileSystem = fs, randomId = () => randomBytes(18).toString('base64url') }) {
    this.#grantedClips = new GrantedClipResolver({ folderAccess, fileSystem });
    this.#hostForEvent = hostForEvent;
    this.#locator = locator;
    this.#windowCache = windowCache;
    this.#placement = placement;
    this.#anchor = new MovieWindowAnchor();
    this.#provenance = provenance;
    this.#fs = fileSystem;
    this.#randomId = randomId;
  }

  async openClip(event, request) {
    const clipPath = await this.#clipPath(event, request);
    return { sourceHandle: this.#hostForEvent(event).registerSource(clipPath) };
  }

  async openWindow(event, request) {
    const widen = request?.widen;
    if (!Number.isSafeInteger(widen) || widen < 0 || widen > MAX_WIDEN) throw new Error('Movie window request is invalid.');
    const clipPath = await this.#clipPath(event, request);
    const previous = widen > 0 ? this.#widenedRecord(event, request.previousWindowId, clipPath, widen) : null;
    const sourceInfo = this.#provenance.canBeTagged(clipPath) ? await this.#provenance.read(clipPath) : null;
    if (!sourceInfo) return { kind: 'no-source-info' };
    const moviePath = await this.#moviePath(event, sourceInfo.sourceMovie);
    if (!moviePath) return { kind: 'cancelled' };
    const host = this.#hostForEvent(event);
    const placement = await this.#placement.place({ host, moviePath, sourceInfo, widen });
    const { windowPath } = await this.#windowCache.window({ moviePath, sourceMovie: sourceInfo.sourceMovie, ...placement.window });
    const windowId = `window_${this.#randomId()}`;
    const sourceHandle = host.registerSource(windowPath);
    this.#windows.set(windowId, {
      senderId: event.sender.id, clipPath, moviePath, widen, sourceInfo, sourceHandle, placement,
      previousWindow: previous?.placement.window ?? null, anchor: null,
    });
    return { kind: 'ready', sourceHandle, windowId };
  }

  async anchorWindow(event, request) {
    const record = this.#windowRecord(event, request?.windowId);
    const anchor = await this.#anchor.find({ host: this.#hostForEvent(event), sessionId: request.sessionId, window: record });
    record.anchor = anchor;
    if (!anchor) return { kind: 'not-found' };
    return { kind: 'anchored', clipStartFrame: anchor.clipStartFrame, earliestFrame: anchor.earliestFrame, latestFrame: anchor.latestFrame };
  }

  anchoredWindow(event, windowId) {
    const { clipPath, moviePath, sourceInfo, sourceHandle, anchor } = this.#windowRecord(event, windowId);
    if (!anchor) throw new Error('Movie window is not anchored.');
    return new AnchoredMovieWindow({ clipPath, moviePath, sourceInfo, sourceHandle, anchor, host: this.#hostForEvent(event) });
  }

  forgetAppWindow(senderId) {
    for (const [windowId, record] of this.#windows) if (record.senderId === senderId) this.#windows.delete(windowId);
    this.#locatedMovies.delete(senderId);
  }

  async #clipPath(event, request) {
    return (await this.#grantedClips.resolve(event.sender, request)).path;
  }

  #widenedRecord(event, previousWindowId, clipPath, widen) {
    const previous = this.#windowRecord(event, previousWindowId);
    if (previous.clipPath !== clipPath || previous.widen !== widen - 1) throw new Error('Movie window request is invalid.');
    return previous;
  }

  async #moviePath(event, sourceMovie) {
    const movieKey = JSON.stringify(sourceMovie.fingerprint);
    const appWindowMovies = this.#locatedMovies.get(event.sender.id) ?? new Map();
    this.#locatedMovies.set(event.sender.id, appWindowMovies);
    const remembered = appWindowMovies.get(movieKey);
    if (remembered && await this.#isFile(remembered)) return remembered;
    const located = await this.#locator.locate(event, sourceMovie);
    if (located.kind !== 'located') return null;
    appWindowMovies.set(movieKey, located.moviePath);
    return located.moviePath;
  }

  async #isFile(filePath) {
    try { return (await this.#fs.stat(filePath)).isFile(); } catch { return false; }
  }

  #windowRecord(event, windowId) {
    const record = typeof windowId === 'string' && WINDOW_ID.test(windowId) ? this.#windows.get(windowId) : undefined;
    if (!record || record.senderId !== event.sender.id) throw new Error('Movie window is unknown.');
    return record;
  }
}

module.exports = { ZoomEditSources };
