import { AppSettingsParser, type IAppSettings } from '../../app/app-settings.js';
import type { IAppSettingsPersistence, SettingsResult, RootChoice } from '../../app/app-settings-service.js';

type SettingsApi = {
  loadAppSettings(): Promise<unknown>;
  saveAppSettings(settings: IAppSettings): Promise<unknown>;
  choosePipelinesRoot(): Promise<unknown>;
};

export class ElectronAppSettingsService implements IAppSettingsPersistence {
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
        if (settings && result.warningKind === undefined && result.warning === undefined) return { ok: true, settings };
        if (settings && result.warningKind === 'ignored-fields' && this.isFieldNameList(result.ignoredFields)) {
          return { ok: true, settings, warningKind: 'ignored-fields', ignoredFields: [...result.ignoredFields] };
        }
        if (settings && result.warningKind === 'recovered-defaults' && typeof result.warning === 'string') {
          return { ok: true, settings, warningKind: 'recovered-defaults', warning: result.warning };
        }
      }
      return { ok: false, error: typeof result.error === 'string' ? result.error : 'Invalid settings response.' };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Settings are unavailable.' }; }
  }
  private isFieldNameList(value: unknown): value is [string, ...string[]] {
    return Array.isArray(value) && value.length > 0 && value.every(field => typeof field === 'string');
  }
  load(): Promise<SettingsResult> { return this.readResult(() => this.api.loadAppSettings()); }
  save(settings: IAppSettings): Promise<SettingsResult> { return this.readResult(() => this.api.saveAppSettings(settings)); }
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
