export async function enterFullScreen(doc = document) {
  const el = doc.documentElement;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

export async function exitFullScreen(doc = document) {
  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
}

export function isFullScreenActive(doc = document) {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}
