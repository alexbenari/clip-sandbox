const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { GrantedClipRefusal, GrantedClipResolver } = require('./granted-clip-resolver.cjs');

class StagedEditRefusal extends Error {
  constructor(message) {
    super(message);
    this.code = 'invalid-request';
  }
}

// A staged range cut from the clip itself, in the clip's own frame numbers.
class ClipCut {
  #reader;
  #clip;
  #provenance;

  constructor({ clip, sourceHandle, sessionId, reader, startFrame, endFrame, provenance }) {
    this.sourceHandle = sourceHandle;
    this.sessionId = sessionId;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.#reader = reader;
    this.#clip = clip;
    this.#provenance = provenance;
  }

  get changesRange() {
    return this.startFrame !== 0 || this.endFrame !== this.#reader.frameCount - 1;
  }

  endIdentities() {
    return Promise.all([this.#reader.frameIdentity(this.startFrame), this.#reader.frameIdentity(this.endFrame)]);
  }

  // The clip's own record, shifted by the trimmed frames; an untagged clip stays untagged.
  async sourceInfo() {
    const own = this.#provenance.canBeTagged(this.#clip.path) ? await this.#provenance.read(this.#clip.path) : null;
    return own ? own.trimmed(this.startFrame, this.endFrame - (this.#reader.frameCount - 1)) : null;
  }
}

// A staged range cut from the clip's anchored movie window, in the window's frame numbers.
class WindowCut {
  #reader;
  #window;

  constructor({ window, sessionId, reader, startFrame, endFrame }) {
    this.sourceHandle = window.sourceHandle;
    this.sessionId = sessionId;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.#reader = reader;
    this.#window = window;
  }

  get changesRange() {
    return !this.#window.showsWholeClip(this.startFrame, this.endFrame);
  }

  endIdentities() {
    return Promise.all([this.#reader.frameIdentity(this.startFrame), this.#reader.frameIdentity(this.endFrame)]);
  }

  async sourceInfo() {
    const [start, end] = await this.endIdentities();
    return this.#window.movieRecordOf(start, end);
  }
}

// Checks a renderer's staged edits against what the main process knows: the folder grant, the clip's name,
// the review session showing the source, and the range limits. Paths never come from the renderer.
class StagedEditResolver {
  #hostForEvent;
  #sources;
  #grantedClips;
  #provenance;
  #composition;

  constructor({ folderAccess, hostForEvent, sources, editComposition, provenance = new Mp4Provenance(), fileSystem }) {
    if (!folderAccess || typeof hostForEvent !== 'function' || !sources || typeof editComposition?.of !== 'function') {
      throw new Error('Staged edit resolver dependencies are invalid.');
    }
    this.#hostForEvent = hostForEvent;
    this.#sources = sources;
    this.#grantedClips = new GrantedClipResolver({ folderAccess, fileSystem });
    this.#provenance = provenance;
    this.#composition = editComposition;
  }

  async resolve(event, request) {
    const range = this.#rangeOf(request);
    const clip = await this.#grantedClip(event, request);
    const host = this.#hostForEvent(event);
    const cut = range.shownSource.kind === 'clip' ? this.#clipCut(host, clip, range) : this.#windowCut(event, clip, range);
    const composition = this.#composition.of([...(cut.changesRange ? ['refine'] : []), ...(range.loopify ? ['loopify'] : [])]);
    return Object.freeze({ clip, host, cut, composition });
  }

  #rangeOf({ source, sessionId, startFrame, endFrame, loopify } = {}) {
    const isFrame = value => Number.isSafeInteger(value) && value >= 0;
    const validSource = source?.kind === 'clip' || (source?.kind === 'window' && typeof source.windowId === 'string');
    if (!validSource || typeof sessionId !== 'string' || !isFrame(startFrame) || !isFrame(endFrame)
      || endFrame < startFrame || typeof loopify !== 'boolean') {
      throw new StagedEditRefusal('The edit request is invalid.');
    }
    return { shownSource: source, sessionId, startFrame, endFrame, loopify };
  }

  async #grantedClip(event, request) {
    try {
      return await this.#grantedClips.resolve(event.sender, request);
    } catch (error) {
      if (error instanceof GrantedClipRefusal) throw new StagedEditRefusal(error.message);
      throw error;
    }
  }

  #clipCut(host, clip, { sessionId, startFrame, endFrame }) {
    const sourceHandle = host.registerSource(clip.path);
    const reader = this.#exactFrames(host, sessionId, sourceHandle);
    if (endFrame >= reader.frameCount) throw new StagedEditRefusal('The range is outside the clip.');
    return new ClipCut({ clip, sourceHandle, sessionId, reader, startFrame, endFrame, provenance: this.#provenance });
  }

  #windowCut(event, clip, { shownSource, sessionId, startFrame, endFrame }) {
    let window;
    try {
      window = this.#sources.anchoredWindow(event, shownSource.windowId);
    } catch {
      throw new StagedEditRefusal('The movie window is not anchored.');
    }
    if (window.clipPath !== clip.path) throw new StagedEditRefusal('The movie window belongs to another clip.');
    if (!window.isWithinExtensionLimit(startFrame, endFrame)) throw new StagedEditRefusal('The range reaches more than a minute beyond the clip.');
    const reader = this.#exactFrames(this.#hostForEvent(event), sessionId, window.sourceHandle);
    return new WindowCut({ window, sessionId, reader, startFrame, endFrame });
  }

  #exactFrames(host, sessionId, sourceHandle) {
    try {
      return host.exactFrameReader(sessionId, sourceHandle);
    } catch {
      throw new StagedEditRefusal('The review session does not show this source.');
    }
  }
}

module.exports = { StagedEditRefusal, StagedEditResolver };
