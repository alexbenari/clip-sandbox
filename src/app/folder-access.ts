import type { FolderEntry } from '../business-logic/folder-entry.js';

// Only a folder service creates one, from a folder it has just opened, so holding one means the folder is open.
export type FolderAccess = Readonly<{ folderPath: string }>;

export type FolderContents = Readonly<{ folderAccess: FolderAccess; files: FolderEntry[]; folderName: string }>;
