import type { AppScreen } from './app-screen.js';
import { AppSettingsService, type SettingsResult } from '../app/app-settings-service.js';
import type { ActivityErrorOptions } from './activity-indicator-control.js';
import type { AppSettings } from '../app/app-settings.js';

type SettingsFeedback = { progress(message: string): void; success(message: string): void; error(message: string, options?: ActivityErrorOptions): void };

export class SettingsScreen implements AppScreen {
  readonly id = 'settings';
  readonly label = 'Settings';
  readonly commands = null;
  readonly shortcuts = [];
  readonly root: HTMLElement;
  private readonly folder: HTMLInputElement;
  private readonly choose: HTMLButtonElement;
  private readonly audio: HTMLInputElement;
  private readonly status: HTMLElement;
  private busy = true;

  constructor(private readonly service: AppSettingsService, private readonly feedback: SettingsFeedback, doc: Document = document) {
    this.root = doc.createElement('section');
    this.root.id = 'settingsScreen';
    this.root.setAttribute('aria-label', 'Settings');
    this.root.innerHTML = `
      <div class="settings-surface"><h1>Settings</h1>
      <p>Preferences for your workspace and clip playback.</p>
      <div class="settings-field">
        <label for="pipelinesRootPath">Pipelines top folder</label>
        <div class="settings-folder">
          <input id="pipelinesRootPath" readonly dir="ltr" placeholder="Not configured">
          <button id="choosePipelinesRoot" type="button">Choose folder…</button>
        </div>
        <p>This preference does not change the currently loaded folder.</p>
      </div>
      <div class="settings-field">
        <label class="settings-switch">
          <input id="singleClipAudioDefault" type="checkbox" role="switch"> Clip audio by default
        </label>
        <p>Start newly opened single-clip playback with audio. Grid previews stay muted.</p>
      </div>
      <p id="settingsStatus" role="status" aria-live="polite"></p></div>`;
    const folder = this.root.querySelector('#pipelinesRootPath');
    const choose = this.root.querySelector('#choosePipelinesRoot');
    const audio = this.root.querySelector('#singleClipAudioDefault');
    const status = this.root.querySelector('#settingsStatus');
    if (!(folder instanceof HTMLInputElement) || !(choose instanceof HTMLButtonElement) || !(audio instanceof HTMLInputElement) || !(status instanceof HTMLElement)) throw new Error('Settings template is incomplete.');
    this.folder = folder; this.choose = choose; this.audio = audio; this.status = status;
    choose.addEventListener('click', () => { void this.chooseFolder(); });
    audio.addEventListener('change', () => { void this.save({ singleClipAudioDefault: audio.checked }); });
    this.render();
  }
  async load(): Promise<void> {
    const result = await this.service.load();
    this.busy = false;
    this.render();
    if (result.ok === false) this.reportError('Could not read settings. Defaults are in use.', {
      affected: 'Load settings', recovery: 'Check access to your settings folder. You can still choose and save preferences.', technicalDetails: result.error,
    });
    else if (result.warning) this.reportError('Some saved settings could not be loaded. Defaults are in use.', {
      affected: 'Load settings', recovery: 'Review your preferences and save them again.', technicalDetails: result.warning,
    });
  }
  focusInitial(): void { this.folder.focus(); }
  private render(settings: AppSettings = this.service.current): void {
    this.folder.value = settings.pipelinesRootPath ?? '';
    this.audio.checked = settings.singleClipAudioDefault;
    this.choose.disabled = this.busy;
    this.audio.disabled = this.busy;
    this.root.setAttribute('aria-busy', String(this.busy));
  }
  private reportError(message: string, options: ActivityErrorOptions): void {
    this.status.textContent = message;
    this.feedback.error(message, options);
  }
  private async chooseFolder(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    const choice = await this.service.chooseRoot();
    this.busy = false;
    if (choice.kind === 'chosen') await this.save({ pipelinesRootPath: choice.path });
    else {
      this.render();
      if (choice.kind === 'error') this.reportError('Could not choose a folder.', {
        affected: 'Choose Pipelines top folder', recovery: 'Choose an accessible folder and try again.', technicalDetails: choice.error,
      });
    }
  }
  private async save(change: Partial<AppSettings>, retrying = false): Promise<SettingsResult | void> {
    if (this.busy) {
      if (retrying) return { ok: false, error: 'Wait for the current settings change to finish, then retry.' };
      return;
    }
    // A retry reapplies only the failed preference, preserving later changes to other settings.
    const settings = { ...this.service.current, ...change };
    this.busy = true; this.render(settings);
    this.status.textContent = 'Saving…'; this.feedback.progress('Saving settings…');
    const result = await this.service.save(settings);
    this.busy = false; this.render();
    if (result.ok === false) {
      const message = 'Settings were not saved.';
      if (retrying) { this.status.textContent = message; return result; }
      this.reportError(message, {
        affected: 'Save settings', recovery: 'Check available disk space and folder access, then retry.',
        technicalDetails: result.error, retry: () => this.save(change, true),
      });
    }
    else { this.status.textContent = 'Saved'; this.feedback.success('Settings saved'); }
    return result;
  }
}
