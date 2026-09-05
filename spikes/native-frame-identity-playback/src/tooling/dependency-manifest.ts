import { readFile } from 'node:fs/promises';

export type DependencyKind = 'binaryArchive' | 'gitSource' | 'pythonTool';

export interface DependencyPin {
  readonly kind: DependencyKind;
  readonly version: string;
  readonly commit?: string;
  readonly url?: string;
  readonly sha512?: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly package?: string;
  readonly conditionalMilestone?: number;
}

export interface DependencyManifest {
  readonly schemaVersion: 1;
  readonly dependencies: Readonly<Record<string, DependencyPin>>;
  readonly toolchain: {
    readonly libvlcGateVisualStudioMinimumMajorVersion: number;
    readonly bestSourceCompiler: string;
    readonly bestSourceTriplet: string;
    readonly bestSourceFfmpegX86Assembly: boolean;
    readonly requiredComponent: string;
    readonly cmakeMinimum: string;
    readonly nodeMinimum: string;
  };
}

const immutableVersionPattern = /^(?!latest$)(?!main$)(?!master$).+/i;
const commitPattern = /^[0-9a-f]{8,40}$/i;
const sha512Pattern = /^[0-9a-f]{128}$/i;

export async function loadDependencyManifest(path: string): Promise<DependencyManifest> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  return parseDependencyManifest(parsed);
}

export function parseDependencyManifest(value: unknown): DependencyManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.dependencies)) {
    throw new Error('Dependency manifest must use schemaVersion 1 and define dependencies.');
  }

  for (const [name, candidate] of Object.entries(value.dependencies)) {
    validateDependency(name, candidate);
  }

  if (!isRecord(value.toolchain)) {
    throw new Error('Dependency manifest must define its toolchain requirements.');
  }

  return value as unknown as DependencyManifest;
}

function validateDependency(name: string, value: unknown): void {
  if (!isRecord(value)) {
    throw new Error(`Dependency ${name} must be an object.`);
  }

  if (typeof value.version !== 'string' || !immutableVersionPattern.test(value.version)) {
    throw new Error(`Dependency ${name} must use an immutable version.`);
  }

  if (typeof value.sourceUrl !== 'string' || !isHttpsUrl(value.sourceUrl)) {
    throw new Error(`Dependency ${name} must provide an HTTPS sourceUrl.`);
  }

  if (typeof value.license !== 'string' || value.license.length === 0) {
    throw new Error(`Dependency ${name} must declare a license.`);
  }

  if (value.commit !== undefined &&
      (typeof value.commit !== 'string' || !commitPattern.test(value.commit))) {
    throw new Error(`Dependency ${name} has an invalid commit pin.`);
  }

  if (value.kind === 'binaryArchive') {
    if (typeof value.url !== 'string' || !isHttpsUrl(value.url)) {
      throw new Error(`Binary dependency ${name} must provide an HTTPS URL.`);
    }
    if (typeof value.sha512 !== 'string' || !sha512Pattern.test(value.sha512)) {
      throw new Error(`Binary dependency ${name} must provide a 128-digit SHA-512.`);
    }
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
