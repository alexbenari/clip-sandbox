type ApplicationEventControllerOptions = {
  document: Document;
  window: Window;
  onFullscreenChange: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onWindowBlur?: () => void;
  onPageHide: () => void;
};

export class ApplicationEventController {
  private readonly doc: Document;
  private readonly win: Window;
  private readonly onFullscreenChange: EventListener;
  private readonly onKeyDown: EventListener;
  private readonly onKeyUp: EventListener | null;
  private readonly onWindowBlur: EventListener | null;
  private readonly onPageHide: EventListener;

  constructor({
    document: doc,
    window: win,
    onFullscreenChange,
    onKeyDown,
    onKeyUp,
    onWindowBlur,
    onPageHide,
  }: ApplicationEventControllerOptions) {
    this.doc = doc;
    this.win = win;
    this.onFullscreenChange = onFullscreenChange;
    this.onKeyDown = event => onKeyDown(event as KeyboardEvent);
    this.onKeyUp = onKeyUp ? event => onKeyUp(event as KeyboardEvent) : null;
    this.onWindowBlur = onWindowBlur ?? null;
    this.onPageHide = () => {
      onPageHide();
      this.destroy();
    };

    this.doc.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.doc.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
    this.doc.addEventListener('keydown', this.onKeyDown);
    if (this.onKeyUp) this.doc.addEventListener('keyup', this.onKeyUp);
    if (this.onWindowBlur) this.win.addEventListener('blur', this.onWindowBlur);
    this.win.addEventListener('pagehide', this.onPageHide, { once: true });
  }

  destroy(): void {
    this.doc.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.doc.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    this.doc.removeEventListener('keydown', this.onKeyDown);
    if (this.onKeyUp) this.doc.removeEventListener('keyup', this.onKeyUp);
    if (this.onWindowBlur) this.win.removeEventListener('blur', this.onWindowBlur);
    this.win.removeEventListener('pagehide', this.onPageHide);
  }
}
