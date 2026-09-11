import WaPopover from '@awesome.me/webawesome/dist/components/popover/popover.js';

await customElements.whenDefined('wa-popover');

class KeyboardHelpPilot {
  constructor(popover: WaPopover, trigger: HTMLButtonElement) {
    popover.addEventListener('wa-show', () => trigger.setAttribute('aria-expanded', 'true'));
    popover.addEventListener('wa-hide', () => trigger.setAttribute('aria-expanded', 'false'));
    popover.addEventListener('wa-after-hide', () => {
      if (!popover.open) trigger.focus({ preventScroll: true });
    });
  }
}

const popover = document.querySelector('wa-popover');
const trigger = document.querySelector<HTMLButtonElement>('#keyboard-trigger');
if (!(popover instanceof WaPopover) || !trigger) throw new Error('Keyboard help fixture is incomplete');
new KeyboardHelpPilot(popover, trigger);
document.documentElement.dataset.pilotReady = 'true';
