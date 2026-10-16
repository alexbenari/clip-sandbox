import { describe, expect, it, vi } from 'vitest';

import { RuntimeFailureReporter } from '../../src/app/runtime-failure-reporter.js';

describe('RuntimeFailureReporter', () => {
  it('shows the failure in Activity and logs the error that came with it', () => {
    const reporter = { failure: vi.fn() };
    const diagnostics = { logRuntimeError: vi.fn(async () => undefined) };
    const error = new Error('disk full');

    new RuntimeFailureReporter(reporter, diagnostics).report('Captures could not be saved.', error);

    expect(reporter.failure).toHaveBeenCalledWith('Captures could not be saved.');
    expect(diagnostics.logRuntimeError).toHaveBeenCalledWith('Captures could not be saved.', error);
  });

  it('logs nothing for a failure that came without an error', () => {
    const reporter = { failure: vi.fn() };
    const diagnostics = { logRuntimeError: vi.fn(async () => undefined) };

    new RuntimeFailureReporter(reporter, diagnostics).report('Some clips could not be completed.');

    expect(reporter.failure).toHaveBeenCalledWith('Some clips could not be completed.');
    expect(diagnostics.logRuntimeError).not.toHaveBeenCalled();
  });
});
