import { AppText } from '../../src/app/app-text.ts';
import { Clip } from '../../src/domain/clip.ts';
import { ClipSource } from '../../src/domain/clip-source.ts';
import { ClipSequence } from '../../src/domain/clip-sequence.ts';
import { ClipCollectionGridControl } from '../../src/ui/clip-collection-grid-control.ts';
import { DisplayLayoutRules } from '../../src/ui/display-layout-rules.ts';

if (new URLSearchParams(location.search).get('grid') === '1') {
  const tiles = document.querySelector('#tiles');
  const gridRoot = document.createElement('div');
  gridRoot.id = 'grid-root';
  const grid = document.createElement('div');
  grid.id = 'grid';
  gridRoot.append(grid);
  tiles.replaceWith(gridRoot);
  const controller = new ClipCollectionGridControl({
    grid, gridRoot, appText: new AppText(), layoutRules: new DisplayLayoutRules(), observeRootResize: true,
    getAvailableHeight: () => {
      const { paddingTop, paddingBottom } = getComputedStyle(gridRoot);
      return gridRoot.clientHeight - parseFloat(paddingTop) - parseFloat(paddingBottom);
    },
  });
  const mediaSource = new URL('../../tests/e2e/fixtures/video-edit/clips/source.mp4', location.href).href;
  const clips = Array.from({ length: 8 }, (_, index) => new Clip({
    id: `pilot-${index}`, source: ClipSource.create({ name: `Sample ${index + 1}.mp4`, mediaSource }),
  }));
  controller.renderCollection(new ClipSequence({ name: 'Panel grid fixture', clips }));
  window.addEventListener('pagehide', () => controller.dispose(), { once: true });
}
