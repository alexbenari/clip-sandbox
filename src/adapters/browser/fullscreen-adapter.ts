type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

export class FullscreenAdapter {
  private readonly doc: FullscreenDocument;

  constructor({ doc = document }: { doc?: FullscreenDocument } = {}) {
    this.doc = doc;
  }

  async enterFullScreen(doc: FullscreenDocument = this.doc): Promise<void> {
    await this.enterElementFullScreen(doc.documentElement as FullscreenElement);
  }

  async enterElementFullScreen(element: FullscreenElement): Promise<void> {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
      return;
    }
    if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
      return;
    }
    throw new Error('Full screen is unavailable in this browser.');
  }

  async exitFullScreen(doc: FullscreenDocument = this.doc): Promise<void> {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
      return;
    }
    if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  }

  isFullScreenActive(doc: FullscreenDocument = this.doc): boolean {
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  }

  isElementFullScreen(element: Element, doc: FullscreenDocument = this.doc): boolean {
    return (doc.fullscreenElement || doc.webkitFullscreenElement) === element;
  }
}
