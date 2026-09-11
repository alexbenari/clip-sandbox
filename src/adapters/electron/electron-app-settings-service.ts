import { AppSettingsParser, type AppSettings } from '../../app/app-settings.js';
import type { AppSettingsPersistence, SettingsResult, RootChoice } from '../../app/app-settings-service.js';

type SettingsApi = {
  loadAppSettings(): Promise<unknown>;
  saveAppSettings(settings: AppSettings): Promise<unknown>;
  choosePipelinesRoot(): Promise<unknown>;
};

export class ElectronAppSettingsService implements AppSettingsPersistence {
  constructor(private readonly api: SettingsApi, private readonly parser: AppSettingsParser) {}
  static fromWindow(win: Window, parser: AppSettingsParser): ElectronAppSettingsService {
    // The preload exposes these methods; payloads still enter as unknown.
    const api = (win as Window & { clipSandboxDesktop: SettingsApi }).clipSandboxDesktop;
    return new ElectronAppSettingsService(api, parser);
  }
  private async readResult(call: () => Promise<unknown>): Promise<SettingsResult> {
    try {
      const raw = await call();
      if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid settings response.' };
      const result = raw as Record<string, unknown>;
      if (result.ok === true) {
        const settings = this.parser.parse(result.settings);
        if (settings) return { ok: true, settings, ...(typeof result.warning === 'string' ? { warning: result.warning } : {}) };
      }
      return { ok: false, error: typeof result.error === 'string' ? result.error : 'Invalid settings response.' };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Settings are unavailable.' }; }
  }
  load(): Promise<SettingsResult> { return this.readResult(() => this.api.loadAppSettings()); }
  save(settings: AppSettings): Promise<SettingsResult> { return this.readResult(() => this.api.saveAppSettings(settings)); }
  async chooseRoot(): Promise<RootChoice> {
    try {
      const raw = await this.api.choosePipelinesRoot();
      if (raw && typeof raw === 'object') {
        const result = raw as Record<string, unknown>;
        if (result.canceled === true) return { kind: 'canceled' };
        const settings = this.parser.parse({ pipelinesRootPath: result.path, singleClipAudioDefault: false });
        if (settings?.pipelinesRootPath) return { kind: 'chosen', path: settings.pipelinesRootPath };
        if (typeof result.error === 'string') return { kind: 'error', error: result.error };
      }
      return { kind: 'error', error: 'Invalid folder-picker response.' };
    } catch (error) { return { kind: 'error', error: error instanceof Error ? error.message : 'Folder picker unavailable.' }; }
  }
}
