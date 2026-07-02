type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

export class FullscreenAdapter {
  doc: FullscreenDocument;

  constructor({ doc = document }: { doc?: FullscreenDocument } = {}) {
    this.doc = doc;
  }

  async enterFullScreen(doc: FullscreenDocument = this.doc): Promise<void> {
    const el = doc.documentElement as FullscreenElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return;
    }
    if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
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
}
