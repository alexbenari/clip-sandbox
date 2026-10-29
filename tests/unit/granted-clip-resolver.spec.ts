// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { GrantedClipResolver } = require('../../electron/granted-clip-resolver.cjs');

const folder = path.resolve('pipelines', 'picks');
const sender = { id: 7 };

function resolverWith(entries: Record<string, 'file' | 'folder'>) {
  const folderAccess = {
    requireKnownPath: (_sender: unknown, folderPath: unknown) => {
      if (folderPath !== folder) throw new Error(`Folder access is unavailable for ${String(folderPath)}.`);
      return folder;
    },
  };
  const fileSystem = {
    stat: async (filePath: string) => {
      const kind = entries[path.basename(filePath)];
      if (path.dirname(filePath) !== folder || !kind) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return { isFile: () => kind === 'file' };
    },
  };
  return new GrantedClipResolver({ folderAccess, fileSystem });
}

describe('GrantedClipResolver', () => {
  it('answers the clip’s folder, name and path inside the granted folder', async () => {
    const clip = await resolverWith({ 'Feature-002.mp4': 'file' }).resolve(sender, { folderPath: folder, filename: 'Feature-002.mp4' });

    expect(clip).toEqual({ folder, filename: 'Feature-002.mp4', path: path.join(folder, 'Feature-002.mp4') });
  });

  it.each([
    ['a folder that was not granted', { folderPath: path.resolve('elsewhere'), filename: 'Feature-002.mp4' },
      'folder-not-open', 'Folder access is unavailable for this folder session.'],
    ['a name that contains a folder', { folderPath: folder, filename: '..\\Feature-002.mp4' }, 'invalid-name', 'Clip filename is invalid.'],
    ['a name that is not a video', { folderPath: folder, filename: 'notes.txt' }, 'invalid-name', 'Clip filename is invalid.'],
    ['a clip that does not exist', { folderPath: folder, filename: 'Feature-009.mp4' }, 'not-a-file', 'Clip is not a file.'],
    ['a folder named like a clip', { folderPath: folder, filename: 'Folder.mp4' }, 'not-a-file', 'Clip is not a file.'],
  ])('refuses %s with a reason and a message naming no path', async (_case, request, reason, message) => {
    const resolver = resolverWith({ 'Feature-002.mp4': 'file', 'Folder.mp4': 'folder' });

    await expect(resolver.resolve(sender, request)).rejects.toMatchObject({ reason, message });
  });
});
