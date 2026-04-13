import { serializeCollectionRefToOptionValue } from './collection-option-value.js';

export function createCollectionOption({ label = '', collectionRef = null } = {}) {
  if (!collectionRef) return null;
  return {
    label,
    value: serializeCollectionRefToOptionValue(collectionRef),
    collectionRef,
  };
}

export function createCollectionOptionForCollection(collection, inventory) {
  if (!inventory || !collection) return null;
  return createCollectionOption({
    label: collection.collectionName,
    collectionRef: inventory.collectionRefFor(collection),
  });
}
