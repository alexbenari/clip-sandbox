// @ts-nocheck
export class DomRendererAdapter {
  applyGridLayout(gridEl, cols, cellHeight) {
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const el of gridEl.children) el.style.height = `${cellHeight}px`;
  }
}
