export interface AppSettings {
  readonly pipelinesRootPath: string | null;
  readonly singleClipAudioDefault: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = Object.freeze({ pipelinesRootPath: null, singleClipAudioDefault: false });

export class AppSettingsParser {
  parse(value: unknown): AppSettings | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const root = candidate.pipelinesRootPath;
    if (root !== null && !this.isAbsolutePath(root)) return null;
    if (typeof candidate.singleClipAudioDefault !== 'boolean') return null;
    return Object.freeze({
      pipelinesRootPath: typeof root === 'string' ? root : null,
      singleClipAudioDefault: candidate.singleClipAudioDefault,
    });
  }

  private isAbsolutePath(value: unknown): value is string {
    return (
      typeof value === 'string'
      && !!value.trim()
      && !value.includes('\0')
      && /^(?:[a-z]:[\\/]|[\\/]{2}|\/)/i.test(value)
    );
  }
}
