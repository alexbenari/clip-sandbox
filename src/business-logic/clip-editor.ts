// @ts-nocheck
import { getVideoEditById, preferredVideoEditFilename } from './video-edit-catalog.js';

export class ClipEditor {
  constructor({
    runtimeEditingService,
  } = {}) {
    this.runtimeEditingService = runtimeEditingService;
  }

  async createVideoEdit({
    clip = null,
    editId = '',
    folderSession = null,
  } = {}) {
    const edit = getVideoEditById(editId);
    if (!edit) {
      return {
        ok: false,
        code: 'unsupported-edit',
      };
    }

    const sourcePath = String(clip?.file?.path || '').trim();
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
    if (!runtimeResult?.ok) {
      return {
        ok: false,
        code: runtimeResult?.code || 'edit-failed',
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

export function createClipEditor(options) {
  return new ClipEditor(options);
}

