import { ClipSource } from '../../domain/clip-source.js';
import type { ClipRenameAnswer, ClipRenameRefusal, IClipRenameRequest, IClipRenameService } from '../../app/clip-rename-service.js';

type DesktopRenameAnswer = {
  kind?: unknown;
  reason?: unknown;
  entry?: { name?: unknown; path?: unknown; mediaSource?: unknown } | null;
};

type ElectronClipRenameApi = {
  renameClip(request: { folderPath: string; filename: string; newFilename: string }): Promise<DesktopRenameAnswer | null | undefined>;
};

const REFUSALS: readonly ClipRenameRefusal[] = ['invalid-name', 'name-taken', 'not-a-file', 'folder-not-open'];

export class ElectronClipRenameService implements IClipRenameService {
  constructor(private readonly api: ElectronClipRenameApi) {}

  static tryCreate(win: Window): ElectronClipRenameService | null {
    const api = (win as Window & { clipSandboxDesktop?: Partial<ElectronClipRenameApi> }).clipSandboxDesktop;
    return typeof api?.renameClip === 'function' ? new ElectronClipRenameService(api as ElectronClipRenameApi) : null;
  }

  async rename({ folder, filename, newFilename }: IClipRenameRequest): Promise<ClipRenameAnswer> {
    const answer = await this.api.renameClip({ folderPath: folder.folderPath, filename, newFilename });
    if (answer?.kind === 'refused') {
      if (!REFUSALS.includes(answer.reason as ClipRenameRefusal)) throw new Error(`The desktop API refused a rename for an unknown reason: ${String(answer.reason)}.`);
      return Object.freeze({ kind: 'refused', reason: answer.reason as ClipRenameRefusal });
    }
    const entry = answer?.kind === 'renamed' ? answer.entry : null;
    if (typeof entry?.name !== 'string' || typeof entry.mediaSource !== 'string' || typeof entry.path !== 'string') {
      throw new Error('The desktop API answered a rename without the renamed file.');
    }
    return Object.freeze({
      kind: 'renamed',
      source: ClipSource.create({ name: entry.name, mediaSource: entry.mediaSource, desktopPath: entry.path }),
    });
  }
}
