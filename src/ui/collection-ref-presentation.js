import { createDefaultCollectionRef, createSavedCollectionRef, normalizeCollectionRef } from '../domain/collection-ref.js';

export const DEFAULT_COLLECTION_REF_OPTION_VALUE = '__default__';

export function serializeCollectionRefToOptionValue(collectionRef) {
  const normalized = normalizeCollectionRef(collectionRef);
  if (!normalized) return '';
  return normalized.kind === 'default'
    ? DEFAULT_COLLECTION_REF_OPTION_VALUE
    : normalized.filename;
}

export function parseCollectionRefFromOptionValue(optionValue = '') {
  const trimmed = String(optionValue || '').trim();
  if (!trimmed) return null;
  return trimmed === DEFAULT_COLLECTION_REF_OPTION_VALUE
    ? createDefaultCollectionRef()
    : createSavedCollectionRef(trimmed);
}

export function createAddToCollectionChoice(collection, inventory) {
  if (!inventory || !collection) return null;
  const collectionRef = inventory.collectionRefFor(collection);
  return {
    label: collection.collectionName,
    value: serializeCollectionRefToOptionValue(collectionRef),
    collectionRef,
  };
}
