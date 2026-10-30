import type { ClipSource } from '../domain/clip-source.js';
import type { FolderAccess } from './folder-access.js';

export type ClipRenameRefusal = 'invalid-name' | 'name-taken' | 'not-a-file' | 'folder-not-open';

export type ClipRenameProblem = ClipRenameRefusal | 'failed';

export type ClipRenameAnswer =
  | Readonly<{ kind: 'renamed'; source: ClipSource }>
  | Readonly<{ kind: 'refused'; reason: ClipRenameRefusal }>;

export interface IClipRenameRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly newFilename: string;
}

export interface IClipRenameService {
  rename(request: IClipRenameRequest): Promise<ClipRenameAnswer>;
}
