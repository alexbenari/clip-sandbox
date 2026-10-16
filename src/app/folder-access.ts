import type { ClipFile } from '../domain/clip.js';

/**
 * The opened folder whose top-level files the app may read, write and delete.
 * Only a folder service creates one, from a folder it has just opened; `null` means no folder is open.
 */
export type FolderAccess = Readonly<{ folderPath: string }>;

/** What opening or refreshing a folder yields: access to it and its files as they are now. */
export type FolderContents = Readonly<{ folderSession: FolderAccess; files: ClipFile[]; folderName: string }>;
