function normalizedFilename(filename) {
  const trimmed = String(filename || '').trim();
  return trimmed || '';
}

export function createPipelineSourceId() {
  return { kind: 'pipeline' };
}

export function createCollectionSourceId(filename = '') {
  const normalized = normalizedFilename(filename);
  if (!normalized) return null;
  return {
    kind: 'collection',
    filename: normalized,
  };
}

export function normalizeSourceId(sourceId) {
  if (sourceId?.kind === 'pipeline') return createPipelineSourceId();
  if (sourceId?.kind === 'collection') return createCollectionSourceId(sourceId.filename);
  return null;
}

export function sourceIdsEqual(left, right) {
  const normalizedLeft = normalizeSourceId(left);
  const normalizedRight = normalizeSourceId(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.kind !== normalizedRight.kind) return false;
  return normalizedLeft.kind === 'pipeline'
    || normalizedLeft.filename === normalizedRight.filename;
}
