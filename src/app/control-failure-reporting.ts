import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { IEventSource } from './event-source.js';

export interface IVideoMetadataFailures extends IEventSource<{ metadataFailed: Readonly<{ clip: Readonly<{ name: string }>; error: unknown }> }> {}

export interface IPipelineCatalogFailures extends IEventSource<{ failed: Readonly<{ message: string; error: unknown }>; loaded: void }> {}

type ControlFailureReportingDependencies = Readonly<{
  grid: IVideoMetadataFailures;
  pipelineCatalog: IPipelineCatalogFailures | null;
  reporter: Pick<ActivityReporter, 'failure' | 'resolveFailure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logVideoMetadataFailure' | 'logRuntimeError'>;
}>;

// Controls report what failed as events; this decides where each failure is reported.
export class ControlFailureReporting {
  private readonly unsubscribes: (() => void)[];
  private readonly unresolvedCatalogFailures: string[] = [];

  constructor(private readonly reporting: ControlFailureReportingDependencies) {
    this.unsubscribes = [
      reporting.grid.on('metadataFailed', ({ clip, error }) => {
        void reporting.diagnostics.logVideoMetadataFailure({ filename: clip?.name || '', error });
      }),
      ...(reporting.pipelineCatalog
        ? [
          reporting.pipelineCatalog.on('failed', failure => this.reportCatalogFailure(failure)),
          reporting.pipelineCatalog.on('loaded', () => this.resolveCatalogFailures()),
        ]
        : []),
    ];
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private reportCatalogFailure({ message, error }: Readonly<{ message: string; error: unknown }>): void {
    const { reporter, diagnostics } = this.reporting;
    this.unresolvedCatalogFailures.push(reporter.failure(message, {
      affected: 'Pipelines',
      recovery: 'Check the Pipelines top folder in Settings, then try again.',
      technicalDetails: reporter.technicalDetailsOf(error),
    }));
    void diagnostics.logRuntimeError(message, error);
  }

  private resolveCatalogFailures(): void {
    for (const failureId of this.unresolvedCatalogFailures.splice(0)) this.reporting.reporter.resolveFailure(failureId);
  }
}
