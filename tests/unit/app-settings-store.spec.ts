// @ts-nocheck
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsStore } from '../../electron/app-settings-store.cjs';

const temporaryDirectories: string[] = [];

async function createDirectory() {
  const directory = await realFs.mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-settings-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await realFs.rm(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('AppSettingsStore', () => {
  it('defaults when the settings file is absent', async () => {
    const store = new AppSettingsStore(await createDirectory());

    await expect(store.load()).resolves.toEqual({
      ok: true,
      settings: { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' },
    });
  });

  it('round trips a Unicode Windows path as versionless settings without a BOM', async () => {
    const directory = await createDirectory();
    const settings = { pipelinesRootPath: 'C:\\יצירה\\clips 🎞', singleClipAudioDefault: true, startupScreenId: 'collection' };
    const store = new AppSettingsStore(directory);

    await expect(store.save(settings)).resolves.toEqual({ ok: true, settings });
    const raw = await realFs.readFile(path.join(directory, 'app-settings.json'));
    expect(raw[0]).not.toBe(0xef);
    expect(JSON.parse(raw.toString('utf8'))).toEqual(settings);
    await expect(new AppSettingsStore(directory).load()).resolves.toEqual({ ok: true, settings });
  });

  it('accepts one leading BOM while reading', async () => {
    const directory = await createDirectory();
    await realFs.writeFile(path.join(directory, 'app-settings.json'), '\ufeff{"pipelinesRootPath":null,"singleClipAudioDefault":true,"startupScreenId":"collection"}', 'utf8');

    await expect(new AppSettingsStore(directory).load()).resolves.toEqual({
      ok: true,
      settings: { pipelinesRootPath: null, singleClipAudioDefault: true, startupScreenId: 'collection' },
    });
  });

  it('derives known settings, ignores unknown fields, and reports the ignored fields', async () => {
    const directory = await createDirectory();
    await realFs.writeFile(path.join(directory, 'app-settings.json'), '{"pipelinesRootPath":null,"singleClipAudioDefault":true,"startupScreenId":"collection","obsoletePreference":true,"futureSettings":{"theme":"night"}}', 'utf8');

    await expect(new AppSettingsStore(directory).load()).resolves.toEqual({
      ok: true,
      settings: { pipelinesRootPath: null, singleClipAudioDefault: true, startupScreenId: 'collection' },
      warning: 'Ignored unrecognized saved settings fields: obsoletePreference, futureSettings.',
      warningKind: 'ignored-fields',
    });
  });

  it('does not persist unknown fields supplied by the renderer', async () => {
    const directory = await createDirectory();
    const settings = { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' };

    await expect(new AppSettingsStore(directory).save({ ...settings, staleField: 'ignore me' })).resolves.toEqual({ ok: true, settings });
    await expect(realFs.readFile(path.join(directory, 'app-settings.json'), 'utf8')).resolves.toBe(`${JSON.stringify(settings)}\n`);
  });

  it('defaults with a warning for malformed settings', async () => {
    const directory = await createDirectory();
    const filePath = path.join(directory, 'app-settings.json');
    await realFs.writeFile(filePath, '[]', 'utf8');

    const result = await new AppSettingsStore(directory).load();
    expect(result.ok).toBe(true);
    expect(result.settings).toEqual({ pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' });
    expect(result.warning).toEqual(expect.any(String));
    expect(result.warningKind).toBe('recovered-defaults');

    await realFs.writeFile(filePath, '{broken', 'utf8');
    expect((await new AppSettingsStore(directory).load()).warning).toEqual(expect.any(String));
  });

  it('rejects invalid payloads before filesystem writes and preserves the old file', async () => {
    const directory = await createDirectory();
    const store = new AppSettingsStore(directory);
    const original = { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' };
    await store.save(original);
    const writeFile = vi.fn(realFs.writeFile.bind(realFs));
    const invalidStore = new AppSettingsStore(directory, { ...realFs, writeFile });

    await expect(invalidStore.save({ pipelinesRootPath: 'relative', singleClipAudioDefault: true, startupScreenId: 'gif-extraction' })).resolves.toEqual({
      ok: false,
      error: expect.any(String),
    });
    expect(writeFile).not.toHaveBeenCalled();
    await expect(store.load()).resolves.toEqual({ ok: true, settings: original });
  });

  it('preserves the old file when rename fails', async () => {
    const directory = await createDirectory();
    const original = { pipelinesRootPath: null, singleClipAudioDefault: false, startupScreenId: 'gif-extraction' };
    const store = new AppSettingsStore(directory);
    await store.save(original);
    const failingFs = {
      ...realFs,
      rename: vi.fn(async () => { throw new Error('rename failed'); }),
    };

    await expect(new AppSettingsStore(directory, failingFs).save({
      pipelinesRootPath: 'C:\\clips', singleClipAudioDefault: true, startupScreenId: 'collection',
    })).resolves.toEqual({ ok: false, error: 'rename failed' });
    await expect(store.load()).resolves.toEqual({ ok: true, settings: original });
  });

  it('serializes concurrent saves so the newest queued value is persisted last', async () => {
    const directory = await createDirectory();
    let releaseFirstWrite;
    const firstWriteStarted = new Promise((resolve) => { releaseFirstWrite = resolve; });
    const writeFile = vi.fn(async (...args) => {
      if (writeFile.mock.calls.length === 1) {
        releaseFirstWrite();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return realFs.writeFile(...args);
    });
    const store = new AppSettingsStore(directory, { ...realFs, writeFile });
    const first = store.save({ pipelinesRootPath: 'C:\\first', singleClipAudioDefault: false, startupScreenId: 'gif-extraction' });
    await firstWriteStarted;
    const second = store.save({ pipelinesRootPath: 'C:\\second', singleClipAudioDefault: true, startupScreenId: 'collection' });

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    await expect(store.load()).resolves.toEqual({
      ok: true,
      settings: { pipelinesRootPath: 'C:\\second', singleClipAudioDefault: true, startupScreenId: 'collection' },
    });
  });
});
