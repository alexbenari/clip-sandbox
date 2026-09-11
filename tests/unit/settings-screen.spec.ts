import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '../../src/ui/settings-screen.js';
import { AppSettingsService, type SettingsResult } from '../../src/app/app-settings-service.js';
import type { AppSettings } from '../../src/app/app-settings.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('Settings screen', () => {
  function setup() {
    const settings = { pipelinesRootPath: 'D:\\יצירה\\<clips>', singleClipAudioDefault: false };
    const port = { load: vi.fn(async () => ({ ok: true as const, settings })), save: vi.fn<[AppSettings], Promise<SettingsResult>>(async (value) => ({ ok: true, settings: value })), chooseRoot: vi.fn(async () => ({ kind: 'canceled' as const })) };
    const feedback = { progress: vi.fn(), success: vi.fn(), error: vi.fn() };
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
    expect(service.current).toEqual({ pipelinesRootPath: 'D:/new-root', singleClipAudioDefault: true });
    expect(audio.checked).toBe(true);
  });

});
