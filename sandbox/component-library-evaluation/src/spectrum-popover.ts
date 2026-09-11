import '@spectrum-web-components/overlay/sp-overlay.js';
import '@spectrum-web-components/popover/sp-popover.js';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/theme-dark.js';
import '@spectrum-web-components/theme/scale-medium.js';
import { Overlay } from '@spectrum-web-components/overlay';

await customElements.whenDefined('sp-overlay');
const overlay = document.querySelector('#keyboard-help');
const close = document.querySelector('#close-help');
const trigger = document.querySelector('#keyboard-trigger');
if (!(overlay instanceof Overlay) || !(close instanceof HTMLButtonElement) || !(trigger instanceof HTMLButtonElement)) {
  throw new Error('Missing Spectrum keyboard-help fixture');
}
overlay.addEventListener('beforetoggle', () => { trigger.setAttribute('aria-expanded', String(overlay.open)); });
close.addEventListener('click', () => { overlay.open = false; });
await overlay.updateComplete;
document.documentElement.dataset.pilotReady = 'true';
