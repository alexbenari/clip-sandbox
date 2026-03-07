// Backward-compatible logic facade.
export {
  VIDEO_EXTS,
  PLACEHOLDER_DURATION,
  isVideoFile,
  filterAndSortFiles,
  formatDuration,
  formatLabel,
} from './src/domain/clip-rules.js';
export { validateOrderStrict } from './src/domain/order-rules.js';
export { computeBestGrid, computeFsLayout, normalizeFsSlots } from './src/domain/layout-rules.js';

export function niceNum(n) {
  return new Intl.NumberFormat().format(n);
}
