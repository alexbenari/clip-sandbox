// @ts-nocheck
export class FullscreenAdapter {
  constructor({ doc = document } = {}) {
    this.doc = doc;
  }

  async enterFullScreen(doc = this.doc) {
    const el = doc.documentElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return;
    }
    if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  async exitFullScreen(doc = this.doc) {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
      return;
    }
    if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  }

  isFullScreenActive(doc = this.doc) {
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  }
}
