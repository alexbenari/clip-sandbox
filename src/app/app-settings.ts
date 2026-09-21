export interface IAppSettings {
  readonly pipelinesRootPath: string | null;
  readonly singleClipAudioDefault: boolean;
  readonly startupScreenId: StartupScreenId;
}

export type StartupScreenId = 'gif-extraction' | 'collection';

export const DEFAULT_STARTUP_SCREEN_ID: StartupScreenId = 'gif-extraction';

export const DEFAULT_APP_SETTINGS: IAppSettings = Object.freeze({
  pipelinesRootPath: null,
  singleClipAudioDefault: false,
  startupScreenId: DEFAULT_STARTUP_SCREEN_ID,
});

export function isStartupScreenId(value: unknown): value is StartupScreenId {
  return value === 'gif-extraction' || value === 'collection';
}

export class AppSettingsParser {
  parse(value: unknown): IAppSettings | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const root = candidate.pipelinesRootPath;
    const startupScreenId = candidate.startupScreenId;
    if (root !== null && !this.isAbsolutePath(root)) return null;
    if (typeof candidate.singleClipAudioDefault !== 'boolean') return null;
    let parsedStartupScreenId = DEFAULT_STARTUP_SCREEN_ID;
    if (startupScreenId !== undefined) {
      if (!isStartupScreenId(startupScreenId)) return null;
      parsedStartupScreenId = startupScreenId;
    }
    return Object.freeze({
      pipelinesRootPath: typeof root === 'string' ? root : null,
      singleClipAudioDefault: candidate.singleClipAudioDefault,
      startupScreenId: parsedStartupScreenId,
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
