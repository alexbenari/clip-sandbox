export class ClipSource {
  private constructor(
    readonly name: string,
    readonly mediaSource: string,
    readonly desktopPath: string | null,
  ) {
    Object.freeze(this);
  }

  static create({ name, mediaSource, desktopPath = null }: {
    name: string;
    mediaSource: string;
    desktopPath?: string | null;
  }): ClipSource {
    const trimmedName = String(name ?? '').trim();
    if (!trimmedName) throw new Error('Clip source name is required.');
    const trimmedMediaSource = String(mediaSource ?? '').trim();
    if (!trimmedMediaSource) throw new Error('Clip source media address is required.');
    const trimmedDesktopPath = String(desktopPath ?? '').trim();
    return new ClipSource(trimmedName, trimmedMediaSource, trimmedDesktopPath || null);
  }
}
