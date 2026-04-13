const { contextBridge, ipcRenderer } = require('electron');

const desktopApi = {
  pickFolder() {
    return ipcRenderer.invoke('clip-sandbox:pick-folder');
  },
  saveTextFile(payload) {
    return ipcRenderer.invoke('clip-sandbox:save-text-file', payload);
  },
  appendTextFile(payload) {
    return ipcRenderer.invoke('clip-sandbox:append-text-file', payload);
  },
  deleteFiles(payload) {
    return ipcRenderer.invoke('clip-sandbox:delete-files', payload);
  },
};

if (process.env.CLIP_SANDBOX_E2E === '1') {
  desktopApi.__testSetNextFolderPath = (folderPath) =>
    ipcRenderer.invoke('clip-sandbox:test-set-next-folder-path', folderPath);
}

contextBridge.exposeInMainWorld('clipSandboxDesktop', desktopApi);
