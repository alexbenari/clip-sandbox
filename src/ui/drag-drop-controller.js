export function createThumbInteractionHandlers({
  state,
  grid,
  setSelectedThumb,
  recomputeLayout,
  removeDragOverClasses,
}) {
  function onSelect(el) {
    if (state.selectedThumb && state.selectedThumb !== el) state.selectedThumb.classList.remove('selected');
    setSelectedThumb(state, el);
    el.classList.toggle('selected');
    if (!el.classList.contains('selected')) setSelectedThumb(state, null);
  }

  function onDragStart(el, e) {
    state.dragSourceId = el.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.id);
  }

  function onDragEnd(el) {
    el.classList.remove('dragging');
    state.dragSourceId = null;
    removeDragOverClasses(grid);
  }

  function onDragOver(el, e) {
    e.preventDefault();
    if (!state.dragSourceId || el.id === state.dragSourceId) return;
    el.classList.add('drag-over');
  }

  function onDragLeave(el) {
    el.classList.remove('drag-over');
  }

  function onDrop(el, e) {
    e.preventDefault();
    el.classList.remove('drag-over');
    const srcId = e.dataTransfer.getData('text/plain') || state.dragSourceId;
    const srcEl = document.getElementById(srcId);
    if (!srcEl || srcEl === el) return;
    const rect = el.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    if (before) grid.insertBefore(srcEl, el);
    else grid.insertBefore(srcEl, el.nextSibling);
    recomputeLayout();
  }

  return { onSelect, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}
