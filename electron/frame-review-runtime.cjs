class FrameReviewRuntime {
  #hostClass;
  #configuration;
  #hosts = new Map();
  #pendingDisposals = new Set();
  #releaseListeners = [];
  // Cache upkeep needs no window, so it runs on one host that no window owns.
  #maintenanceHost = null;

  constructor({ hostClass, configuration }) {
    if (typeof hostClass !== 'function' || typeof configuration?.applicationFolder !== 'string') {
      throw new Error('Frame-review runtime dependencies are invalid.');
    }
    this.#hostClass = hostClass;
    this.#configuration = configuration;
  }

  get applicationFolder() {
    return this.#configuration.applicationFolder;
  }

  openHost(webContentsId) {
    const host = new this.#hostClass(this.#configuration);
    this.#hosts.set(webContentsId, host);
    return host;
  }

  hostForEvent(event) {
    const host = this.#hosts.get(event?.sender?.id);
    if (!host) throw new Error('No frame-review host exists for this window.');
    return host;
  }

  forgetPreparedReview(sourcePath) {
    this.#maintenanceHost ??= new this.#hostClass(this.#configuration);
    return this.#maintenanceHost.forgetPreparedReview(sourcePath);
  }

  onHostReleased(listener) {
    this.#releaseListeners.push(listener);
  }

  releaseHost(webContentsId, host) {
    if (this.#hosts.get(webContentsId) === host) this.#hosts.delete(webContentsId);
    const disposal = host.dispose().finally(() => this.#pendingDisposals.delete(disposal));
    this.#pendingDisposals.add(disposal);
    for (const listener of this.#releaseListeners) listener(webContentsId);
  }

  async dispose() {
    const activeHosts = [...this.#hosts.values(), ...(this.#maintenanceHost ? [this.#maintenanceHost] : [])];
    this.#hosts.clear();
    this.#maintenanceHost = null;
    await Promise.allSettled([...activeHosts.map(host => host.dispose()), ...this.#pendingDisposals]);
  }
}

module.exports = { FrameReviewRuntime };
