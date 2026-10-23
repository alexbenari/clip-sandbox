import type { ActivityErrorOptions } from './activity-logger.js';
import type { ActivityReporter } from './activity-reporter.js';
import type { IAppSettings } from './app-settings.js';
import type { AppSettingsService, SettingsResult } from './app-settings-service.js';
import type { IScreenNavigation } from './collection-refinement-workflow.js';
import type { IEventSource } from './event-source.js';

export interface ISettingsView extends IEventSource<{
  folderChooseRequested: void;
  preferenceChangeRequested: Partial<IAppSettings>;
}> {
  render(settings: IAppSettings, busy: boolean): void;
  showSaving(): void;
  showSaved(): void;
  showProblem(message: string): void;
}

export interface IPipelineCatalogReload {
  load(): Promise<unknown>;
}

type SettingsDependencies = Readonly<{
  settings: Pick<AppSettingsService, 'current' | 'load' | 'save' | 'chooseRoot'>;
  view: ISettingsView;
  catalog: IPipelineCatalogReload | null;
  navigation: IScreenNavigation;
  reporter: Pick<ActivityReporter, 'progress' | 'success' | 'information' | 'failure'>;
}>;

const UNREADABLE_SETTINGS = 'Could not read settings. Defaults are in use.';
const UNREADABLE_SETTINGS_RECOVERY = 'Check access to your settings folder. You can still choose and save preferences.';

export class SettingsWorkflow {
  private busy = true;
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: SettingsDependencies) {
    this.unsubscribes = [
      deps.view.on('folderChooseRequested', () => { void this.chooseFolder(); }),
      deps.view.on('preferenceChangeRequested', change => { void this.save(change); }),
    ];
    this.render();
  }

  // Reads the saved settings, then switches to the saved startup screen unless the user has already moved.
  async loadAtStartup(): Promise<void> {
    const { settings, navigation, catalog } = this.deps;
    const initialScreenId = navigation.activeScreen.id;
    const result = await settings.load();
    this.busy = false;
    this.render();
    this.reportLoadProblem(result);
    void catalog?.load();
    if (navigation.activeScreen.id === initialScreenId && initialScreenId !== settings.current.startupScreenId) {
      navigation.activate(settings.current.startupScreenId);
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private reportLoadProblem(result: SettingsResult): void {
    if (result.ok === false) {
      this.reportProblem(UNREADABLE_SETTINGS, {
        affected: 'Load settings', recovery: UNREADABLE_SETTINGS_RECOVERY, technicalDetails: result.error,
      });
    } else if ('warning' in result && result.warningKind === 'ignored-fields') {
      // Every known preference still loaded, so this is a note rather than a problem.
      this.deps.reporter.information(result.warning);
    } else if ('warning' in result) {
      this.reportProblem(UNREADABLE_SETTINGS, {
        affected: 'Load settings', recovery: UNREADABLE_SETTINGS_RECOVERY, technicalDetails: result.warning,
      });
    }
  }

  private async chooseFolder(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const choice = await this.deps.settings.chooseRoot();
    this.busy = false;
    if (choice.kind === 'chosen') {
      await this.save({ pipelinesRootPath: choice.path });
      return;
    }
    this.render();
    if (choice.kind === 'error') this.reportProblem('Could not choose a folder.', {
      affected: 'Choose Pipelines top folder', recovery: 'Choose an accessible folder and try again.', technicalDetails: choice.error,
    });
  }

  private async save(change: Partial<IAppSettings>, retrying = false): Promise<SettingsResult | void> {
    const { settings, view, reporter } = this.deps;
    if (this.busy) {
      if (retrying) return { ok: false, error: 'Wait for the current settings change to finish, then retry.' };
      this.render();
      return;
    }
    // A retry reapplies only the failed preference, preserving later changes to other settings.
    const next = { ...settings.current, ...change };
    this.busy = true;
    view.render(next, true);
    view.showSaving();
    reporter.progress('Saving settings…');
    const result = await settings.save(next);
    this.busy = false;
    this.render();
    if (result.ok === false) {
      const message = 'Settings were not saved.';
      if (retrying) {
        view.showProblem(message);
        return result;
      }
      this.reportProblem(message, {
        affected: 'Save settings', recovery: 'Check available disk space and folder access, then retry.',
        technicalDetails: result.error, retry: () => this.save(change, true),
      });
    } else {
      view.showSaved();
      reporter.success('Settings saved');
      if ('pipelinesRootPath' in change) void this.deps.catalog?.load();
    }
    return result;
  }

  private reportProblem(message: string, options: ActivityErrorOptions): void {
    this.deps.view.showProblem(message);
    this.deps.reporter.failure(message, options);
  }

  private render(): void {
    this.deps.view.render(this.deps.settings.current, this.busy);
  }
}
