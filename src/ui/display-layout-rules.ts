// Layout rules for normal and fullscreen display.
const DEFAULT_ASPECT_RATIO = 16 / 9;

type LayoutClip = {
  videoWidth?: number | null;
  videoHeight?: number | null;
};

type GridLayout = {
  cols: number;
  rows: number;
  cellH: number;
};

function usableAspectRatio(clip: LayoutClip | null): number {
  const width = Number(clip?.videoWidth);
  const height = Number(clip?.videoHeight);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return width / height;
  }
  return DEFAULT_ASPECT_RATIO;
}

function renderedVideoArea({ cellW, cellH, aspectRatio }: { cellW: number; cellH: number; aspectRatio: number }): number {
  const renderedW = Math.min(cellW, cellH * aspectRatio);
  const renderedH = Math.min(cellH, cellW / aspectRatio);
  return renderedW * renderedH;
}

function normalizedLayoutClips({ count, clips }: { count: number; clips?: Iterable<LayoutClip | null> }): Array<LayoutClip | null> {
  const providedClips = Array.from(clips || []);
  if (providedClips.length >= count) return providedClips.slice(0, count);
  return providedClips.concat(Array.from({ length: count - providedClips.length }, () => null));
}

export function computeBestGrid({ count, availW, availH, gap, clips = [] }: {
  count: number;
  availW: number;
  availH: number;
  gap: number;
  clips?: Iterable<LayoutClip | null>;
}): GridLayout {
  if (count <= 0 || availW <= 0 || availH <= 0) {
    return { cols: 1, rows: Math.max(1, count), cellH: Math.max(80, availH || 0) };
  }
  const layoutClips = normalizedLayoutClips({ count, clips });
  let best = { cols: 1, rows: count, cellH: Math.max(80, (availH - gap * (count - 1)) / count), score: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (availW - gap * (cols - 1)) / cols;
    const cellH = (availH - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const score = layoutClips.reduce((sum, clip) => sum + renderedVideoArea({
      cellW,
      cellH,
      aspectRatio: usableAspectRatio(clip),
    }), 0);
    if (score > best.score) best = { cols, rows, cellH, score };
  }
  return { cols: best.cols, rows: best.rows, cellH: best.cellH };
}

export function normalizeFsSlots(slots: number): number {
  return Math.max(2, Number.isFinite(slots) ? slots : 2);
}

export function computeFsLayout({ slots, availW, availH, gap }: {
  slots: number;
  availW: number;
  availH: number;
  gap: number;
}): GridLayout & { targetVisible: number } {
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

