import type { ClipFile } from '../domain/clip.js';

// Only a folder service creates one, from a folder it has just opened, so holding one means the folder is open.
export type FolderAccess = Readonly<{ folderPath: string }>;

export type FolderContents = Readonly<{ folderAccess: FolderAccess; files: ClipFile[]; folderName: string }>;
