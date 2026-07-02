export class DomRendererAdapter {
  applyGridLayout(gridEl: HTMLElement, cols: number, cellHeight: number): void {
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const el of Array.from(gridEl.children)) {
      if (el instanceof HTMLElement) el.style.height = `${cellHeight}px`;
    }
  }
}
