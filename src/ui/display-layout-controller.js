export function createLayoutController({
  grid,
  gridWrap,
  toolbar,
  fullscreenState,
  computeBestGrid,
  computeFsLayout,
  applyGridLayout,
  isFullscreen,
}) {
  function readGridMetrics(mode) {
    const gap = parseFloat(getComputedStyle(grid).gap) || 0;
    const availW = gridWrap.clientWidth;
    const chromeH = mode === 'fullscreen' ? 28 : Math.ceil(toolbar.getBoundingClientRect().height) + 28;
    const availH = window.innerHeight - chromeH;
    return { gap, availW, availH };
  }

  function computeGrid() {
    const n = grid.children.length;
    if (n === 0) {
      grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
      return;
    }
    const { gap, availW, availH } = readGridMetrics('normal');
    const { cols, cellH } = computeBestGrid({ count: n, availW, availH, gap });
    applyGridLayout(cols, cellH);
  }

  function fsComputeAndApplyGrid() {
    const { gap, availW, availH } = readGridMetrics('fullscreen');
    const best = computeFsLayout({ slots: fullscreenState.slots, availW, availH, gap });
    applyGridLayout(best.cols, best.cellH);
    return best;
  }

  function fsApplySlots() {
    if (fullscreenState.hiddenCards.length) {
      fullscreenState.hiddenCards.forEach((el) => (el.style.display = ''));
      fullscreenState.hiddenCards = [];
    }
    const best = fsComputeAndApplyGrid();
    const children = Array.from(grid.children);
    const total = children.length;
    if (total === 0) return;
    const targetVisible = Math.max(1, Math.min(total, best.targetVisible));
    let toHide = Math.max(0, total - targetVisible);
    for (let i = 0; i < total; i++) {
      const el = children[i];
      if (i === total - 1) {
        el.style.display = '';
        continue;
      }
      if (toHide > 0) {
        el.style.display = 'none';
        fullscreenState.hiddenCards.push(el);
        toHide--;
      } else {
        el.style.display = '';
      }
    }
  }

  function fsRestore() {
    if (fullscreenState.hiddenCards.length) {
      fullscreenState.hiddenCards.forEach((el) => (el.style.display = ''));
      fullscreenState.hiddenCards = [];
    }
  }

  function recomputeLayout() {
    if (isFullscreen()) fsApplySlots();
    else computeGrid();
  }

  return {
    recomputeLayout,
    computeGrid,
    fsApplySlots,
    fsRestore,
  };
}
