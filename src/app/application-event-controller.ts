type ApplicationEventControllerOptions = {
  document: Document;
  window: Window;
  onFullscreenChange: () => void;
  onResize: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onGlobalKeyDown: (event: KeyboardEvent) => void;
  onPageHide: () => void;
};

export class ApplicationEventController {
  private readonly doc: Document;
  private readonly win: Window;
  private readonly onFullscreenChange: EventListener;
  private readonly onResize: EventListener;
  private readonly onKeyDown: EventListener;
  private readonly onGlobalKeyDown: EventListener;
  private readonly onPageHide: EventListener;

  constructor({
    document: doc,
    window: win,
    onFullscreenChange,
    onResize,
    onKeyDown,
    onGlobalKeyDown,
    onPageHide,
  }: ApplicationEventControllerOptions) {
    this.doc = doc;
    this.win = win;
    this.onFullscreenChange = onFullscreenChange;
    this.onResize = onResize;
    this.onKeyDown = event => onKeyDown(event as KeyboardEvent);
    this.onGlobalKeyDown = event => onGlobalKeyDown(event as KeyboardEvent);
    this.onPageHide = () => {
      onPageHide();
      this.destroy();
    };

    this.doc.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.doc.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
    this.win.addEventListener('resize', this.onResize);
    this.doc.addEventListener('keydown', this.onKeyDown);
    this.doc.addEventListener('keydown', this.onGlobalKeyDown);
    this.win.addEventListener('pagehide', this.onPageHide, { once: true });
  }

  destroy(): void {
    this.doc.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.doc.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    this.win.removeEventListener('resize', this.onResize);
    this.doc.removeEventListener('keydown', this.onKeyDown);
    this.doc.removeEventListener('keydown', this.onGlobalKeyDown);
    this.win.removeEventListener('pagehide', this.onPageHide);
  }
}
