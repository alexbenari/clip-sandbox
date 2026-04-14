/**
 * @typedef {object} MaterializeClipSequenceOptions
 * @property {ReadonlyArray<import('./clip.js').ClipFile> | Map<string, import('./clip.js').ClipFile>=} [availableVideoFiles]
 * @property {(() => string)=} [nextClipId]
 */

/**
 * @typedef {object} LoadedClipSequenceResult
 * @property {'loaded'} kind
 * @property {import('./clip-sequence.js').ClipSequence} sequence
 * @property {import('./clip-sequence.js').ClipSequence=} [collection]
 */

/**
 * @typedef {object} MissingClipSequenceResult
 * @property {'has-missing'} kind
 * @property {string} collectionName
 * @property {string[]} requestedNames
 * @property {string[]} existingNamesInOrder
 * @property {string[]} missingNames
 * @property {number} missingCount
 * @property {'exact-match' | 'subset-match'} matchKind
 * @property {import('./clip-sequence.js').ClipSequence} partialSequence
 * @property {import('./clip-sequence.js').ClipSequence=} [partialCollection]
 */

/**
 * @typedef {LoadedClipSequenceResult | MissingClipSequenceResult} MaterializedClipSequenceResult
 */

/** @interface */
export class IClipSequenceSource {
  /** @returns {import('./source-id.js').SourceId} */
  sourceId() {
    throw new Error('Interface only.');
  }

  /** @returns {string} */
  displayLabel() {
    throw new Error('Interface only.');
  }

  /** @returns {string[]} */
  baselineClipNames() {
    throw new Error('Interface only.');
  }

  /**
   * @param {MaterializeClipSequenceOptions} options
   * @returns {MaterializedClipSequenceResult}
   */
  materializeClipSequence(options) {
    throw new Error('Interface only.');
  }
}

/** @interface */
export class IExistingSaveSource {
  /** @returns {string} */
  existingSaveFilename() {
    throw new Error('Interface only.');
  }
}

/** @interface */
export class ICollectionConvertibleSource {
  /**
   * @param {{ filename?: string | null, collectionName?: string }} [options]
   * @returns {import('./collection.js').Collection}
   */
  toCollection(options) {
    throw new Error('Interface only.');
  }
}

/** @interface */
export class INonPhysicalDeleteSource {
  /**
   * @param {Iterable<string>} clipNames
   * @returns {{ collection: import('./collection.js').Collection, removedClipNames: string[], removedCount: number, isNoOp: boolean }}
   */
  withoutClipNames(clipNames) {
    throw new Error('Interface only.');
  }
}

/**
 * @param {unknown} source
 * @returns {source is IClipSequenceSource}
 */
function isClipSequenceSource(source) {
  if (!source || typeof source !== 'object') return false;
  const candidate = /** @type {{
   *   sourceId?: unknown,
   *   displayLabel?: unknown,
   *   baselineClipNames?: unknown,
   *   materializeClipSequence?: unknown
   * }} */ (source);
  return typeof candidate.sourceId === 'function'
    && typeof candidate.displayLabel === 'function'
    && typeof candidate.baselineClipNames === 'function'
    && typeof candidate.materializeClipSequence === 'function';
}

/**
 * @param {unknown} source
 * @returns {import('./source-id.js').SourceId}
 */
export function sourceIdOf(source) {
  if (!isClipSequenceSource(source)) {
    throw new Error('Clip sequence source is missing required method: sourceId');
  }
  return source.sourceId();
}

/**
 * @param {unknown} source
 * @returns {string}
 */
export function sourceLabelOf(source) {
  if (!isClipSequenceSource(source)) {
    throw new Error('Clip sequence source is missing required method: displayLabel');
  }
  return source.displayLabel();
}

/**
 * @param {unknown} source
 * @returns {string[]}
 */
export function sourceBaselineClipNames(source) {
  if (!source) return [];
  if (!isClipSequenceSource(source)) {
    throw new Error('Clip sequence source is missing required method: baselineClipNames');
  }
  return source.baselineClipNames();
}

/**
 * @param {unknown} source
 * @param {MaterializeClipSequenceOptions} [options={}]
 * @returns {MaterializedClipSequenceResult | null}
 */
export function materializeClipSequenceFromSource(source, options = {}) {
  if (!source) return null;
  if (!isClipSequenceSource(source)) {
    throw new Error('Clip sequence source is missing required method: materializeClipSequence');
  }
  return source.materializeClipSequence(options);
}

/**
 * @param {unknown} source
 * @returns {boolean}
 */
export function supportsSaveToExisting(source) {
  return !!(source && typeof /** @type {{ existingSaveFilename?: unknown }} */ (source).existingSaveFilename === 'function'
    && /** @type {IExistingSaveSource} */ (source).existingSaveFilename());
}

/**
 * @param {unknown} source
 * @returns {boolean}
 */
export function supportsSaveAsCollection(source) {
  return !!(source && typeof /** @type {{ toCollection?: unknown }} */ (source).toCollection === 'function');
}

/**
 * @param {unknown} source
 * @returns {boolean}
 */
export function supportsNonPhysicalDelete(source) {
  return !!(source && typeof /** @type {{ withoutClipNames?: unknown }} */ (source).withoutClipNames === 'function');
}
