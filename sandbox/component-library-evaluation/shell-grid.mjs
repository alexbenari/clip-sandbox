import { AppText } from '../../src/app/app-text.ts';
import { Clip } from '../../src/domain/clip.ts';
import { ClipSource } from '../../src/domain/clip-source.ts';
import { ClipSequence } from '../../src/domain/clip-sequence.ts';
import { ClipCollectionGridControl } from '../../src/ui/clip-collection-grid-control.ts';
import { DisplayLayoutRules } from '../../src/ui/display-layout-rules.ts';

const root = document.createElement('div');
root.id = 'grid-root';
const grid = document.createElement('div');
grid.id = 'grid';
root.append(grid);
document.querySelector('#tiles').replaceWith(root);
const mediaSource = new URL('../../tests/e2e/fixtures/video-edit/clips/source.mp4', location.href).href;
const clips = Array.from({ length: 8 }, (_, index) => new Clip({
  id: `shell-${index}`, source: ClipSource.create({ name: `Sample ${index + 1}.mp4`, mediaSource }),
}));
const controller = new ClipCollectionGridControl({
  grid, gridRoot: root, appText: new AppText(), layoutRules: new DisplayLayoutRules(),
  coordinateWorkspaceLayout: true, observeRootResize: true,
});
controller.renderCollection(new ClipSequence({ name: 'Shell motion fixture', clips }));
let settleTimer;
const onPanel = event => {
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : event.detail.duration;
  const panelWidth = selector => document.querySelector(selector).classList.contains('folded') ? 36 : 240;
  const workspaceWidth = document.documentElement.clientWidth - panelWidth('#split') - panelWidth('#split-right');
  controller.beginWorkspaceResize(workspaceWidth, duration);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => controller.endWorkspaceResize(), duration + 40);
};
window.addEventListener('shell-panel-request', onPanel);
window.addEventListener('pagehide', () => { clearTimeout(settleTimer); controller.dispose(); window.removeEventListener('shell-panel-request', onPanel); }, { once: true });
