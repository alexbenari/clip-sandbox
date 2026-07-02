import { getVideoEditById, preferredVideoEditFilename } from './video-edit-catalog.js';
import type { VideoEdit } from './video-edit-catalog.js';
import type { Clip } from '../domain/clip.js';

export type VideoEditRequest = {
  editId: string;
  preferredOutputFilename: string;
  outputFolderPath: string;
  sourceFileName: string;
  sourcePath: string;
};

export type CreatedVideoFile = File & {
  mediaSource?: string;
  path?: string;
};

export type RuntimeVideoEditResult =
  | { ok: true; createdFile: CreatedVideoFile }
  | { ok: false; code?: string };

export type RuntimeEditingService = {
  createVideoEdit?: (request: VideoEditRequest) => Promise<RuntimeVideoEditResult>;
};

export type ClipEditorResult =
  | { ok: false; code: 'unsupported-edit' }
  | { ok: false; code: 'missing-source-path' | 'missing-output-folder' | 'invalid-source-name'; edit: VideoEdit }
  | { ok: false; code: string; edit: VideoEdit; request: VideoEditRequest }
  | { ok: true; code: 'created'; edit: VideoEdit; request: VideoEditRequest; createdFile: CreatedVideoFile };

export class ClipEditor {
  runtimeEditingService?: RuntimeEditingService;

  constructor({
    runtimeEditingService,
  }: { runtimeEditingService?: RuntimeEditingService } = {}) {
    this.runtimeEditingService = runtimeEditingService;
  }

  async createVideoEdit({
    clip = null,
    editId = '',
    folderSession = null,
  }: {
    clip?: Clip | null;
    editId?: string;
    folderSession?: { folderPath?: string } | null;
  } = {}): Promise<ClipEditorResult> {
    const edit = getVideoEditById(editId);
    if (!edit) {
      return {
        ok: false,
        code: 'unsupported-edit',
      };
    }

    if (!clip) {
      return {
        ok: false,
        code: 'missing-source-path',
        edit,
      };
    }

    const sourcePath = String(clip.file.path || '').trim();
    if (!sourcePath) {
      return {
        ok: false,
        code: 'missing-source-path',
        edit,
      };
    }

    const outputFolderPath = String(folderSession?.folderPath || '').trim();
    if (!outputFolderPath) {
      return {
        ok: false,
        code: 'missing-output-folder',
        edit,
      };
    }

    const preferredOutputFilename = preferredVideoEditFilename({
      sourceName: clip.name,
      editId: edit.id,
    });
    if (!preferredOutputFilename) {
      return {
        ok: false,
        code: 'invalid-source-name',
        edit,
      };
    }

    const request = {
      editId: edit.id,
      preferredOutputFilename,
      outputFolderPath,
      sourceFileName: clip.name,
      sourcePath,
    };

    const runtimeResult = await this.runtimeEditingService?.createVideoEdit?.(request);
    if (!runtimeResult) {
      return {
        ok: false,
        code: 'edit-failed',
        edit,
        request,
      };
    }

    if (runtimeResult.ok === false) {
      return {
        ok: false,
        code: runtimeResult.code || 'edit-failed',
        edit,
        request,
      };
    }

    return {
      ok: true,
      code: 'created',
      edit,
      request,
      createdFile: runtimeResult.createdFile,
    };
  }
}

export function createClipEditor(options?: { runtimeEditingService?: RuntimeEditingService }): ClipEditor {
  return new ClipEditor(options);
}

