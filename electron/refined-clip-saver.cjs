const fs = require('node:fs/promises');
const path = require('node:path');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { GrantedClipRefusal, GrantedClipResolver } = require('./granted-clip-resolver.cjs');
const { RefinedClipKeptUnderTemporaryName } = require('./refined-clip-placement.cjs');

const OUTCOMES = new Set(['keep-both', 'replace']);

class SaveRefusal extends Error {
  constructor(message, code = 'invalid-request') {
    super(message);
    this.code = code;
  }
}

class RefinedClipSaver {
  #hostForEvent;
  #sources;
  #encoder;
  #placement;
  #grantedClips;
  #provenance;
  #fs;
  #operations = new Map();

  constructor({ folderAccess, hostForEvent, sources, encoder, placement, provenance = new Mp4Provenance(), fileSystem = fs }) {
    if (!folderAccess || typeof hostForEvent !== 'function' || !sources || !encoder || !placement) {
      throw new Error('Refined clip saver dependencies are invalid.');
    }
    this.#hostForEvent = hostForEvent;
    this.#sources = sources;
    this.#encoder = encoder;
    this.#placement = placement;
    this.#grantedClips = new GrantedClipResolver({ folderAccess, fileSystem });
    this.#provenance = provenance;
    this.#fs = fileSystem;
  }

  save(event, request = {}, report = () => undefined) {
    const { operationId } = request;
    if (typeof operationId !== 'string' || this.#operations.has(operationId)) {
      return Promise.resolve(this.#failure('invalid-operation', 'The save operation is invalid.'));
    }
    const controller = new AbortController();
    const operation = this.#save(event, request, { signal: controller.signal, report })
      .finally(() => this.#operations.delete(operationId));
    this.#operations.set(operationId, { ownerId: event.sender.id, controller, operation });
    return operation;
  }

  async cancel(ownerId, operationId) {
    const operation = this.#operations.get(operationId);
    if (!operation || operation.ownerId !== ownerId) return this.#failure('invalid-operation', 'The save operation is unavailable.');
    operation.controller.abort();
    return { ok: true, result: null };
  }

  async dispose() {
    const operations = [...this.#operations.values()];
    for (const { controller } of operations) controller.abort();
    await Promise.allSettled(operations.map(({ operation }) => operation));
  }

  #failure(code, message) {
    return { ok: false, code, error: { message } };
  }

  async #save(event, request, operation) {
    const { signal } = operation;
    try {
      const refinement = this.#refinementOf(request);
      const clip = await this.#grantedClip(event, request);
      const host = this.#hostForEvent(event);
      operation.report({ stage: 'checking-source' });
      const cut = refinement.shownSource.kind === 'clip'
        ? await this.#clipCut(host, clip, refinement)
        : await this.#windowCut(event, clip, refinement);
      return await this.#encodeAndPlace({ host, clip, refinement, cut }, operation);
    } catch (error) {
      if (error instanceof SaveRefusal || error instanceof RefinedClipKeptUnderTemporaryName) return this.#failure(error.code, error.message);
      if (signal.aborted) return this.#failure('cancelled', 'Saving was cancelled.');
      console.warn('[zoom-edit-save] save-failed', { kind: error instanceof Error ? error.name : 'unknown', code: error?.code });
      return this.#failure('save-failed', 'The refined clip could not be saved.');
    }
  }

  #refinementOf({ source, sessionId, startFrame, endFrame, outcome }) {
    const isFrame = value => Number.isSafeInteger(value) && value >= 0;
    const validSource = source?.kind === 'clip' || (source?.kind === 'window' && typeof source.windowId === 'string');
    if (!validSource || typeof sessionId !== 'string' || !isFrame(startFrame) || !isFrame(endFrame)
      || endFrame < startFrame || !OUTCOMES.has(outcome)) {
      throw new SaveRefusal('The save request is invalid.');
    }
    return { shownSource: source, sessionId, startFrame, endFrame, outcome };
  }

