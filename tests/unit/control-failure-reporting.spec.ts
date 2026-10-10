import { describe, expect, it, vi } from 'vitest';

import { ControlFailureReporting } from '../../src/app/control-failure-reporting.js';
import { EventSource } from '../../src/app/event-source.js';

function failureReporting({ withCatalog = true } = {}) {
  const grid = new EventSource<{ metadataFailed: { clip: { name: string }; error: unknown } }>();
  const pipelineCatalog = withCatalog ? new EventSource<{ failed: { message: string; error: unknown } }>() : null;
  const reporter = { failure: vi.fn(), technicalDetailsOf: (error: unknown) => String(error) };
  const diagnostics = { logVideoMetadataFailure: vi.fn(async () => undefined), logRuntimeError: vi.fn(async () => undefined) };
  const reporting = new ControlFailureReporting({ grid, pipelineCatalog, reporter, diagnostics });
  return { reporting, grid, pipelineCatalog, reporter, diagnostics };
}

describe('ControlFailureReporting', () => {
  it('logs a clip whose video metadata failed to load, without showing it in Activity', () => {
    const { grid, reporter, diagnostics } = failureReporting();
    const error = new Error('decode');

    grid.emit('metadataFailed', { clip: { name: 'alpha.mp4' }, error });

    expect(diagnostics.logVideoMetadataFailure).toHaveBeenCalledWith({ filename: 'alpha.mp4', error });
    expect(reporter.failure).not.toHaveBeenCalled();
  });

  it('reports a Pipelines catalog failure in Activity and logs it', () => {
    const { pipelineCatalog, reporter, diagnostics } = failureReporting();
    const error = new Error('denied');

    pipelineCatalog!.emit('failed', { message: 'Could not read the Pipelines folder.', error });

    expect(reporter.failure).toHaveBeenCalledWith('Could not read the Pipelines folder.', {
      affected: 'Pipelines',
      recovery: 'Check the Pipelines top folder in Settings, then try again.',
      technicalDetails: 'Error: denied',
    });
    expect(diagnostics.logRuntimeError).toHaveBeenCalledWith('Could not read the Pipelines folder.', error);
  });

  it('works without a Pipelines catalog and stops listening when disposed', () => {
    const { reporting, grid } = failureReporting({ withCatalog: false });

    reporting.dispose();

    expect(grid.subscriberCount('metadataFailed')).toBe(0);
  });
});
