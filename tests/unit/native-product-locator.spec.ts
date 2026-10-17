import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('shared native product locator', () => {
  it('resolves development FFmpeg and FFprobe from the frame-review manifest', () => {
    const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
    const existsSync = vi.fn(() => true);
    const readFileSync = vi.fn(() => JSON.stringify({
      ffmpeg: { path: 'D:\\products\\ffmpeg.exe' },
      ffprobe: { path: 'D:\\products\\ffprobe.exe' },
    }));
    const locator = new NativeProductLocator({
      projectFolder: 'D:\\repo',
      packaged: false,
      existsSync,
      readFileSync,
    });

    expect(locator.ffmpeg()).toBe(path.resolve('D:\\products\\ffmpeg.exe'));
    expect(locator.ffprobe()).toBe(path.resolve('D:\\products\\ffprobe.exe'));
  });

  it('reads a manifest that the PowerShell bootstrap wrote with a byte-order mark', () => {
    const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
    const locator = new NativeProductLocator({
      projectFolder: 'D:\\repo',
      packaged: false,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => `\uFEFF${JSON.stringify({ ffmpeg: { path: 'D:\\products\\ffmpeg.exe' } })}`),
    });

    expect(locator.ffmpeg()).toBe(path.resolve('D:\\products\\ffmpeg.exe'));
  });

  it('reports the recovery commands when a packaged product is missing', () => {
    const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');
    const locator = new NativeProductLocator({
      projectFolder: 'D:\\repo',
      resourcesPath: 'D:\\app\\resources',
      packaged: true,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    });

    expect(() => locator.ffmpeg()).toThrow(/frame-review:bootstrap.*frame-review:build/i);
  });
});
