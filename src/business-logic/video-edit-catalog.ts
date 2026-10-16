export type VideoEditAvailability = 'zoom';

export type VideoEdit = Readonly<{
  id: 'loopify';
  label: string;
  filenameSuffix: string;
  availability: VideoEditAvailability;
}>;

const VIDEO_EDITS: readonly VideoEdit[] = Object.freeze([
  Object.freeze({
    id: 'loopify',
    label: 'Loopify',
    filenameSuffix: 'looped',
    availability: 'zoom',
  }),
]);

export class VideoEditCatalog {
  listZoomEdits(): VideoEdit[] {
    return VIDEO_EDITS.filter(edit => edit.availability === 'zoom');
  }

  findById(editId: string): VideoEdit | null {
    const normalizedEditId = String(editId || '').trim().toLowerCase();
    return VIDEO_EDITS.find(edit => edit.id === normalizedEditId) || null;
  }

  preferredOutputFilename({
    sourceName = '',
    editId = '',
  }: { sourceName?: string; editId?: string } = {}): string {
    const edit = this.findById(editId);
    if (!edit) return '';
    const baseName = this.normalizedSourceBaseName(sourceName);
    return baseName ? `${baseName}-${edit.filenameSuffix}.mp4` : '';
  }

  private normalizedSourceBaseName(sourceName: string): string {
    const trimmedName = String(sourceName || '').trim();
    if (!trimmedName) return '';
    const extensionIndex = trimmedName.lastIndexOf('.');
    return extensionIndex <= 0 ? trimmedName : trimmedName.slice(0, extensionIndex);
  }
}
