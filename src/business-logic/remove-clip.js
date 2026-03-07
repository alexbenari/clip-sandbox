export function runRemoveSelectedClip({
  selectedThumb,
  clearSelection,
  updateCount,
  recomputeLayout,
  showStatus,
}) {
  if (!selectedThumb) return false;
  const toRemove = selectedThumb;
  clearSelection();
  URL.revokeObjectURL(toRemove.dataset.objectUrl);
  toRemove.remove();
  updateCount();
  recomputeLayout();
  showStatus('Clip removed from view.');
  return true;
}
