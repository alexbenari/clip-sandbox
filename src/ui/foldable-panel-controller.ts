type FoldablePanelControllerOptions = {
  root: HTMLElement;
  content: HTMLElement;
  foldButton: HTMLButtonElement;
  revealButton: HTMLButtonElement;
  onChange: (durationMs: number) => void;
  onSettled: () => void;
};

type PanelAnimation = Animation & {
  transitionProperty?: string;
  effect?: KeyframeEffect | null;
};

export class FoldablePanelController {
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private readonly foldButton: HTMLButtonElement;
  private readonly revealButton: HTMLButtonElement;
  private readonly onChange: (durationMs: number) => void;
  private readonly onSettled: () => void;
  private readonly mediaQuery: MediaQueryList | null;
  private foldedState = false;
  private movingState = false;
  private generation = 0;
  private destroyed = false;

  private readonly onFoldClick = (): void => { this.setFolded(true); };
  private readonly onRevealClick = (): void => { this.setFolded(false); };
  private readonly onReducedMotionChange = (): void => {
    if (this.mediaQuery?.matches) {
      this.root.style.setProperty('--panel-duration', '0ms');
      this.settle(this.generation);
    }
  };

  constructor(options: FoldablePanelControllerOptions) {
    this.root = options.root;
    this.content = options.content;
    this.foldButton = options.foldButton;
    this.revealButton = options.revealButton;
    this.onChange = options.onChange;
    this.onSettled = options.onSettled;
    this.mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    this.foldButton.addEventListener('click', this.onFoldClick);
    this.revealButton.addEventListener('click', this.onRevealClick);
    this.mediaQuery?.addEventListener('change', this.onReducedMotionChange);
    this.applyPresentation(false);
  }

  get folded(): boolean { return this.foldedState; }

  get targetWidth(): number {
    const style = getComputedStyle(this.root);
    return parseFloat(style.getPropertyValue(this.foldedState ? '--panel-folded-width' : '--panel-open-width'));
  }

  get moving(): boolean { return this.movingState; }

  setFolded(folded: boolean): void {
    if (this.destroyed || folded === this.foldedState) return;

    const activeInsidePanel = this.root.contains(this.root.ownerDocument.activeElement);
    this.foldedState = folded;
    this.movingState = true;
    const durationMs = this.mediaQuery?.matches ? 0 : folded ? 240 : 280;
    this.root.style.setProperty('--panel-duration', `${durationMs}ms`);
    this.applyPresentation(activeInsidePanel);
    this.onChange(durationMs);
    const requestGeneration = ++this.generation;

    if (this.mediaQuery?.matches) {
      this.settle(requestGeneration);
      return;
    }

    this.root.getBoundingClientRect();
    const animations = this.ownWidthTransitions();
    if (animations.length === 0) {
      this.settle(requestGeneration);
      return;
    }
    Promise.all(animations.map(animation => animation.finished)).then(
      () => this.settle(requestGeneration),
      () => this.settle(requestGeneration),
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.foldButton.removeEventListener('click', this.onFoldClick);
    this.revealButton.removeEventListener('click', this.onRevealClick);
    this.mediaQuery?.removeEventListener('change', this.onReducedMotionChange);
  }

  private applyPresentation(transferFocus: boolean): void {
    this.root.classList.toggle('folded', this.foldedState);
    this.content.inert = this.foldedState;
    this.content.setAttribute('aria-hidden', String(this.foldedState));
    this.revealButton.hidden = !this.foldedState;
    this.foldButton.hidden = this.foldedState;
    this.foldButton.setAttribute('aria-expanded', String(!this.foldedState));
    this.revealButton.setAttribute('aria-expanded', String(!this.foldedState));
    this.foldButton.setAttribute('aria-controls', this.content.id);
    this.revealButton.setAttribute('aria-controls', this.content.id);
    if (transferFocus) (this.foldedState ? this.revealButton : this.foldButton).focus();
  }

  private ownWidthTransitions(): PanelAnimation[] {
    const getAnimations = this.root.getAnimations?.bind(this.root);
    if (!getAnimations) return [];
    return (getAnimations() as PanelAnimation[]).filter(animation =>
      animation.transitionProperty === 'width' && animation.effect?.target === this.root,
    );
  }

  private settle(requestGeneration: number): void {
    if (this.destroyed || requestGeneration !== this.generation || !this.movingState) return;
    this.movingState = false;
    this.onSettled();
  }
}
