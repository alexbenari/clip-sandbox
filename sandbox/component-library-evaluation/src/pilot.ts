import WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';

await customElements.whenDefined('wa-split-panel');

class PanelPilot {
  private readonly content: HTMLElement;
  private readonly fold: HTMLButtonElement;
  private readonly reveal: HTMLButtonElement;

  constructor(private readonly split: WaSplitPanel, panel: HTMLElement) {
    const content = panel.querySelector<HTMLElement>('.panel-content');
    const fold = panel.querySelector<HTMLButtonElement>('.fold');
    const reveal = panel.querySelector<HTMLButtonElement>('.reveal');
    if (!content || !fold || !reveal) throw new Error('Panel fixture is incomplete');
    this.content = content;
    this.fold = fold;
    this.reveal = reveal;
    fold.addEventListener('click', () => this.setFolded(true));
    reveal.addEventListener('click', () => this.setFolded(false));
  }

  private setFolded(folded: boolean): void {
    const transferFocus = this.content.contains(document.activeElement) || document.activeElement === this.reveal;
    this.split.classList.toggle('folded', folded);
    this.split.positionInPixels = folded ? 36 : 240;
    this.content.inert = folded;
    this.content.setAttribute('aria-hidden', String(folded));
    this.reveal.hidden = !folded;
    this.fold.setAttribute('aria-expanded', String(!folded));
    this.reveal.setAttribute('aria-expanded', String(!folded));
    if (transferFocus) (folded ? this.reveal : this.fold).focus();
  }
}

for (const split of document.querySelectorAll('wa-split-panel')) {
  const panel = split.querySelector<HTMLElement>(':scope > aside');
  if (!(split instanceof WaSplitPanel) || !panel) throw new Error('Split Panel did not initialize');
  new PanelPilot(split, panel);
}

document.documentElement.dataset.pilotReady = 'true';
