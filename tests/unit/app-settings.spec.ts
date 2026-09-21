import { describe, expect, it, vi } from 'vitest';
import { AppSettingsParser, DEFAULT_APP_SETTINGS } from '../../src/app/app-settings.js';
import { AppSettingsService } from '../../src/app/app-settings-service.js';

describe('application settings', () => {
  const parser = new AppSettingsParser();
  it('defaults to GIF Extraction, no root, and muted single-clip playback', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({ pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' });
    expect(Object.isFrozen(DEFAULT_APP_SETTINGS)).toBe(true);
  });
  it('preserves absolute Unicode paths and rejects malformed settings', () => {
    const settings = { pipelinesRootPath: 'D:\\יצירה\\clips 🎞', singleClipAudioDefault: true, startupScreenId: 'collection' as const };
    expect(parser.parse(settings)).toEqual(settings);
    expect(Object.isFrozen(parser.parse(settings))).toBe(true);
    for (const value of [null, {}, { ...settings, pipelinesRootPath: 'relative' }, { ...settings, pipelinesRootPath: 'D:\\bad\0' }, { ...settings, singleClipAudioDefault: 'true' }, { ...settings, startupScreenId: 'settings' }]) {
      expect(parser.parse(value)).toBeNull();
    }
  });
  it('uses the default startup workspace when the optional value is absent', () => {
    expect(parser.parse({ pipelinesRootPath: null, singleClipAudioDefault: false })).toEqual(DEFAULT_APP_SETTINGS);
  });
  it('retains the previous committed value when saving fails', async () => {
    const saved = { pipelinesRootPath: 'D:\\clips', singleClipAudioDefault: true, startupScreenId: 'collection' as const };
    const port = { load: vi.fn(async () => ({ ok: true as const, settings: saved })), save: vi.fn(async () => ({ ok: false as const, error: 'Disk full' })), chooseRoot: vi.fn(async () => ({ kind: 'canceled' as const })) };
    const service = new AppSettingsService(port);
    await service.load();
    await service.save(DEFAULT_APP_SETTINGS);
    expect(service.current).toEqual(saved);
  });
});
