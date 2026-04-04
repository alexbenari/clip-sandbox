function normalizedFilename(filename) {
  const trimmed = String(filename || '').trim();
  return trimmed || '';
}

export function createDefaultCollectionRef() {
  return { kind: 'default' };
}

export function createSavedCollectionRef(filename = '') {
  const normalized = normalizedFilename(filename);
  if (!normalized) return null;
  return {
    kind: 'saved',
    filename: normalized,
  };
}

export function normalizeCollectionRef(collectionRef) {
  if (collectionRef?.kind === 'default') return createDefaultCollectionRef();
  if (collectionRef?.kind === 'saved') return createSavedCollectionRef(collectionRef.filename);
  return null;
}

export function collectionRefsEqual(left, right) {
  const normalizedLeft = normalizeCollectionRef(left);
  const normalizedRight = normalizeCollectionRef(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.kind !== normalizedRight.kind) return false;
  return normalizedLeft.kind === 'default'
    || normalizedLeft.filename === normalizedRight.filename;
}
