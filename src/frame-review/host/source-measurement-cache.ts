import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SourceInspector, type ISourceMeasurement } from './source-inspector.js';

export interface ISourceMeasurer {
  measure(sourcePath: string): Promise<ISourceMeasurement>;
  toolsVersion(): Promise<string>;
}

interface IFileVersion {
  readonly size: number;
  readonly mtimeMs: number;
}

interface IRememberedMeasurement extends IFileVersion {
  readonly measurement: Promise<ISourceMeasurement>;
  measured: ISourceMeasurement | null;
}

const SCHEMA_VERSION = 1;
const MAX_FILE_BYTES = 256 * 1024;

// Measuring a feature film takes seconds, so a measurement is reused while the file and the measuring tools are
// unchanged. Files are keyed by a hash of their path, so no movie path is stored.
export class SourceMeasurementCache {
  static readonly capacity = 64;
  private readonly entries = new Map<string, IRememberedMeasurement>();
  private entriesToolsVersion: string | null = null;
  private loading: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly measurer: ISourceMeasurer, private readonly cacheFile: string) {
    if (!path.isAbsolute(cacheFile)) throw new Error('Source measurement cache file must be an absolute path.');
  }

  async measurementOf(sourcePath: string): Promise<ISourceMeasurement> {
    if (!path.isAbsolute(sourcePath)) throw new Error('Movie source path must be absolute.');
    const resolved = path.resolve(sourcePath);
    const [{ size, mtimeMs }, toolsVersion] = await Promise.all([stat(resolved), this.measurer.toolsVersion()]);
    this.loading ??= this.load();
    await this.loading;
    this.forgetMeasurementsOfOtherTools(toolsVersion);
    const key = this.keyOf(resolved);
    const known = this.entries.get(key);
    const entry = known && known.size === size && known.mtimeMs === mtimeMs
      ? known : this.measured(key, resolved, { size, mtimeMs });
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > SourceMeasurementCache.capacity) this.entries.delete(this.entries.keys().next().value!);
    return entry.measurement;
  }

  // Resolves once every measurement taken so far is written.
  async flush(): Promise<void> {
    await Promise.allSettled([...this.entries.values()].map(entry => entry.measurement));
    await this.writing;
  }

  private forgetMeasurementsOfOtherTools(toolsVersion: string): void {
    if (toolsVersion === this.entriesToolsVersion) return;
    this.entries.clear();
    this.entriesToolsVersion = toolsVersion;
  }

  private measured(key: string, resolved: string, version: IFileVersion): IRememberedMeasurement {
    const entry: IRememberedMeasurement = { ...version, measurement: this.measurer.measure(resolved), measured: null };
    entry.measurement.then(
      measured => {
        entry.measured = measured;
        this.persist();
      },
      () => { if (this.entries.get(key) === entry) this.entries.delete(key); },
    );
    return entry;
  }

  private keyOf(resolvedPath: string): string {
    return createHash('sha256').update(resolvedPath).digest('hex');
  }

  // An unreadable cache only costs a new measurement, so it is ignored.
  private async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.cacheFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') this.warn('read-failed', error);
      return;
    }
    try {
      if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new Error('Source measurement cache is too large.');
      const { toolsVersion, entries } = this.parsedDocument(JSON.parse(text.replace(/^\uFEFF/, '')));
      for (const [key, entry] of entries) this.entries.set(key, entry);
      this.entriesToolsVersion = toolsVersion;
    } catch (error) {
      this.entries.clear();
      this.warn('unreadable', error);
    }
  }

  private parsedDocument(document: unknown): { toolsVersion: string | null; entries: Array<[string, IRememberedMeasurement]> } {
    const { schemaVersion, toolsVersion, measurements } = (document ?? {}) as Record<string, unknown>;
    if (schemaVersion !== SCHEMA_VERSION || !Array.isArray(measurements)) throw new Error('Source measurement cache schema is unsupported.');
    const entries = measurements.map((item: unknown): [string, IRememberedMeasurement] => {
      const { pathKey, size, mtimeMs, measurement } = (item ?? {}) as Record<string, unknown>;
      if (typeof pathKey !== 'string' || !/^[a-f0-9]{64}$/.test(pathKey)
        || !Number.isSafeInteger(size) || (size as number) < 0 || typeof mtimeMs !== 'number' || !Number.isFinite(mtimeMs)) {
        throw new Error('Source measurement cache entry is invalid.');
      }
      const measured = SourceInspector.parseMeasurement(measurement);
      return [pathKey, { size: size as number, mtimeMs, measurement: Promise.resolve(measured), measured }];
    });
    return { toolsVersion: typeof toolsVersion === 'string' ? toolsVersion : null, entries };
  }

  private persist(): void {
    this.writing = this.writing.then(() => this.write()).catch(error => this.warn('write-failed', error));
  }

  private async write(): Promise<void> {
    const measurements = [...this.entries]
      .filter(([, entry]) => entry.measured !== null)
      .map(([pathKey, { size, mtimeMs, measured }]) => ({ pathKey, size, mtimeMs, measurement: measured }));
    const folder = path.dirname(this.cacheFile);
    const temporary = path.join(folder, `.${path.basename(this.cacheFile)}.${randomUUID()}.tmp`);
    await mkdir(folder, { recursive: true });
    try {
      const document = { schemaVersion: SCHEMA_VERSION, toolsVersion: this.entriesToolsVersion, measurements };
      await writeFile(temporary, `${JSON.stringify(document)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, this.cacheFile);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private warn(reason: string, error: unknown): void {
    console.warn(`[frame-review] source-measurement-cache-${reason}`, { kind: error instanceof Error ? error.name : 'unknown' });
  }
}
