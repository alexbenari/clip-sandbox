import { serializeCollectionRefToOptionValue } from './collection-ref-presentation.js';

export function renderActiveCollectionSelector({
  selectEl,
  inventory,
  label = '',
  defaultTitle = '',
} = {}) {
  if (!(selectEl instanceof HTMLSelectElement)) return;

  selectEl.innerHTML = '';
  if (!inventory) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = label || defaultTitle;
    selectEl.appendChild(option);
    selectEl.disabled = true;
    selectEl.value = '';
    selectEl.title = option.textContent;
    return;
  }

  for (const collection of inventory.selectableCollections()) {
    const option = document.createElement('option');
    option.value = serializeCollectionRefToOptionValue(inventory.collectionRefFor(collection));
    option.textContent = collection.collectionName;
    selectEl.appendChild(option);
  }

  selectEl.disabled = false;
  selectEl.value = serializeCollectionRefToOptionValue(inventory.activeCollectionRef());
  selectEl.title = label || defaultTitle;
}
