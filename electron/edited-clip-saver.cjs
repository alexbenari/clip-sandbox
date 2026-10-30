const fs = require('node:fs/promises');
const path = require('node:path');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { ENCODED_OUTPUT } = require('./exact-range-encoder.cjs');
const { OperationResult } = require('./operation-result.cjs');
const { EditedClipKeptUnderTemporaryName } = require('./edited-clip-placement.cjs');
const { StagedEditRefusal } = require('./staged-edit-resolver.cjs');

const OUTCOMES = new Set(['keep-both', 'replace']);

class SaveRefusal extends Error {
  constructor(message, code = 'invalid-request') {
    super(message);
    this.code = code;
  }
}

class EditedClipSaver {
  #stagedEdits;
  #encoder;
  #placement;
  #provenance;
  #fs;
  #operations = new Map();

  constructor({ stagedEdits, encoder, placement, provenance = new Mp4Provenance(), fileSystem = fs }) {
    if (!stagedEdits || !encoder || !placement) throw new Error('Edited clip saver dependencies are invalid.');
    this.#stagedEdits = stagedEdits;
    this.#encoder = encoder;
    this.#placement = placement;
    this.#provenance = provenance;
    this.#fs = fileSystem;
  }

  save(event, request = {}, report = () => undefined) {
    const { operationId } = request;
    if (typeof operationId !== 'string' || this.#operations.has(operationId)) {
      return Promise.resolve(OperationResult.failure('invalid-operation', 'The save operation is invalid.'));
    }
    const controller = new AbortController();
    const operation = this.#save(event, request, { signal: controller.signal, report })
      .finally(() => this.#operations.delete(operationId));
    this.#operations.set(operationId, { ownerId: event.sender.id, controller, operation });
    return operation;
  }

  async cancel(ownerId, operationId) {
    const operation = this.#operations.get(operationId);
    if (!operation || operation.ownerId !== ownerId) return OperationResult.failure('invalid-operation', 'The save operation is unavailable.');
    operation.controller.abort();
    return { ok: true, result: null };
  }

  async dispose() {
    const operations = [...this.#operations.values()];
    for (const { controller } of operations) controller.abort();
    await Promise.allSettled(operations.map(({ operation }) => operation));
  }

  async #save(event, request, operation) {
    const { signal } = operation;
    try {
      if (!OUTCOMES.has(request.outcome)) throw new SaveRefusal('The save request is invalid.');
      const staged = await this.#stagedEdits.resolve(event, request);
      operation.report({ stage: 'checking-source' });
      const sourceInfo = (await staged.cut.sourceInfo())?.limitedTo(staged.composition.sourceInfo) ?? null;
      return await this.#encodeAndPlace({ ...staged, outcome: request.outcome, sourceInfo }, operation);
    } catch (error) {
      if (error instanceof SaveRefusal || error instanceof StagedEditRefusal
        || error instanceof EditedClipKeptUnderTemporaryName) return OperationResult.failure(error.code, error.message);
      if (signal.aborted) return OperationResult.failure('cancelled', 'Saving was cancelled.');
      console.warn('[zoom-edit-save] save-failed', { kind: error instanceof Error ? error.name : 'unknown', code: error?.code });
      return OperationResult.failure('save-failed', 'The edited clip could not be saved.');
    }
  }

  #encodedOutput(composition) {
    if (composition.playsBackward) return ENCODED_OUTPUT.forwardThenBackward;
    return composition.keepsAudio ? ENCODED_OUTPUT.cutWithSound : ENCODED_OUTPUT.silentCut;
  }

  async #encodeAndPlace({ host, clip, cut, composition, outcome, sourceInfo }, { signal, report }) {
    let preparedSource;
    try {
      preparedSource = await host.prepareExtractionSource(cut.sourceHandle, signal);
    } catch {
      if (signal.aborted) return OperationResult.failure('cancelled', 'Saving was cancelled.');
      throw new SaveRefusal('The source of the edited clip is unavailable.', 'invalid-source');
    }
    // The record comes from the clip's own tag or from the anchored window, never from the renderer.
    const tagValue = sourceInfo ? this.#provenance.tagValueOf(sourceInfo) : null;
    const workspace = await this.#fs.mkdtemp(path.join(clip.folder, '.zoom-edit-save-'));
    try {
      const encoded = await this.#encoder.encode({
        host,
        source: preparedSource,
        range: { reviewSessionId: cut.sessionId, sourceHandle: cut.sourceHandle, startFrameIndex: cut.startFrame, endFrameIndex: cut.endFrame },
        tagValue,
        workspace,
        signal,
        report,
        output: this.#encodedOutput(composition),
      });
      if (signal.aborted) return OperationResult.failure('cancelled', 'Saving was cancelled.');
      if (!encoded.ok) return OperationResult.failure(encoded.code, 'The edited clip could not be encoded.');
      report({ stage: 'saving-media' });
      const placed = outcome === 'replace'
        ? await this.#placement.replace(clip, encoded.mediaPath, composition.filenameSuffix)
        : await this.#placement.keepBoth(clip, encoded.mediaPath, composition.filenameSuffix);
      return { ok: true, result: encoded.warning ? { ...placed, warning: encoded.warning } : placed };
    } finally {
      await this.#fs.rm(workspace, { recursive: true, force: true }).catch(error => {
        console.warn('[zoom-edit-save] workspace-cleanup-failed', { code: error?.code });
      });
    }
  }
}

module.exports = { EditedClipSaver };
