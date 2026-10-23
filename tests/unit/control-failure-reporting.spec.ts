import { describe, expect, it, vi } from 'vitest';

import { ControlFailureReporting } from '../../src/app/control-failure-reporting.js';
import { EventSource } from '../../src/app/event-source.js';
import { ActivityLogger } from '../../src/app/activity-logger.js';
import { ActivityReporter } from '../../src/app/activity-reporter.js';

type CatalogEvents = { failed: { kind: 'catalog' | 'pipeline-contents'; message: string; error: unknown }; loaded: void };
type Reporter = Pick<ActivityReporter, 'failure' | 'resolveFailure' | 'technicalDetailsOf'>;

function failureReporting({ withCatalog = true, reporter = fakeReporter() }: { withCatalog?: boolean; reporter?: Reporter } = {}) {
  const grid = new EventSource<{ metadataFailed: { clip: { name: string }; error: unknown } }>();
  const pipelineCatalog = withCatalog ? new EventSource<CatalogEvents>() : null;
  const diagnostics = { logVideoMetadataFailure: vi.fn(async () => undefined), logRuntimeError: vi.fn(async () => undefined) };
  const reporting = new ControlFailureReporting({ grid, pipelineCatalog, reporter, diagnostics });
  return { reporting, grid, pipelineCatalog, reporter, diagnostics };
}

function fakeReporter() {
  return { failure: vi.fn(() => 'activity-error-1'), resolveFailure: vi.fn(), technicalDetailsOf: (error: unknown) => String(error) };
}

function reportingIntoActivity() {
  const activity = new ActivityLogger();
  const { pipelineCatalog } = failureReporting({ reporter: new ActivityReporter(activity) });
  const resolutions = () => activity.snapshot.entries.map(entry => entry.kind === 'error' ? entry.resolution : entry.kind);
  return { pipelineCatalog: pipelineCatalog!, resolutions };
}

describe('ControlFailureReporting', () => {
  it('logs a clip whose video metadata failed to load, without showing it in Activity', () => {
    const reporter = fakeReporter();
    const { grid, diagnostics } = failureReporting({ reporter });
    const error = new Error('decode');

    grid.emit('metadataFailed', { clip: { name: 'alpha.mp4' }, error });

    expect(diagnostics.logVideoMetadataFailure).toHaveBeenCalledWith({ filename: 'alpha.mp4', error });
    expect(reporter.failure).not.toHaveBeenCalled();
  });

  it('reports a Pipelines catalog failure in Activity and logs it', () => {
    const reporter = fakeReporter();
    const { pipelineCatalog, diagnostics } = failureReporting({ reporter });
    const error = new Error('denied');

    pipelineCatalog!.emit('failed', { kind: 'catalog', message: 'Could not read the Pipelines folder.', error });

    expect(reporter.failure).toHaveBeenCalledWith('Could not read the Pipelines folder.', {
      affected: 'Pipelines',
      recovery: 'Check the Pipelines top folder in Settings, then try again.',
      technicalDetails: 'Error: denied',
    });
    expect(diagnostics.logRuntimeError).toHaveBeenCalledWith('Could not read the Pipelines folder.', error);
  });

  it('resolves the Pipelines load errors in Activity once a later load succeeds', () => {
    const { pipelineCatalog, resolutions } = reportingIntoActivity();

    pipelineCatalog.emit('failed', { kind: 'catalog', message: 'Could not load Pipelines.', error: new Error('missing root') });
    pipelineCatalog.emit('failed', { kind: 'catalog', message: 'Could not load Pipelines.', error: new Error('missing root') });
    expect(resolutions()).toEqual(['unresolved', 'unresolved']);

    pipelineCatalog.emit('loaded');

    expect(resolutions()).toEqual(['resolved', 'resolved']);
  });

  it('keeps a pipeline contents error unresolved when the Pipelines list loads again', () => {
    const { pipelineCatalog, resolutions } = reportingIntoActivity();

    pipelineCatalog.emit('failed', { kind: 'pipeline-contents', message: 'Could not load Sample.', error: new Error('denied') });
    pipelineCatalog.emit('loaded');

    expect(resolutions()).toEqual(['unresolved']);
  });

  it('works without a Pipelines catalog and stops listening when disposed', () => {
    const { reporting, grid, diagnostics } = failureReporting({ withCatalog: false });

    reporting.dispose();
    grid.emit('metadataFailed', { clip: { name: 'alpha.mp4' }, error: new Error('decode') });

    expect(diagnostics.logVideoMetadataFailure).not.toHaveBeenCalled();
  });
});
