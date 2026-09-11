import { DEFAULT_APP_SETTINGS, type AppSettings } from './app-settings.js';

export type SettingsResult = { ok: true; settings: AppSettings; warning?: string } | { ok: false; error: string };
export type RootChoice = { kind: 'chosen'; path: string } | { kind: 'canceled' } | { kind: 'error'; error: string };
export interface AppSettingsPersistence {
  load(): Promise<SettingsResult>;
  save(settings: AppSettings): Promise<SettingsResult>;
  chooseRoot(): Promise<RootChoice>;
}

export class AppSettingsService {
  private value = DEFAULT_APP_SETTINGS;
  constructor(private readonly persistence: AppSettingsPersistence) {}
  get current(): AppSettings { return this.value; }
  async load(): Promise<SettingsResult> {
    const result = await this.persistence.load();
    if (result.ok) this.value = result.settings;
    return result;
  }
  async save(settings: AppSettings): Promise<SettingsResult> {
    const result = await this.persistence.save(settings);
    if (result.ok) this.value = result.settings;
    return result;
  }
  chooseRoot(): Promise<RootChoice> { return this.persistence.chooseRoot(); }
}
