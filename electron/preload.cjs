const { contextBridge, ipcRenderer } = require('electron');

let frameReviewOperation = 0;
let correlatedOperation = 0;

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

function correlatedOperationId(kind) {
  correlatedOperation += 1;
  return `${kind}_${Date.now()}_${correlatedOperation}`;
}

function correlatedInvoker(label) {
  return async (channel, kind, payload, requestedOperationId = null) => {
    const operationId = requestedOperationId || correlatedOperationId(kind);
    const response = await ipcRenderer.invoke(channel, { operationId, ...payload });
    if (!response || response.operationId !== operationId) {
      return { ok: false, operationId, error: { code: 'protocol-error', message: `${label} response correlation failed.` } };
    }
    return response;
  };
}

const invokeClipExtraction = correlatedInvoker('Clip-extraction');
const invokeZoomEditSave = correlatedInvoker('Zoom edit save');

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
    subscribeProgress(listener) {
      if (typeof listener !== 'function') throw new TypeError('Extraction progress listener must be a function.');
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('clip-sandbox:clip-extraction-progress', handler);
      return () => ipcRenderer.removeListener('clip-sandbox:clip-extraction-progress', handler);
    },
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
  clipCaptures: {
    attach(request) { return ipcRenderer.invoke('clip-sandbox:clip-captures-attach', request); },
    save(request) { return ipcRenderer.invoke('clip-sandbox:clip-captures-save', request); },
  },
  clipSourceMovies: {
    read(request) { return ipcRenderer.invoke('clip-sandbox:clip-source-movies-read', request); },
  },
  zoomEdit: {
    openClip(request) { return ipcRenderer.invoke('clip-sandbox:zoom-edit-open-clip', request); },
    openWindow(request) { return ipcRenderer.invoke('clip-sandbox:zoom-edit-open-window', request); },
    anchorWindow(request) { return ipcRenderer.invoke('clip-sandbox:zoom-edit-anchor-window', request); },
    subscribeSaveProgress(listener) {
      if (typeof listener !== 'function') throw new TypeError('Zoom edit save progress listener must be a function.');
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('clip-sandbox:zoom-edit-save-progress', handler);
      return () => ipcRenderer.removeListener('clip-sandbox:zoom-edit-save-progress', handler);
    },
    save(request) {
      return invokeZoomEditSave('clip-sandbox:zoom-edit-save', 'refine', request, request?.operationId);
    },
    cancelSave(saveOperationId) {
      return invokeZoomEditSave('clip-sandbox:zoom-edit-cancel-save', 'cancel', { saveOperationId });
    },
  },
  loadAppSettings() { return ipcRenderer.invoke('clip-sandbox:load-app-settings'); },
  saveAppSettings(settings) { return ipcRenderer.invoke('clip-sandbox:save-app-settings', settings); },
  choosePipelinesRoot() { return ipcRenderer.invoke('clip-sandbox:choose-pipelines-root'); },
  listPipelineCatalog() { return ipcRenderer.invoke('clip-sandbox:list-pipeline-catalog'); },
  describePipelineCatalogEntry(payload) { return ipcRenderer.invoke('clip-sandbox:describe-pipeline-catalog-entry', payload); },
  openPipelineCatalogEntry(payload) { return ipcRenderer.invoke('clip-sandbox:open-pipeline-catalog-entry', payload); },
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
  trashFiles(payload) {
    return ipcRenderer.invoke('clip-sandbox:trash-files', payload);
  },
};

if (process.env.CLIP_SANDBOX_E2E === '1') {
  desktopApi.__testSetNextFolderPath = (folderPath) =>
    ipcRenderer.invoke('clip-sandbox:test-set-next-folder-path', folderPath);
  desktopApi.__testSetNextMoviePath = (moviePath) =>
    ipcRenderer.invoke('clip-sandbox:test-set-next-movie-path', moviePath);
}

contextBridge.exposeInMainWorld('clipSandboxDesktop', desktopApi);
