import { DEFAULT_APP_SETTINGS, type IAppSettings } from './app-settings.js';

export type SettingsWarningKind = 'ignored-fields' | 'recovered-defaults';
export type SettingsResult =
  | { ok: true; settings: IAppSettings }
  | { ok: true; settings: IAppSettings; warning: string; warningKind: SettingsWarningKind }
  | { ok: false; error: string };
export type RootChoice = { kind: 'chosen'; path: string } | { kind: 'canceled' } | { kind: 'error'; error: string };
export interface IAppSettingsPersistence {
  load(): Promise<SettingsResult>;
  save(settings: IAppSettings): Promise<SettingsResult>;
  chooseRoot(): Promise<RootChoice>;
}

export class AppSettingsService {
  private value = DEFAULT_APP_SETTINGS;
  constructor(private readonly persistence: IAppSettingsPersistence) {}
  get current(): IAppSettings { return this.value; }
  async load(): Promise<SettingsResult> {
    const result = await this.persistence.load();
    if (result.ok) this.value = result.settings;
    return result;
  }
  async save(settings: IAppSettings): Promise<SettingsResult> {
    const result = await this.persistence.save(settings);
    if (result.ok) this.value = result.settings;
    return result;
  }
  chooseRoot(): Promise<RootChoice> { return this.persistence.chooseRoot(); }
}
