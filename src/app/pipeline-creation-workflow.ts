import type { ActivityReporter } from './activity-reporter.js';
import type { AppDiagnostics } from './app-diagnostics.js';
import type { AppText } from './app-text.js';
import type { IEventSource } from './event-source.js';
import type { IPipelineCreationService, PipelineCreationProblem, PipelineCreationRequest } from './pipeline-catalog.js';

export interface IPipelineCreationCatalog extends IEventSource<{ createRequested: PipelineCreationRequest }> {
  endCreate(): void;
  showCreateProblem(problem: PipelineCreationProblem): void;
  load(): Promise<void>;
  focusPipeline(name: string): boolean;
}

type PipelineCreationDependencies = Readonly<{
  catalog: IPipelineCreationCatalog;
  pipelines: IPipelineCreationService;
  appText: Pick<AppText, 'pipelineCreatedText' | 'pipelineCreationRecoveryText'>;
  reporter: Pick<ActivityReporter, 'success' | 'failure' | 'technicalDetailsOf'>;
  diagnostics: Pick<AppDiagnostics, 'logRuntimeError'>;
}>;

export class PipelineCreationWorkflow {
  private readonly unsubscribes: (() => void)[];

  constructor(private readonly deps: PipelineCreationDependencies) {
    this.unsubscribes = [deps.catalog.on('createRequested', ({ name }) => { void this.create(name); })];
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  private async create(name: string): Promise<void> {
    const { catalog, pipelines, appText, reporter } = this.deps;
    let createdName: string;
    try {
      const outcome = await pipelines.createPipeline(name);
      if (outcome.kind === 'refused') {
        catalog.showCreateProblem(outcome.reason);
        return;
      }
      createdName = outcome.name;
    } catch (error) {
      catalog.showCreateProblem('failed');
      this.reportFailure(name, error);
      return;
    }
    catalog.endCreate();
    await catalog.load();
    catalog.focusPipeline(createdName);
    reporter.success(appText.pipelineCreatedText(createdName));
  }

  private reportFailure(name: string, error: unknown): void {
    const { reporter, diagnostics, appText } = this.deps;
    const problem = `Could not create pipeline ${name}.`;
    reporter.failure(problem, {
      affected: name,
      recovery: appText.pipelineCreationRecoveryText(),
      technicalDetails: reporter.technicalDetailsOf(error),
    });
    void diagnostics.logRuntimeError(problem, error);
  }
}
