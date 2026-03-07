// Pure clip-related rules used by UI and business logic.
export const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);

export const PLACEHOLDER_DURATION = '--:--:--';

export function isVideoFile(file) {
  if (file?.type && file.type.startsWith('video/')) return true;
  const name = file?.name || '';
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXTS.has(ext);
}

export function formatDuration(seconds) {
  const total = Math.round(Math.max(0, Number(seconds)));
  if (!Number.isFinite(total)) return PLACEHOLDER_DURATION;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatLabel(name, durationSeconds) {
  const hasDuration = Number.isFinite(durationSeconds);
  const formatted = hasDuration ? formatDuration(durationSeconds) : PLACEHOLDER_DURATION;
  return `${name} (${formatted})`;
}

export function filterAndSortFiles(files) {
  return Array.from(files || [])
    .filter(isVideoFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}
