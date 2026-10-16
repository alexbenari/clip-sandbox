// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { ClipSource } from '../../src/domain/clip-source.js';

describe('ClipSource', () => {
  it('keeps a trimmed name, media address and desktop path', () => {
    const source = ClipSource.create({ name: ' alpha.mp4 ', mediaSource: ' file:///C:/clips/alpha.mp4 ', desktopPath: ' C:/clips/alpha.mp4 ' });

    expect(source.name).toBe('alpha.mp4');
    expect(source.mediaSource).toBe('file:///C:/clips/alpha.mp4');
    expect(source.desktopPath).toBe('C:/clips/alpha.mp4');
  });

  it('records a missing or blank desktop path as none', () => {
    expect(ClipSource.create({ name: 'alpha.mp4', mediaSource: 'file:///a.mp4' }).desktopPath).toBeNull();
    expect(ClipSource.create({ name: 'alpha.mp4', mediaSource: 'file:///a.mp4', desktopPath: '  ' }).desktopPath).toBeNull();
  });

  it('refuses a source without a name or without a media address', () => {
    expect(() => ClipSource.create({ name: ' ', mediaSource: 'file:///a.mp4' })).toThrow('Clip source name is required.');
    expect(() => ClipSource.create({ name: 'alpha.mp4', mediaSource: '' })).toThrow('Clip source media address is required.');
  });

  it('cannot be changed after it is created', () => {
    const source = ClipSource.create({ name: 'alpha.mp4', mediaSource: 'file:///a.mp4' });

    expect(Object.isFrozen(source)).toBe(true);
    expect(Reflect.set(source, 'name', 'bravo.mp4')).toBe(false);
    expect(source.name).toBe('alpha.mp4');
  });
});
