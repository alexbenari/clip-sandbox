import { ZoomOverlayControl } from '../src/ui/zoom-overlay-control.js';

const viewBtn = document.getElementById('viewBtn') as HTMLButtonElement;
const zoomOverlay = new ZoomOverlayControl({ mountEl: document.getElementById('zoomLayerRoot'), document });

zoomOverlay.on('closeRequested', () => zoomOverlay.close());

viewBtn.addEventListener('click', () => {
  zoomOverlay.open({ src: './hand-closes-curtain.mp4', name: 'hand-closes-curtain.mp4' });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && zoomOverlay.isOpen()) zoomOverlay.close();
});
