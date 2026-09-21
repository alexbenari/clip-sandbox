const { contextBridge, ipcRenderer } = require('electron');

let frameReviewOperation = 0;
let clipExtractionOperation = 0;

function frameReviewOperationId() {
  frameReviewOperation += 1;
  return `operation_${Date.now()}_${frameReviewOperation}`;
}

async function invokeFrameReview(channel, payload) {
  const operationId = frameReviewOperationId();
  const response = await ipcRenderer.invoke(channel, { operationId, ...payload });
  if (!response || response.operationId !== operationId) {
    return {
      ok: false,
      operationId,
      error: { category: 'protocol-error', message: 'Frame-review response correlation failed.', recoverable: false },
    };
  }
  return response;
}

function extractionOperationId(kind) {
  clipExtractionOperation += 1;
  return `${kind}_${Date.now()}_${clipExtractionOperation}`;
}

async function invokeClipExtraction(channel, kind, payload, requestedOperationId = null) {
  const operationId = requestedOperationId || extractionOperationId(kind);
  const response = await ipcRenderer.invoke(channel, { operationId, ...payload });
  if (!response || response.operationId !== operationId) {
    return { ok: false, operationId, error: { code: 'protocol-error', message: 'Clip-extraction response correlation failed.' } };
  }
  return response;
}

const frameReviewApi = {
  chooseSource() {
    return invokeFrameReview('clip-sandbox:frame-review-choose-source', {});
  },
  open(request) {
    return invokeFrameReview('clip-sandbox:frame-review-open', {
      sourceHandle: request?.sourceHandle,
      previewBounds: request?.previewBounds,
    });
  },
  command(sessionId, command, args = {}) {
    return invokeFrameReview('clip-sandbox:frame-review-command', {
      sessionId, command, args,
    });
  },
  close(sessionId) {
    return invokeFrameReview('clip-sandbox:frame-review-close', {
      sessionId,
    });
  },
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Frame-review listener must be a function.');
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('clip-sandbox:frame-review-event', handler);
    return () => ipcRenderer.removeListener('clip-sandbox:frame-review-event', handler);
  },
};

const desktopApi = {
  frameReview: frameReviewApi,
  thumbnailCache: {
    save(bytes) { return ipcRenderer.invoke('clip-sandbox:thumbnail-save', { bytes }); },
    load(id) { return ipcRenderer.invoke('clip-sandbox:thumbnail-load', id); },
    delete(id) { return ipcRenderer.invoke('clip-sandbox:thumbnail-delete', id); },
  },
  clipExtraction: {
    openDestination() {
      return invokeClipExtraction('clip-sandbox:clip-extraction-open-destination', 'destination', {});
    },
    extract(request) {
      return invokeClipExtraction(
        'clip-sandbox:clip-extraction-extract', 'extract', request, request?.operationId);
    },
    saveCollection(request) {
      return invokeClipExtraction('clip-sandbox:clip-extraction-save-collection', 'publication', request);
    },
    cancel(extractionOperationIdValue) {
      return invokeClipExtraction('clip-sandbox:clip-extraction-cancel', 'cancel', {
        extractionOperationId: extractionOperationIdValue,
      });
    },
  },
  loadAppSettings() { return ipcRenderer.invoke('clip-sandbox:load-app-settings'); },
  saveAppSettings(settings) { return ipcRenderer.invoke('clip-sandbox:save-app-settings', settings); },
  choosePipelinesRoot() { return ipcRenderer.invoke('clip-sandbox:choose-pipelines-root'); },
  pickFolder() {
    return ipcRenderer.invoke('clip-sandbox:pick-folder');
  },
  refreshFolder(payload) {
    return ipcRenderer.invoke('clip-sandbox:refresh-folder', payload);
  },
  createVideoEdit(payload) {
    return ipcRenderer.invoke('clip-sandbox:create-video-edit', payload);
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
  desktopApi.__testSetNextMoviePath = (moviePath) =>
    ipcRenderer.invoke('clip-sandbox:test-set-next-movie-path', moviePath);
}

contextBridge.exposeInMainWorld('clipSandboxDesktop', desktopApi);
