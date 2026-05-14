// @ts-nocheck
export class ElectronVideoEditService {
  constructor({
    api = window.clipSandboxDesktop,
  } = {}) {
    this.api = api;
  }

  requireApi() {
    if (!this.api?.createVideoEdit) {
      throw new Error('Electron video edit API is unavailable.');
    }
    return this.api;
  }

  async createVideoEdit(request = {}) {
    const response = await this.requireApi().createVideoEdit(request);
    if (!response?.ok) {
      return {
        ok: false,
        code: response?.code || 'edit-failed',
      };
    }

    return {
      ok: true,
      createdFile: response.createdFile || null,
    };
  }
}

export function createElectronVideoEditService(options) {
  return new ElectronVideoEditService(options);
}

