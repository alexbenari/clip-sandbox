import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '../../src/ui/settings-screen.js';
import { AppSettingsService, type RootChoice, type SettingsResult } from '../../src/app/app-settings-service.js';
import type { IAppSettings } from '../../src/app/app-settings.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('Settings screen', () => {
  function setup(pipelinesRootChanged?: () => void) {
    const settings: IAppSettings = { pipelinesRootPath: 'D:\\יצירה\\<clips>', singleClipAudioDefault: false, startupScreenId: 'gif-extraction' };
    const port = { load: vi.fn<[], Promise<SettingsResult>>(async () => ({ ok: true, settings })), save: vi.fn<[IAppSettings], Promise<SettingsResult>>(async (value) => ({ ok: true, settings: value })), chooseRoot: vi.fn<[], Promise<RootChoice>>(async () => ({ kind: 'canceled' })) };
    const feedback = { progress: vi.fn(), success: vi.fn(), error: vi.fn(), pipelinesRootChanged };
    const service = new AppSettingsService(port);
    const screen = new SettingsScreen(service, feedback);
    document.body.append(screen.root);
    const audio = screen.root.querySelector<HTMLInputElement>('#singleClipAudioDefault')!;
    const choose = screen.root.querySelector<HTMLButtonElement>('#choosePipelinesRoot')!;
    return { screen, audio, choose, port, feedback, settings, service };
  }
  it('has no command bar, renders paths literally and focuses the labeled path', async () => {
    const { screen, audio, settings } = setup();
    expect(audio.disabled).toBe(true);
    await screen.load();
    expect(screen.commands).toBeNull();
    const folder = screen.root.querySelector<HTMLInputElement>('#pipelinesRootPath')!;
    expect(folder.value).toBe(settings.pipelinesRootPath);
    expect(screen.root.querySelector('clips')).toBeNull();
    screen.focusInitial();
    expect(document.activeElement).toBe(folder);
    expect(audio.disabled).toBe(false);
  });
  it('does not save a canceled folder selection', async () => {
    const { screen, choose, port } = setup();
    await screen.load();
    choose.click();
    await vi.waitFor(() => expect(choose.disabled).toBe(false));
    expect(port.save).not.toHaveBeenCalled();
  });
  it('refreshes the pipeline catalog only after a selected root has been saved', async () => {
    const pipelinesRootChanged = vi.fn();
    const { screen, choose, port } = setup(pipelinesRootChanged);
    port.chooseRoot.mockResolvedValueOnce({ kind: 'chosen', path: 'C:/pipelines' });

    await screen.load();
    choose.click();

    await vi.waitFor(() => expect(pipelinesRootChanged).toHaveBeenCalledOnce());
    expect(port.save).toHaveBeenCalledWith(expect.objectContaining({ pipelinesRootPath: 'C:/pipelines' }));
  });
  it('reports ignored saved fields without claiming that all settings were reset', async () => {
    const { screen, port, feedback } = setup();
    port.load.mockResolvedValueOnce({ ok: true, settings: { pipelinesRootPath: null, singleClipAudioDefault: true, startupScreenId: 'collection' }, warning: 'Ignored unrecognized saved settings field: obsoletePreference.', warningKind: 'ignored-fields' });

    await screen.load();

    expect(screen.root.querySelector('#settingsStatus')?.textContent).toBe('Some saved settings were ignored.');
    expect(feedback.error).toHaveBeenCalledWith('Some saved settings were ignored.', expect.objectContaining({
      affected: 'Load settings',
      technicalDetails: 'Ignored unrecognized saved settings field: obsoletePreference.',
    }));
  });
  it('disables changes while saving, restores a failed change and permits recovery', async () => {
    const { screen, audio, choose, port, feedback } = setup();
    await screen.load();
    let finish!: (result: SettingsResult) => void;
    port.save.mockImplementationOnce(() => new Promise<SettingsResult>(resolve => { finish = resolve; }));
    audio.click();
    expect(audio.disabled).toBe(true);
    expect(audio.checked).toBe(true);
    expect(choose.disabled).toBe(true);
    finish({ ok: false, error: 'Disk full' });
    await vi.waitFor(() => expect(audio.disabled).toBe(false));
    expect(audio.checked).toBe(false);
    expect(feedback.error).toHaveBeenCalledWith('Settings were not saved.', expect.objectContaining({ technicalDetails: 'Disk full', retry: expect.any(Function) }));
    audio.click();
    await vi.waitFor(() => expect(audio.disabled).toBe(false));
    expect(audio.checked).toBe(true);
    expect(feedback.success).toHaveBeenCalledWith('Settings saved');
  });
  it('retries only the failed preference and reports another failure to the existing entry', async () => {
    const { screen, audio, port, feedback, service } = setup();
    await screen.load();
    port.save.mockResolvedValueOnce({ ok: false, error: 'Disk full' });
    audio.click();
    await vi.waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    const retry = feedback.error.mock.calls[0][1].retry;
    port.save.mockResolvedValueOnce({ ok: false, error: 'Still full' });
    await expect(retry()).resolves.toEqual({ ok: false, error: 'Still full' });
    expect(feedback.error).toHaveBeenCalledOnce();
    await service.save({ ...service.current, pipelinesRootPath: 'D:/new-root' });
    await retry();
    expect(service.current).toEqual({ pipelinesRootPath: 'D:/new-root', singleClipAudioDefault: true, startupScreenId: 'gif-extraction' });
    expect(audio.checked).toBe(true);
  });

});
