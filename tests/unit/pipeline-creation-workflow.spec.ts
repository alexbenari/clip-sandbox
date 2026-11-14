import { describe, expect, it, vi } from 'vitest';

import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppText } from '../../src/app/app-text.js';
import { EventSource } from '../../src/app/event-source.js';
import type { PipelineCreationOutcome, PipelineCreationProblem, PipelineCreationRequest } from '../../src/app/pipeline-catalog.js';
import { PipelineCreationWorkflow } from '../../src/app/pipeline-creation-workflow.js';
import { deferred, type Deferred } from '../support/deferred.js';
import { flushPendingWork } from '../support/flush-pending-work.js';
import { recordedActivityLog } from '../support/recorded-activity-log.js';

class FakeCatalog extends EventSource<{ createRequested: PipelineCreationRequest }> {
  creating = true;
  problems: PipelineCreationProblem[] = [];
  focused: string[] = [];
  listed: string[] = [];
  readonly reloads: Deferred<void>[] = [];
  endCreate() { this.creating = false; }
  showCreateProblem(problem: PipelineCreationProblem) { this.problems.push(problem); }
  load() {
    const reload = deferred<void>();
    this.reloads.push(reload);
    return reload.promise;
  }
  focusPipeline(name: string) {
    if (!this.listed.includes(name)) return false;
    this.focused.push(name);
    return true;
  }
}

function pipelineCreation() {
  const catalog = new FakeCatalog();
  const answers: Deferred<PipelineCreationOutcome>[] = [];
  const pipelines = {
    createPipeline: vi.fn((_name: string) => {
      const answer = deferred<PipelineCreationOutcome>();
      answers.push(answer);
      return answer.promise;
    }),
  };
  const activityLog = recordedActivityLog();
  const workflow = new PipelineCreationWorkflow({
    catalog, pipelines, appText: new AppText(),
    reporter: new ActivityReporter(activityLog),
    diagnostics: { logRuntimeError: vi.fn(async () => undefined) },
  });
  const request = (name: string) => catalog.emit('createRequested', { name });
  return { workflow, catalog, pipelines, answers, request, entries: activityLog.entries };
}

describe('PipelineCreationWorkflow', () => {
  it('asks the desktop to create a pipeline with the requested name', () => {
    const { pipelines, request } = pipelineCreation();

    request('Heist films');

    expect(pipelines.createPipeline).toHaveBeenCalledWith('Heist films');
  });

  it('closes the name field once the pipeline is created', async () => {
    const { catalog, answers, request } = pipelineCreation();
    request('Heist films');

    answers[0]!.resolve({ kind: 'created', name: 'Heist films' });
    await flushPendingWork();

    expect(catalog.creating).toBe(false);
  });

  it('reloads the list once the pipeline is created', async () => {
    const { catalog, answers, request } = pipelineCreation();
    request('Heist films');

    answers[0]!.resolve({ kind: 'created', name: 'Heist films' });
    await flushPendingWork();

    expect(catalog.reloads[0]).toBeDefined();
  });

  it('focuses the new pipeline only after the reloaded list shows it', async () => {
    const { catalog, answers, request } = pipelineCreation();
    request('Heist films');
    answers[0]!.resolve({ kind: 'created', name: 'Heist films' });
    await flushPendingWork();
    expect(catalog.focused).toEqual([]);

    catalog.listed = ['Heist films'];
    catalog.reloads[0]!.resolve();
    await flushPendingWork();

    expect(catalog.focused).toEqual(['Heist films']);
  });

  it('records the created pipeline in Activity, even when the reloaded list cannot show it', async () => {
    const { catalog, answers, request, entries } = pipelineCreation();
    request('Heist films');
    answers[0]!.resolve({ kind: 'created', name: 'Heist films' });
    await flushPendingWork();

    catalog.reloads[0]!.resolve();
    await flushPendingWork();

    expect(entries).toEqual([expect.objectContaining({ kind: 'success', message: 'Created pipeline Heist films' })]);
  });

  it('keeps the name field open and says why when the name is refused', async () => {
    const { catalog, answers, request } = pipelineCreation();
    request('Noir');

    answers[0]!.resolve({ kind: 'refused', reason: 'name-taken' });
    await flushPendingWork();

    expect(catalog.problems).toEqual(['name-taken']);
    expect(catalog.creating).toBe(true);
  });

  it('leaves the list and Activity as they were when the name is refused', async () => {
    const { catalog, answers, request, entries } = pipelineCreation();
    request('Noir');

    answers[0]!.resolve({ kind: 'refused', reason: 'name-taken' });
    await flushPendingWork();

    expect(catalog.reloads).toEqual([]);
    expect(entries).toEqual([]);
  });

  it('keeps the name field open and reports the details when creating fails', async () => {
    const { catalog, answers, request, entries } = pipelineCreation();
    request('Heist films');

    answers[0]!.reject(new Error('EACCES: permission denied'));
    await flushPendingWork();

    expect(catalog.problems).toEqual(['failed']);
    expect(catalog.creating).toBe(true);
    expect(entries).toEqual([expect.objectContaining({
      kind: 'error',
      message: 'Could not create pipeline Heist films.',
      technicalDetails: expect.stringContaining('EACCES: permission denied'),
    })]);
  });

  it('stops reacting to creation requests once disposed', () => {
    const { workflow, pipelines, request } = pipelineCreation();

    workflow.dispose();
    request('Heist films');

    expect(pipelines.createPipeline).not.toHaveBeenCalled();
  });
});
