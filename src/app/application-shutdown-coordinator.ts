interface IApplicationShutdownCoordinatorOptions {
  readonly stopActions: () => void;
  readonly disposeWorkflow: () => Promise<void>;
  readonly destroyControls: () => void;
  readonly reportFailure?: (error: unknown) => void;
}

export class ApplicationShutdownCoordinator {
  private cleanup: Promise<void> | null = null;

  constructor(private readonly options: IApplicationShutdownCoordinatorOptions) {}

  begin(): Promise<void> {
    if (this.cleanup) return this.cleanup;

    try {
      this.options.stopActions();
    } catch (error) {
      this.reportFailure(error);
    }
    let workflowDisposal: Promise<void>;
    try {
      workflowDisposal = this.options.disposeWorkflow();
    } catch (error) {
      workflowDisposal = Promise.reject(error);
    }

    this.cleanup = workflowDisposal
      .catch(error => this.reportFailure(error))
      .then(() => {
        try {
          this.options.destroyControls();
        } catch (error) {
          this.reportFailure(error);
        }
      });
    return this.cleanup;
  }

  private reportFailure(error: unknown): void {
    try {
      this.options.reportFailure?.(error);
    } catch {
      // Shutdown must continue even when its diagnostic sink is no longer available.
    }
  }
}
