const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, listener) {
  if (typeof listener !== 'function') throw new Error('Event listener must be a function.');
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('frameIdentityControl', Object.freeze({
  chooseSource(previewBounds) {
    return ipcRenderer.invoke('frame-control:choose-source', { previewBounds });
  },
  primePreview() { return ipcRenderer.invoke('frame-control:prime-preview'); },
  play() { return ipcRenderer.invoke('frame-control:play'); },
  pause() { return ipcRenderer.invoke('frame-control:pause'); },
  pauseExact() { return ipcRenderer.invoke('frame-control:pause-exact'); },
  captureCurrentFrame() { return ipcRenderer.invoke('frame-control:capture-current'); },
  setRate(rate) { return ipcRenderer.invoke('frame-control:rate', { rate }); },
  scrub(ratio) { return ipcRenderer.invoke('frame-control:scrub', { ratio }); },
  step(direction, count) { return ipcRenderer.invoke('frame-control:step', { direction, count }); },
  status() { return ipcRenderer.invoke('frame-control:status'); },
  close() { return ipcRenderer.invoke('frame-control:close'); },
  acknowledgePlaybackFrame(sourceGeneration, frameGeneration) {
    ipcRenderer.send('frame-control:playback-ack', { sourceGeneration, frameGeneration });
  },
  onPlaybackFrame(listener) { return listen('frame-control:playback-frame', listener); },
  onPreparation(listener) { return listen('frame-control:preparation', listener); },
}));
