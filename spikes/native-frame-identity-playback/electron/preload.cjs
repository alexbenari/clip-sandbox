const { contextBridge, ipcRenderer } = require('electron');

const allowedCommands = new Set([
  'configuration', 'open', 'exact', 'scrub', 'step', 'play', 'pause', 'stop', 'rate', 'status',
]);

contextBridge.exposeInMainWorld('frameBridgeBenchmark', Object.freeze({
  async createSharedRing(slotCount, slotBytes) {
    if (!Number.isSafeInteger(slotCount) || slotCount < 2 || slotCount > 8 ||
        !Number.isSafeInteger(slotBytes) || slotBytes < 1024 || slotBytes > 64 * 1024 * 1024) {
      throw new Error('Invalid shared frame-ring dimensions.');
    }
    return ipcRenderer.invoke('frame-bridge:configure-shared-ring', { slotCount, slotBytes });
  },
  invoke(command, fields = {}) {
    if (!allowedCommands.has(command)) throw new Error(`Unsupported benchmark command: ${command}`);
    return ipcRenderer.invoke(`frame-bridge:${command}`, fields);
  },
  complete(result) {
    return ipcRenderer.invoke('frame-bridge:complete', result);
  },
  onPlaybackFrame(listener) {
    const handler = (_event, frame) => listener(frame);
    ipcRenderer.on('frame-bridge:playback-frame', handler);
    return () => ipcRenderer.removeListener('frame-bridge:playback-frame', handler);
  },
  acknowledgePlaybackFrame(frameGeneration) {
    ipcRenderer.send('frame-bridge:playback-ack', frameGeneration);
  },
}));