  async #grantedClip(event, request) {
    try {
      return await this.#grantedClips.resolve(event.sender, request);
    } catch (error) {
      if (error instanceof GrantedClipRefusal) throw new SaveRefusal(error.message);
      throw error;
    }
  }

  async #clipCut(host, clip, { sessionId, startFrame, endFrame }) {
    const sourceHandle = host.registerSource(clip.path);
    const { frameCount } = this.#exactFrames(host, sessionId, sourceHandle);
    if (endFrame >= frameCount) throw new SaveRefusal('The range is outside the clip.');
    const sourceInfo = this.#provenance.canBeTagged(clip.path) ? await this.#provenance.read(clip.path) : null;
    const endOffset = endFrame - (frameCount - 1);
    return { sourceHandle, sourceInfo: sourceInfo ? sourceInfo.trimmed(startFrame, endOffset) : null };
  }

  async #windowCut(event, clip, { shownSource, sessionId, startFrame, endFrame }) {
    let window;
    try {
      window = this.#sources.anchoredWindow(event, shownSource.windowId);
    } catch {
      throw new SaveRefusal('The movie window is not anchored.');
    }
    if (window.clipPath !== clip.path) throw new SaveRefusal('The movie window belongs to another clip.');
    if (!window.isWithinExtensionLimit(startFrame, endFrame)) throw new SaveRefusal('The range reaches more than a minute beyond the clip.');
    const reader = this.#exactFrames(this.#hostForEvent(event), sessionId, window.sourceHandle);
    const [start, end] = await Promise.all([reader.frameIdentity(startFrame), reader.frameIdentity(endFrame)]);
    return { sourceHandle: window.sourceHandle, sourceInfo: await window.movieRecordOf(start, end) };
  }

  #exactFrames(host, sessionId, sourceHandle) {
    try {
      return host.exactFrameReader(sessionId, sourceHandle);
    } catch {
      throw new SaveRefusal('The review session does not show this source.');
    }
  }

  async #encodeAndPlace({ host, clip, refinement, cut }, { signal, report }) {
    let preparedSource;
    try {
      preparedSource = await host.prepareExtractionSource(cut.sourceHandle, signal);
    } catch {
      if (signal.aborted) return this.#failure('cancelled', 'Saving was cancelled.');
      throw new SaveRefusal('The source of the refined clip is unavailable.', 'invalid-source');
    }
    // The record comes from the clip's own tag or from the anchored window, never from the renderer.
    const tagValue = cut.sourceInfo ? this.#provenance.tagValueOf(cut.sourceInfo) : null;
    const workspace = await this.#fs.mkdtemp(path.join(clip.folder, '.zoom-edit-save-'));
    try {
      const encoded = await this.#encoder.encode({
        host,
        source: preparedSource,
        range: { reviewSessionId: refinement.sessionId, sourceHandle: cut.sourceHandle, startFrameIndex: refinement.startFrame, endFrameIndex: refinement.endFrame },
        tagValue,
        workspace,
        signal,
        report,
      });
      if (signal.aborted) return this.#failure('cancelled', 'Saving was cancelled.');
      if (!encoded.ok) return this.#failure(encoded.code, 'The refined clip could not be encoded.');
      report({ stage: 'saving-media' });
      const placed = refinement.outcome === 'replace'
        ? await this.#placement.replace(clip, encoded.mediaPath)
        : await this.#placement.keepBoth(clip, encoded.mediaPath);
      return { ok: true, result: encoded.warning ? { ...placed, warning: encoded.warning } : placed };
    } finally {
      await this.#fs.rm(workspace, { recursive: true, force: true }).catch(error => {
        console.warn('[zoom-edit-save] workspace-cleanup-failed', { code: error?.code });
      });
    }
  }
}

module.exports = { RefinedClipSaver };
