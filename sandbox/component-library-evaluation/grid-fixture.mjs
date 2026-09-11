import { Clip } from '../../src/domain/clip.ts';
import { ClipSequence } from '../../src/domain/clip-sequence.ts';
import { ClipCollectionGridController } from '../../src/ui/clip-collection-grid-controller.ts';
import { computeBestGrid } from '../../src/ui/display-layout-rules.ts';
import { DomRendererAdapter } from '../../src/adapters/browser/dom-renderer-adapter.ts';

if (new URLSearchParams(location.search).get('grid') === '1') {
  const tiles = document.querySelector('#tiles');
  const gridRoot = document.createElement('div');
  gridRoot.id = 'grid-root';
  const grid = document.createElement('div');
  grid.id = 'grid';
  gridRoot.append(grid);
  tiles.replaceWith(gridRoot);
  const renderer = new DomRendererAdapter();
  const controller = new ClipCollectionGridController({
    grid, gridRoot, toolbar: document.querySelector('.app-bar'), computeBestGrid,
    applyGridLayout: (columns, height) => renderer.applyGridLayout(grid, columns, height),
  });
  const mediaSource = new URL('../../tests/e2e/fixtures/video-edit/clips/source.mp4', location.href).href;
  const clips = Array.from({ length: 8 }, (_, index) => new Clip({
    id: `pilot-${index}`, file: new File([], `Sample ${index + 1}.mp4`), mediaSource,
  }));
  controller.renderCollection(new ClipSequence({ name: 'Panel grid fixture', clips }));
  const resize = new ResizeObserver(() => controller.recomputeLayout());
  resize.observe(gridRoot);
  window.addEventListener('pagehide', () => { resize.disconnect(); controller.destroy(); }, { once: true });
}
