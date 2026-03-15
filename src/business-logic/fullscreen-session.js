export function createFullscreenSession({
  fullscreenState,
  grid,
  body,
  fsBtn,
  isTitlesHidden,
  setTitlesHidden,
  enterFullScreenAdapter,
  exitFullScreenAdapter,
  isFullscreen,
  fsApplySlots,
  fsRestore,
  computeGrid,
  showStatus,
  normalizeFsSlots,
  fullscreenSlotsText,
  every,
  clearClock,
  updateCardLabel,
  formatLabel,
}) {
  async function enterFullScreen() {
    try {
      fullscreenState.savedTitlesHidden = isTitlesHidden();
      setTitlesHidden(true);
      await enterFullScreenAdapter(document);
      fsBtn.textContent = 'Exit Full Screen';
      fsApplySlots();
    } catch (e) {
      console.warn(e);
    }
  }

  async function exitFullScreen() {
    try {
      await exitFullScreenAdapter(document);
    } catch (e) {
      console.warn(e);
    }
  }

  function onFsToggle() {
    if (!isFullscreen()) void enterFullScreen();
    else void exitFullScreen();
  }

  function onGlobalKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (key === 'f' || key === 'F') {
      onFsToggle();
      e.preventDefault();
      return;
    }
    if (!isFullscreen()) return;
    if (key >= '0' && key <= '9') {
      fullscreenState.digitBuffer += key;
      clearTimeout(fullscreenState.digitTimer);
      fullscreenState.digitTimer = setTimeout(() => {
        const v = parseInt(fullscreenState.digitBuffer, 10);
        fullscreenState.digitBuffer = '';
        if (!Number.isNaN(v)) {
          fullscreenState.slots = normalizeFsSlots(v);
          fsApplySlots();
          showStatus(fullscreenSlotsText(fullscreenState.slots), 1500);
        }
      }, 600);
      e.preventDefault();
    }
  }

  function startFsRandomizer() {
    if (fullscreenState.randInterval) return;
    fullscreenState.randInterval = every(3000, () => {
      if (isFullscreen()) randomizeOnce();
    });
  }

  function stopFsRandomizer() {
    if (fullscreenState.randInterval) {
      clearClock(fullscreenState.randInterval);
      fullscreenState.randInterval = null;
    }
    fullscreenState.randPending = false;
  }

  function currentVisibleCards() {
    return Array.from(grid.children).filter((el) => el.style.display !== 'none');
  }

  function currentHiddenCards() {
    return Array.from(grid.children).filter((el) => el.style.display === 'none');
  }

  function waitForEnd(vid) {
    return new Promise((res) => {
      const h = () => {
        vid.removeEventListener('ended', h);
        res();
      };
      vid.addEventListener('ended', h, { once: true });
    });
  }

  function swapCardContents(a, b) {
    const va = a.querySelector('video');
    const vb = b.querySelector('video');
    const na = a.dataset.name;
    const nb = b.dataset.name;
    const ua = a.dataset.objectUrl;
    const ub = b.dataset.objectUrl;
    const da = a.dataset.durationSeconds;
    const db = b.dataset.durationSeconds;
    a.dataset.name = nb;
    b.dataset.name = na;
    a.dataset.objectUrl = ub;
    b.dataset.objectUrl = ua;
    a.dataset.durationSeconds = db || '';
    b.dataset.durationSeconds = da || '';
    updateCardLabel(a, formatLabel);
    updateCardLabel(b, formatLabel);
    va.pause();
    vb.pause();
    va.src = ub;
    vb.src = ua;
    va.loop = true;
    vb.loop = true;
    va.muted = true;
    vb.muted = true;
    va.play().catch(() => {});
  }

  function randomizeOnce() {
    if (!isFullscreen() || fullscreenState.randPending) return;
    const vis = currentVisibleCards();
    const hid = currentHiddenCards();
    if (vis.length <= 1 || hid.length === 0) return;
    const targetCard = vis[Math.floor(Math.random() * vis.length)];
    const replCard = hid[Math.floor(Math.random() * hid.length)];
    const v = targetCard.querySelector('video');
    fullscreenState.randPending = true;
    v.loop = false;
    waitForEnd(v)
      .then(() => {
        swapCardContents(targetCard, replCard);
        replCard.style.display = 'none';
        targetCard.style.display = '';
        const v2 = targetCard.querySelector('video');
        v2.loop = true;
        v2.play().catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        fullscreenState.randPending = false;
      });
  }

  function onFsChange() {
    const active = isFullscreen();
    body.classList.toggle('fs-active', active);
    if (!active) {
      fsRestore();
      stopFsRandomizer();
      if (fullscreenState.savedTitlesHidden !== null) {
        setTitlesHidden(fullscreenState.savedTitlesHidden);
        fullscreenState.savedTitlesHidden = null;
      }
      fsBtn.textContent = 'Full Screen';
      computeGrid();
    } else {
      fsApplySlots();
      startFsRandomizer();
      fsBtn.textContent = 'Exit Full Screen';
    }
  }

  return {
    onGlobalKeyDown,
    onFsChange,
    onFsToggle,
    enterFullScreen,
    exitFullScreen,
  };
}

