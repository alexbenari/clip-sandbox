// Pure layout rules for normal and fullscreen display.
export function computeBestGrid({ count, availW, availH, gap }) {
  if (count <= 0 || availW <= 0 || availH <= 0) {
    return { cols: 1, rows: Math.max(1, count), cellH: Math.max(80, availH || 0) };
  }
  let best = { cols: 1, rows: count, cellH: Math.max(80, (availH - gap * (count - 1)) / count), area: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (availW - gap * (cols - 1)) / cols;
    const cellH = (availH - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const area = cellW * cellH;
    if (area > best.area) best = { cols, rows, cellH, area };
  }
  return { cols: best.cols, rows: best.rows, cellH: best.cellH };
}

export function normalizeFsSlots(slots) {
  return Math.max(2, Number.isFinite(slots) ? slots : 2);
}

export function computeFsLayout({ slots, availW, availH, gap }) {
  const N = normalizeFsSlots(slots);
  let best = { rows: 1, cols: N, cellH: 120, area: 0 };
  for (let rows = 1; rows <= N; rows++) {
    const cols = Math.ceil(N / rows);
    const cellW = (availW - gap * (cols - 1)) / cols;
    const cellH = (availH - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const area = cellW * cellH;
    if (area > best.area) best = { rows, cols, cellH, area };
  }
  const targetVisible = Math.max(1, best.rows * best.cols - 1);
  return { rows: best.rows, cols: best.cols, cellH: best.cellH, targetVisible };
}
