import { describe, expect, it } from 'vitest';

import { parseDependencyManifest } from '../../src/tooling/dependency-manifest.js';

const validManifest = {
  schemaVersion: 1,
  dependencies: {
    engine: {
      kind: 'binaryArchive',
      version: '4.0.0-dev-12345678',
      commit: '12345678',
      url: 'https://downloads.example.invalid/engine.zip',
      sourceUrl: 'https://source.example.invalid/engine/12345678',
      sha512: 'a'.repeat(128),
      license: 'LGPL-2.1-or-later',
    },
  },
  toolchain: {
    libvlcGateVisualStudioMinimumMajorVersion: 15,
    bestSourceCompiler: 'test-g++ 1.0',
    bestSourceTriplet: 'x64-test-release',
    bestSourceFfmpegX86Assembly: true,
    requiredComponent: 'Example.Component',
    cmakeMinimum: '3.25',
    nodeMinimum: '22.0.0',
  },
};

describe('parseDependencyManifest', () => {
  it('accepts an immutable binary pin with source and license evidence', () => {
    const parsed = parseDependencyManifest(validManifest);

    expect(parsed.dependencies.engine.version).toBe('4.0.0-dev-12345678');
  });

  it('rejects a mutable latest version', () => {
    const candidate = structuredClone(validManifest);
    candidate.dependencies.engine.version = 'latest';

    expect(() => parseDependencyManifest(candidate)).toThrow('immutable version');
  });

  it('rejects a binary archive without a complete SHA-512', () => {
    const candidate = structuredClone(validManifest);
    candidate.dependencies.engine.sha512 = 'abc123';

    expect(() => parseDependencyManifest(candidate)).toThrow('128-digit SHA-512');
  });

  it('rejects a non-HTTPS download URL', () => {
    const candidate = structuredClone(validManifest);
    candidate.dependencies.engine.url = 'http://downloads.example.invalid/engine.zip';

    expect(() => parseDependencyManifest(candidate)).toThrow('HTTPS URL');
  });
});
