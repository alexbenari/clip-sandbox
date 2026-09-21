import { describe, expect, it, vi } from 'vitest';
import { ElectronAppSettingsService } from '../../src/adapters/electron/electron-app-settings-service.js';
import { DEFAULT_APP_SETTINGS } from '../../src/app/app-settings.js';
import { AppSettingsParser } from '../../src/app/app-settings.js';

describe('Electron settings boundary', () => {
  function setup() {
    const api = { loadAppSettings: vi.fn<[], Promise<unknown>>(async () => ({ ok: true, settings: DEFAULT_APP_SETTINGS })), saveAppSettings: vi.fn(async () => ({ ok: false, error: 'Disk full' })), choosePipelinesRoot: vi.fn<[], Promise<unknown>>(async () => ({ canceled: true })) };
    return { api, adapter: new ElectronAppSettingsService(api, new AppSettingsParser()) };
  }
  it('parses successful values and preserves persistence diagnostics', async () => {
    const { api, adapter } = setup();
    api.loadAppSettings.mockResolvedValue({ ok: true, settings: DEFAULT_APP_SETTINGS, warning: 'Recovered defaults', warningKind: 'recovered-defaults' });
    await expect(adapter.load()).resolves.toEqual({ ok: true, settings: DEFAULT_APP_SETTINGS, warning: 'Recovered defaults', warningKind: 'recovered-defaults' });
    await expect(adapter.save(DEFAULT_APP_SETTINGS)).resolves.toEqual({ ok: false, error: 'Disk full' });
    expect(api.saveAppSettings).toHaveBeenCalledWith(DEFAULT_APP_SETTINGS);
  });
  it('turns malformed payloads and rejected IPC into explicit failures', async () => {
    const { api, adapter } = setup();
    api.loadAppSettings.mockResolvedValue({ ok: true, settings: { singleClipAudioDefault: 'yes' } });
    expect((await adapter.load()).ok).toBe(false);
    api.loadAppSettings.mockResolvedValue({ ok: true, settings: DEFAULT_APP_SETTINGS, warning: 'Legacy warning without a kind' });
    await expect(adapter.load()).resolves.toEqual({ ok: false, error: 'Invalid settings response.' });
    api.loadAppSettings.mockRejectedValue(new Error('IPC unavailable'));
    await expect(adapter.load()).resolves.toEqual({ ok: false, error: 'IPC unavailable' });
  });
  it('distinguishes native cancellation, valid choices and invalid paths', async () => {
    const { api, adapter } = setup();
    await expect(adapter.chooseRoot()).resolves.toEqual({ kind: 'canceled' });
    api.choosePipelinesRoot.mockResolvedValue({ path: 'D:\\יצירה' });
    await expect(adapter.chooseRoot()).resolves.toEqual({ kind: 'chosen', path: 'D:\\יצירה' });
    api.choosePipelinesRoot.mockResolvedValue({ path: 'relative' });
    expect((await adapter.chooseRoot()).kind).toBe('error');
    api.choosePipelinesRoot.mockRejectedValue(new Error('Picker unavailable'));
    await expect(adapter.chooseRoot()).resolves.toEqual({ kind: 'error', error: 'Picker unavailable' });
  });
});
