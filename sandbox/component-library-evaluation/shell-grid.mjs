import { Clip } from '../../src/domain/clip.ts';
import { ClipSequence } from '../../src/domain/clip-sequence.ts';
import { ClipCollectionGridController } from '../../src/ui/clip-collection-grid-controller.ts';
import { computeBestGrid } from '../../src/ui/display-layout-rules.ts';

const root = document.createElement('div');
root.id = 'grid-root';
const grid = document.createElement('div');
grid.id = 'grid';
root.append(grid);
document.querySelector('#tiles').replaceWith(root);
const mediaSource = new URL('../../tests/e2e/fixtures/video-edit/clips/source.mp4', location.href).href;
const clips = Array.from({ length: 8 }, (_, index) => new Clip({ id: `shell-${index}`, file: new File([], `Sample ${index + 1}.mp4`), mediaSource }));
let movingUntil = 0;
let settleTimer;
function layout(width = root.clientWidth - 28, duration = 0) {
  if (!root.clientHeight || width <= 0) return;
  const height = root.clientHeight - 28;
  const { cols, cellH } = computeBestGrid({ count: clips.length, availW: width, availH: height, gap: 10, clips });
  grid.style.setProperty('--grid-duration', `${duration}ms`);
  grid.dataset.layoutCols = String(cols);
  const cellW = (width - (cols - 1) * 10) / cols;
  [...grid.children].forEach((card, index) => {
    Object.assign(card.style, { left: `${index % cols * (cellW + 10)}px`, top: `${Math.floor(index / cols) * (cellH + 10)}px`, width: `${cellW}px`, height: `${cellH}px` });
  });
}
const controller = new ClipCollectionGridController({ grid, gridRoot: root, toolbar: document.querySelector('.app-bar'), computeBestGrid, applyGridLayout: () => { if (performance.now() >= movingUntil) layout(); } });
controller.renderCollection(new ClipSequence({ name: 'Shell motion fixture', clips }));
const onPanel = event => {
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : event.detail.duration;
  const panelWidth = selector => document.querySelector(selector).classList.contains('folded') ? 36 : 240;
  const targetWidth = document.documentElement.clientWidth - panelWidth('#split') - panelWidth('#split-right') - 28;
  movingUntil = performance.now() + duration + 40;
  layout(targetWidth, duration);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { movingUntil = 0; layout(); }, duration + 40);
};
window.addEventListener('shell-panel-request', onPanel);
window.addEventListener('shell-screen-change', () => { if (performance.now() >= movingUntil) layout(); });
const resize = new ResizeObserver(() => { if (performance.now() >= movingUntil) layout(); });
resize.observe(root);
window.addEventListener('pagehide', () => { clearTimeout(settleTimer); resize.disconnect(); controller.destroy(); window.removeEventListener('shell-panel-request', onPanel); }, { once: true });
