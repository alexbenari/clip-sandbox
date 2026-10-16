import { describe, expect, it, vi } from 'vitest';

import { AppText } from '../../src/app/app-text.js';
import { CollectionSaveWorkflow } from '../../src/app/collection-save-workflow.js';
import { EventSource } from '../../src/app/event-source.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

class FakeSaveAsNewDialog extends EventSource<{ confirmed: string; cancelled: void }> {
  isOpen = false;
  validationError = '';
  open = vi.fn(() => { this.isOpen = true; });
  close = vi.fn(() => { this.isOpen = false; });
  showValidationError = vi.fn((text: string) => { this.validationError = text; });
}

function saveWorkflow({ startInCollection = false, writeFails = false } = {}) {
  const pipeline = new Pipeline({
    folderName: 'clips',
    videoFiles: [new File(['a'], 'alpha.mp4'), new File(['b'], 'bravo.mp4')],
    collections: [Collection.fromFilename({ filename: 'subset.txt', orderedClipNames: ['bravo.mp4'] })],
  });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  if (startInCollection) {
    const subset = pipeline.getCollectionByFilename('subset.txt');
    const loaded = pipelineWorkingCopy.materializeSelection(subset);
    if (!loaded || loaded.materialization.kind !== 'loaded') throw new Error('subset did not load');
    pipelineWorkingCopy.activateSelection({ collection: subset, sequence: loaded.materialization.sequence });
  }
  const written: Collection[] = [];
  const fileWriter = {
    write: vi.fn(async (collection: Collection) => {
      if (writeFails) throw new Error('disk full');
      written.push(collection);
      return { mode: 'saved' };
    }),
  };
  const dialog = new FakeSaveAsNewDialog();
  const toolbar = new EventSource<{ saveRequested: void; saveAsNewRequested: void }>();
  const reporter = { success: vi.fn() };
  const workflow = new CollectionSaveWorkflow({
    pipelineWorkingCopy,
    fileWriter,
    saveAsNewDialog: dialog,
    toolbar,
    nameCheck: { problemText: (name: string) => (name.trim() ? '' : 'Enter a collection name.') },
    grid: { invalidateView: vi.fn(), retagActiveView: vi.fn() },
    collectionView: { activeCacheKey: () => 'pipeline', refreshSelector: vi.fn(), refreshToolbar: vi.fn() },
    folderRefresh: { afterCollectionSaved: vi.fn(async () => undefined) },
    reporter,
    appText: new AppText(),
  });
  return { workflow, pipelineWorkingCopy, pipeline, written, dialog, toolbar, reporter, fileWriter };
}

async function settled<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 0))]);
}

describe('CollectionSaveWorkflow', () => {
  it('saves a collection view straight to its file', async () => {
    const { workflow, written, pipelineWorkingCopy, reporter, dialog } = saveWorkflow({ startInCollection: true });

    await expect(workflow.saveActive()).resolves.toBe('saved');

    expect(written.map(collection => [collection.filename, collection.orderedClipNames])).toEqual([['subset.txt', ['bravo.mp4']]]);
    expect(pipelineWorkingCopy.hasDirtyClipSequenceChanges).toBe(false);
    expect(reporter.success).toHaveBeenCalledWith(new AppText().savedCollectionFileText('subset.txt'));
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('reports a failed collection save without opening any dialog', async () => {
    const { workflow, dialog } = saveWorkflow({ startInCollection: true, writeFails: true });

    await expect(workflow.saveActive()).resolves.toBe('failed');
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('asks for a collection name when the pipeline view is saved, and resolves once that save succeeds', async () => {
    const { workflow, dialog, pipelineWorkingCopy, written } = saveWorkflow();

    const outcome = workflow.saveActive();
    expect(dialog.open).toHaveBeenCalledWith({ isPipelineMode: true });
    expect(await settled(outcome)).toBe('pending');
    dialog.emit('confirmed', 'picks');

    await expect(outcome).resolves.toBe('saved');
    expect(written.map(collection => collection.filename)).toEqual(['picks.txt']);
    expect(pipelineWorkingCopy.activeCollection?.filename).toBe('picks.txt');
    expect(dialog.isOpen).toBe(false);
  });

  it('keeps waiting while the name is invalid or the save fails, as the open dialog does', async () => {
    const { workflow, dialog, fileWriter } = saveWorkflow();
    const outcome = workflow.saveAsNew();

    dialog.emit('confirmed', '  ');
    expect(dialog.validationError).toBe('Enter a collection name.');
    fileWriter.write.mockRejectedValueOnce(new Error('disk full'));
    dialog.emit('confirmed', 'picks');

    expect(await settled(outcome)).toBe('pending');
    expect(dialog.isOpen).toBe(true);
  });

  it('settles as cancelled when the dialog reports a cancel, which covers its Cancel button and Escape', async () => {
    const { workflow, dialog } = saveWorkflow();
    const outcome = workflow.saveActive();

    dialog.emit('cancelled');

    await expect(outcome).resolves.toBe('cancelled');
  });

  it('settles as cancelled when the dialog is closed directly or the workflow is disposed', async () => {
    const closedDirectly = saveWorkflow();
    const directOutcome = closedDirectly.workflow.saveAsNew();
    closedDirectly.workflow.cancelSaveAsNew();
    await expect(directOutcome).resolves.toBe('cancelled');
    expect(closedDirectly.dialog.close).toHaveBeenCalled();

    const disposed = saveWorkflow();
    const disposedOutcome = disposed.workflow.saveAsNew();
    disposed.workflow.dispose();
    await expect(disposedOutcome).resolves.toBe('cancelled');
  });

  it('shares one wait between callers while the dialog is already open', async () => {
    const { workflow, dialog } = saveWorkflow();

    const first = workflow.saveAsNew();
    const second = workflow.saveActive();
    dialog.emit('confirmed', 'picks');

    await expect(Promise.all([first, second])).resolves.toEqual(['saved', 'saved']);
    expect(dialog.open).toHaveBeenCalledOnce();
  });

  it('starts saves from the toolbar', async () => {
    const { toolbar, dialog, written } = saveWorkflow({ startInCollection: true });

    toolbar.emit('saveAsNewRequested');
    expect(dialog.open).toHaveBeenCalledWith({ isPipelineMode: false });
    toolbar.emit('saveRequested');

    await vi.waitFor(() => expect(written.map(collection => collection.filename)).toEqual(['subset.txt']));
  });
});
