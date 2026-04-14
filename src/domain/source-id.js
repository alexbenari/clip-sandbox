/**
 * @typedef {{ kind: 'pipeline' }} PipelineSourceId
 * @typedef {{ kind: 'collection', filename: string }} CollectionSourceId
 * @typedef {PipelineSourceId | CollectionSourceId} SourceId
 */

/**
 * @param {SourceId | null | undefined} sourceId
 * @returns {SourceId | null}
 */
export function normalizeSourceId(sourceId) {
  if (!sourceId) return null;
  if (sourceId.kind === 'pipeline') {
    return { kind: 'pipeline' };
  }
  if (sourceId.kind === 'collection') {
    const filename = String(sourceId.filename || '').trim();
    if (!filename) return null;
    return {
      kind: 'collection',
      filename,
    };
  }
  return null;
}

/**
 * @param {SourceId | null | undefined} left
 * @param {SourceId | null | undefined} right
 * @returns {boolean}
 */
export function sourceIdsEqual(left, right) {
  const normalizedLeft = normalizeSourceId(left);
  const normalizedRight = normalizeSourceId(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.kind === 'pipeline' && normalizedRight.kind === 'pipeline') return true;
  if (normalizedLeft.kind === 'collection' && normalizedRight.kind === 'collection') {
    return normalizedLeft.filename === normalizedRight.filename;
  }
  return false;
}
