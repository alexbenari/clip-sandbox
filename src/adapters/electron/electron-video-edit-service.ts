import type { CreatedVideoFile, RuntimeVideoEditResult, VideoEditRequest } from '../../business-logic/clip-editor.js';

export type ElectronVideoEditApi = {
  createVideoEdit?: (request: VideoEditRequest) => Promise<{
    ok?: boolean;
    code?: string;
    createdFile?: CreatedVideoFile | null;
  } | null | undefined>;
};

type ElectronVideoEditWindow = Window & {
  clipSandboxDesktop?: ElectronVideoEditApi;
};

export class ElectronVideoEditService {
  api?: ElectronVideoEditApi | null;

  constructor({
    api = (window as ElectronVideoEditWindow).clipSandboxDesktop,
  }: { api?: ElectronVideoEditApi | null } = {}) {
    this.api = api;
  }

  requireApi(): Required<Pick<ElectronVideoEditApi, 'createVideoEdit'>> {
    if (!this.api?.createVideoEdit) {
      throw new Error('Electron video edit API is unavailable.');
    }
    return this.api as Required<Pick<ElectronVideoEditApi, 'createVideoEdit'>>;
  }

  async createVideoEdit(request: VideoEditRequest): Promise<RuntimeVideoEditResult> {
    const response = await this.requireApi().createVideoEdit(request);
    if (!response?.ok) {
      return {
        ok: false,
        code: response?.code || 'edit-failed',
      };
    }
    if (!response.createdFile) {
      return {
        ok: false,
        code: response.code || 'output-missing',
      };
    }

    return {
      ok: true,
      createdFile: response.createdFile,
    };
  }
}

export function createElectronVideoEditService(options?: { api?: ElectronVideoEditApi | null }): ElectronVideoEditService {
  return new ElectronVideoEditService(options);
}

