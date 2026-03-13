export function runApplyOrder({ names, grid, recomputeLayout, showStatus }) {
  const byName = new Map();
  Array.from(grid.children).forEach((el) => byName.set(el.dataset.name, el));
  const frag = document.createDocumentFragment();
  for (const name of names) {
    const el = byName.get(name);
    if (el) frag.appendChild(el);
  }
  grid.appendChild(frag);
  recomputeLayout();
  showStatus('Collection loaded.');
}
