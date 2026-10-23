import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '../../src/ui/settings-screen.js';
import { SettingsWorkflow } from '../../src/app/settings-workflow.js';
import { AppSettingsService, type RootChoice, type SettingsResult } from '../../src/app/app-settings-service.js';
import type { IAppSettings } from '../../src/app/app-settings.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('Settings workflow and screen', () => {
  function setup() {
    const settings: IAppSettings = { pipelinesRootPath: 'D:\\יצירה\\<clips>', singleClipAudioDefault: false, startupScreenId: 'gif-extraction' };
    const port = { load: vi.fn<[], Promise<SettingsResult>>(async () => ({ ok: true, settings })), save: vi.fn<[IAppSettings], Promise<SettingsResult>>(async (value) => ({ ok: true, settings: value })), chooseRoot: vi.fn<[], Promise<RootChoice>>(async () => ({ kind: 'canceled' })) };
    const reporter = { progress: vi.fn(), success: vi.fn(), failure: vi.fn(), information: vi.fn() };
    const catalog = { load: vi.fn(async () => undefined) };
    const navigation = { activeScreen: { id: 'gif-extraction' }, activate: vi.fn((id: string) => { navigation.activeScreen = { id }; }) };
    const service = new AppSettingsService(port);
    const screen = new SettingsScreen();
    const workflow = new SettingsWorkflow({ settings: service, view: screen, catalog, navigation, reporter });
    document.body.append(screen.root);
    const audio = screen.root.querySelector<HTMLInputElement>('#singleClipAudioDefault')!;
    const choose = screen.root.querySelector<HTMLButtonElement>('#choosePipelinesRoot')!;
    return { screen, workflow, audio, choose, port, reporter, catalog, navigation, settings, service };
  }

  it('has no command bar, renders paths literally and focuses the labeled path', async () => {
    const { screen, workflow, audio, settings } = setup();
    expect(audio.disabled).toBe(true);
    await workflow.loadAtStartup();
    expect(screen.commands).toBeNull();
    const folder = screen.root.querySelector<HTMLInputElement>('#pipelinesRootPath')!;
    expect(folder.value).toBe(settings.pipelinesRootPath);
    expect(screen.root.querySelector('clips')).toBeNull();
    screen.focusInitial();
    expect(document.activeElement).toBe(folder);
    expect(audio.disabled).toBe(false);
  });

  it('starts with changes disabled before any workflow drives it', () => {
    const screen = new SettingsScreen();
    expect(screen.root.getAttribute('aria-busy')).toBe('true');
    expect(screen.root.querySelector<HTMLInputElement>('#singleClipAudioDefault')?.disabled).toBe(true);
    expect(screen.root.querySelector<HTMLButtonElement>('#choosePipelinesRoot')?.disabled).toBe(true);
  });

  it('does not save a canceled folder selection', async () => {
    const { workflow, choose, port } = setup();
    await workflow.loadAtStartup();
    choose.click();
    await vi.waitFor(() => expect(choose.disabled).toBe(false));
    expect(port.save).not.toHaveBeenCalled();
  });

  it('refreshes the pipeline catalog only after a selected root has been saved', async () => {
    const { workflow, choose, port, catalog } = setup();
    port.chooseRoot.mockResolvedValueOnce({ kind: 'chosen', path: 'C:/pipelines' });
    await workflow.loadAtStartup();
    catalog.load.mockClear();

    choose.click();

    await vi.waitFor(() => expect(catalog.load).toHaveBeenCalledOnce());
    expect(port.save).toHaveBeenCalledWith(expect.objectContaining({ pipelinesRootPath: 'C:/pipelines' }));
  });

  it('notes the ignored saved field names in Activity without reporting an error', async () => {
    const { screen, workflow, port, reporter } = setup();
    port.load.mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: true, startupScreenId: 'collection' }, warningKind: 'ignored-fields', ignoredFields: ['version', 'theme'] });

    await workflow.loadAtStartup();

    expect(reporter.information).toHaveBeenCalledWith('Ignored unknown settings: version, theme');
    expect(reporter.failure).not.toHaveBeenCalled();
    expect(screen.root.querySelector('#settingsStatus')?.textContent).toBe('');
  });

  it('reports unreadable saved settings as an error, because defaults replaced them', async () => {
    const { screen, workflow, port, reporter } = setup();
    port.load.mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' }, warning: 'Could not load settings: Unexpected token', warningKind: 'recovered-defaults' });

    await workflow.loadAtStartup();

    expect(screen.root.querySelector('#settingsStatus')?.textContent).toBe('Could not read settings. Defaults are in use.');
    expect(reporter.failure).toHaveBeenCalledWith('Could not read settings. Defaults are in use.', expect.objectContaining({
      affected: 'Load settings',
      technicalDetails: 'Could not load settings: Unexpected token',
    }));
  });

  it('disables changes while saving, restores a failed change and permits recovery', async () => {
    const { workflow, audio, choose, port, reporter } = setup();
    await workflow.loadAtStartup();
    let finish!: (result: SettingsResult) => void;
    port.save.mockImplementationOnce(() => new Promise<SettingsResult>(resolve => { finish = resolve; }));
    audio.click();
    expect(audio.disabled).toBe(true);
    expect(audio.checked).toBe(true);
    expect(choose.disabled).toBe(true);
    finish({ ok: false, error: 'Disk full' });
    await vi.waitFor(() => expect(audio.disabled).toBe(false));
    expect(audio.checked).toBe(false);
    expect(reporter.failure).toHaveBeenCalledWith('Settings were not saved.', expect.objectContaining({ technicalDetails: 'Disk full', retry: expect.any(Function) }));
    audio.click();
    await vi.waitFor(() => expect(audio.disabled).toBe(false));
    expect(audio.checked).toBe(true);
    expect(reporter.success).toHaveBeenCalledWith('Settings saved');
  });

  it('retries only the failed preference and reports another failure to the existing entry', async () => {
    const { workflow, audio, port, reporter, service } = setup();
    await workflow.loadAtStartup();
    port.save.mockResolvedValueOnce({ ok: false, error: 'Disk full' });
    audio.click();
    await vi.waitFor(() => expect(reporter.failure).toHaveBeenCalledOnce());
    const retry = reporter.failure.mock.calls[0][1].retry;
    port.save.mockResolvedValueOnce({ ok: false, error: 'Still full' });
    await expect(retry()).resolves.toEqual({ ok: false, error: 'Still full' });
    expect(reporter.failure).toHaveBeenCalledOnce();
    await service.save({ ...service.current, pipelinesRootPath: 'D:/new-root' });
    await retry();
    expect(service.current).toEqual({ pipelinesRootPath: 'D:/new-root', singleClipAudioDefault: true, startupScreenId: 'gif-extraction' });
    expect(audio.checked).toBe(true);
  });

  it('opens the saved startup screen and loads the pipeline catalog once settings are read', async () => {
    const { workflow, port, catalog, navigation } = setup();
    port.load.mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'collection' } });

    await workflow.loadAtStartup();

    expect(navigation.activate).toHaveBeenCalledWith('collection');
    expect(catalog.load).toHaveBeenCalledOnce();
  });

  it('stays where the user went while settings were loading', async () => {
    const { workflow, port, navigation } = setup();
    let finish!: (result: SettingsResult) => void;
    port.load.mockImplementationOnce(() => new Promise<SettingsResult>(resolve => { finish = resolve; }));

    const loading = workflow.loadAtStartup();
    navigation.activeScreen = { id: 'settings' };
    finish({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'collection' } });
    await loading;

    expect(navigation.activate).not.toHaveBeenCalled();
  });

  it('ignores screen changes after it is disposed', async () => {
    const { workflow, audio, port } = setup();
    await workflow.loadAtStartup();
    workflow.dispose();

    audio.click();

    expect(port.save).not.toHaveBeenCalled();
  });
});

describe('AppSettingsService readiness', () => {
  it('reports itself loaded after the first load, even when reading fails', async () => {
    const service = new AppSettingsService({
      load: vi.fn(async () => { throw new Error('unreadable'); }),
      save: vi.fn(), chooseRoot: vi.fn(),
    });
    let loaded = false;
    void service.whenLoaded().then(() => { loaded = true; });
    await Promise.resolve();
    expect(loaded).toBe(false);

    await expect(service.load()).rejects.toThrow('unreadable');

    await vi.waitFor(() => expect(loaded).toBe(true));
  });
});
