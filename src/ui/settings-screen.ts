import type { IAppScreen, IAppScreenPanelContribution } from './app-screen.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { AppSettingsParser, type IAppSettings } from '../app/app-settings.js';

export interface ISettingsScreenEvents {
  folderChooseRequested: void;
  preferenceChangeRequested: Partial<IAppSettings>;
}

export class SettingsScreen implements IAppScreen, IEventSource<ISettingsScreenEvents> {
  readonly id = 'settings';
  readonly label = 'Settings';
  readonly selectorStatus = 'fixed' as const;
  readonly panelContributions: readonly IAppScreenPanelContribution[] = Object.freeze([]);
  readonly initiallyFoldedPanelIds = ['clips', 'pipelines'] as const;
  readonly commands = null;
  readonly shortcuts = [];
  readonly root: HTMLElement;
  private readonly events = new EventSource<ISettingsScreenEvents>();
  private readonly folder: HTMLInputElement;
  private readonly choose: HTMLButtonElement;
  private readonly audio: HTMLInputElement;
  private readonly startupScreen: HTMLSelectElement;
  private readonly status: HTMLElement;

  constructor(doc: Document = document) {
    this.root = doc.createElement('section');
    this.root.id = 'settingsScreen';
    this.root.setAttribute('aria-label', 'Settings');
    // Starts busy: nothing can change until the saved settings have been read.
    this.root.setAttribute('aria-busy', 'true');
    this.root.innerHTML = `
      <div class="settings-surface"><h1>Settings</h1>
      <p>Preferences for your workspace and clip playback.</p>
      <div class="settings-field">
        <label for="pipelinesRootPath">Pipelines top folder</label>
        <div class="settings-folder">
          <input id="pipelinesRootPath" readonly dir="ltr" placeholder="Not configured">
          <button id="choosePipelinesRoot" type="button" disabled>Choose folder…</button>
        </div>
        <p>This preference does not change the currently loaded folder.</p>
      </div>
      <div class="settings-field">
        <label class="settings-switch">
          <input id="singleClipAudioDefault" type="checkbox" role="switch" disabled> Clip audio by default
        </label>
        <p>Start newly opened single-clip playback with audio. Grid previews stay muted.</p>
      </div>
      <div class="settings-field">
        <label for="startupScreenId">Startup workspace</label>
        <select id="startupScreenId" disabled>
          <option value="gif-extraction">GIF Extraction</option>
          <option value="collection">Collection</option>
        </select>
      </div>
      <p id="settingsStatus" role="status" aria-live="polite"></p></div>`;
    const folder = this.root.querySelector('#pipelinesRootPath');
    const choose = this.root.querySelector('#choosePipelinesRoot');
    const audio = this.root.querySelector('#singleClipAudioDefault');
    const startupScreen = this.root.querySelector('#startupScreenId');
    const status = this.root.querySelector('#settingsStatus');
    if (!(folder instanceof HTMLInputElement) || !(choose instanceof HTMLButtonElement) || !(audio instanceof HTMLInputElement) || !(startupScreen instanceof HTMLSelectElement) || !(status instanceof HTMLElement)) throw new Error('Settings template is incomplete.');
    this.folder = folder; this.choose = choose; this.audio = audio; this.startupScreen = startupScreen; this.status = status;
    choose.addEventListener('click', () => this.events.emit('folderChooseRequested'));
    audio.addEventListener('change', () => {
      this.events.emit('preferenceChangeRequested', { singleClipAudioDefault: audio.checked });
    });
    startupScreen.addEventListener('change', () => {
      if (AppSettingsParser.isStartupScreenId(startupScreen.value)) {
        this.events.emit('preferenceChangeRequested', { startupScreenId: startupScreen.value });
      }
    });
  }

  on<TName extends keyof ISettingsScreenEvents>(name: TName, handler: EventHandler<ISettingsScreenEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  focusInitial(): void { this.folder.focus(); }

  // Changes are disabled while settings load or save, so two writes never overlap.
  render(settings: IAppSettings, busy: boolean): void {
    this.folder.value = settings.pipelinesRootPath ?? '';
    this.audio.checked = settings.singleClipAudioDefault;
    this.startupScreen.value = settings.startupScreenId;
    this.choose.disabled = busy;
    this.audio.disabled = busy;
    this.startupScreen.disabled = busy;
    this.root.setAttribute('aria-busy', String(busy));
  }

  showSaving(): void { this.status.textContent = 'Saving…'; }

  showSaved(): void { this.status.textContent = 'Saved'; }

  showProblem(message: string): void { this.status.textContent = message; }
}
