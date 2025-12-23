// Core logic helpers extracted for reuse in tests and UI

export const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);

export function isVideoFile(file) {
  if (file?.type && file.type.startsWith('video/')) return true;
  const name = file?.name || '';
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXTS.has(ext);
}

export function niceNum(n) {
  return new Intl.NumberFormat().format(n);
}

export function formatDuration(seconds) {
  const total = Math.round(Math.max(0, Number(seconds)));
  if (!Number.isFinite(total)) return '--:--:--';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function filterAndSortFiles(files) {
  return Array.from(files || [])
    .filter(isVideoFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

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

export function validateOrderStrict(lines, currentNames) {
  const order = (lines || []).map((s) => s.trim()).filter(Boolean);
  const current = Array.from(currentNames || []);
  const issues = [];

  const counts = new Map();
  for (const n of order) counts.set(n, (counts.get(n) || 0) + 1);
  const dups = Array.from(counts.entries())
    .filter(([, c]) => c > 1)
    .map(([n, c]) => `${n} (x${c})`);
  if (dups.length) issues.push(`Duplicate entries in order file:\n- ${dups.join('\n- ')}`);

  const setOrder = new Set(order);
  const setCurrent = new Set(current);
  const missing = current.filter((n) => !setOrder.has(n));
  const extras = order.filter((n) => !setCurrent.has(n));
  if (missing.length) issues.push(`Missing filenames (present in grid but not in file):\n- ${missing.join('\n- ')}`);
  if (extras.length) issues.push(`Unknown filenames (present in file but not loaded):\n- ${extras.join('\n- ')}`);
  if (setOrder.size !== setCurrent.size)
    issues.push(`Count mismatch: grid has ${setCurrent.size} unique clips, file lists ${setOrder.size}.`);

  return { issues, order };
}

export function computeFsLayout({ slots, availW, availH, gap }) {
  const N = Math.max(2, slots);
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
