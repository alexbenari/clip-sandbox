// One top-level file of an opened folder, as the desktop lists it. `text` is present for collection files.
export type FolderEntry = Readonly<{
  name: string;
  type: string;
  mediaSource: string;
  desktopPath: string | null;
  text?: string;
}>;
