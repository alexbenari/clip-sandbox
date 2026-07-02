export type VideoEditAvailability = 'zoom';

export type VideoEditIcon = Readonly<{
  kind: 'svg';
  viewBox: string;
  paths: readonly string[];
}>;

export type VideoEdit = Readonly<{
  id: 'loopify';
  label: string;
  filenameSuffix: string;
  availability: VideoEditAvailability;
  description: string;
  icon: VideoEditIcon;
}>;

const CHISEL_ICON = Object.freeze({
  kind: 'svg',
  viewBox: '0 0 16 16',
  paths: [
    'M10.74 1.26a1.5 1.5 0 0 1 2.12 0l1.88 1.88a1.5 1.5 0 0 1 0 2.12L9.47 10.53a1.5 1.5 0 0 1-.73.4l-2.91.64a.75.75 0 0 1-.89-.89l.64-2.91a1.5 1.5 0 0 1 .4-.73Z',
    'M4.47 10.78 1.9 13.35a.75.75 0 1 0 1.06 1.06l2.57-2.57-.31-.31a2.98 2.98 0 0 1-.75-.75Z',
  ],
});

const VIDEO_EDIT_CATALOG: readonly VideoEdit[] = Object.freeze([
  Object.freeze({
    id: 'loopify',
    label: 'Loopify',
    filenameSuffix: 'looped',
    availability: 'zoom',
    description: 'Create a boomerang loop by appending reversed playback.',
    icon: CHISEL_ICON,
  }),
]);

function normalizedSourceBaseName(sourceName = ''): string {
  const trimmedName = String(sourceName || '').trim();
  if (!trimmedName) return '';
  const extensionIndex = trimmedName.lastIndexOf('.');
  if (extensionIndex <= 0) return trimmedName;
  return trimmedName.slice(0, extensionIndex);
}

export function listVideoEdits(): VideoEdit[] {
  return VIDEO_EDIT_CATALOG.slice();
}

export function listZoomVideoEdits(): VideoEdit[] {
  return VIDEO_EDIT_CATALOG.filter((edit) => edit.availability === 'zoom');
}

export function getVideoEditById(editId: string): VideoEdit | null {
  const normalizedEditId = String(editId || '').trim().toLowerCase();
  return VIDEO_EDIT_CATALOG.find((edit) => edit.id === normalizedEditId) || null;
}

export function preferredVideoEditFilename({
  sourceName = '',
  editId = '',
}: { sourceName?: string; editId?: string } = {}): string {
  const edit = getVideoEditById(editId);
  if (!edit) return '';
  const baseName = normalizedSourceBaseName(sourceName);
  if (!baseName) return '';
  return `${baseName}-${edit.filenameSuffix}.mp4`;
}

