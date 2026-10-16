import { describe, expect, it, vi } from 'vitest';

import { AddToCollectionWorkflow, type AddToCollectionTarget } from '../../src/app/add-to-collection-workflow.js';
import { ActivityReporter } from '../../src/app/activity-reporter.js';
import { AppText } from '../../src/app/app-text.js';
import { CollectionNameValidator } from '../../src/app/collection-name-validator.js';
import { EventSource } from '../../src/app/event-source.js';
import { NewCollectionNameCheck } from '../../src/app/new-collection-name-check.js';
import { PipelineWorkingCopy } from '../../src/app/pipeline-working-copy.js';
import { Collection } from '../../src/domain/collection.js';
import { Pipeline } from '../../src/domain/pipeline.js';

class FakeAddDialog extends EventSource<{ confirmed: AddToCollectionTarget }> {
  open = vi.fn();
  close = vi.fn();
  showValidationError = vi.fn();
}

function addWorkflow({ writeFails = false } = {}) {
  const pipeline = new Pipeline({
    folderName: 'clips',
    videoFiles: [new File(['a'], 'alpha.mp4'), new File(['b'], 'bravo.mp4')],
    collections: [Collection.fromFilename({ filename: 'picks.txt', orderedClipNames: ['bravo.mp4'] })],
  });
  const pipelineWorkingCopy = new PipelineWorkingCopy();
  pipelineWorkingCopy.loadPipeline(pipeline);
  const [alpha, bravo] = pipelineWorkingCopy.currentClipSequence!.orderedClips();
  const grid = { selectedClipIds: [alpha.id, bravo.id], getSelectedClipIds() { return this.selectedClipIds; }, invalidateView: vi.fn() };
  const dialog = new FakeAddDialog();
  const toolbar = new EventSource<{ addToCollectionRequested: void }>();
  const written: Collection[] = [];
  const entries: { kind: string; message: string }[] = [];
  const workflow = new AddToCollectionWorkflow({
    pipelineWorkingCopy,
    grid,
    dialog,
    destinationChoices: {
      buildChoices: ({ pipeline: current }) => (current?.collections() ?? [])
        .map(collection => ({ label: collection.collectionName, value: collection.filename ?? '', collectionFilename: collection.filename })),
    },
    toolbar,
    nameCheck: new NewCollectionNameCheck(pipelineWorkingCopy, new CollectionNameValidator(new AppText())),
    fileWriter: {
      write: vi.fn(async (collection: Collection) => {
        if (writeFails) throw new Error('disk full');
        written.push(collection);
        return { mode: 'saved' };
      }),
    },
    collectionView: { cacheKeyFor: collection => `collection:${collection?.filename}`, refreshSelector: vi.fn(), refreshToolbar: vi.fn() },
    reporter: new ActivityReporter({ log: entry => { entries.push(entry); } }),
    appText: new AppText(),
  });
  return { workflow, pipeline, grid, dialog, toolbar, written, entries };
}

describe('AddToCollectionWorkflow', () => {
  it('adds the selected clips to an existing collection, skipping clips it already lists', async () => {
    const { workflow, pipeline, written, grid, dialog, entries } = addWorkflow();

    await workflow.addSelectedClips({ kind: 'existing', collectionFilename: 'picks.txt' });

    expect(written.map(collection => collection.orderedClipNames)).toEqual([['bravo.mp4', 'alpha.mp4']]);
    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.mp4', 'alpha.mp4']);
    expect(grid.invalidateView).toHaveBeenCalledWith('collection:picks.txt');
    expect(dialog.close).toHaveBeenCalled();
    expect(entries.at(-1)).toMatchObject({ kind: 'success', message: new AppText().addedSelectedClipsText('picks', 1, 1) });
  });

  it('creates a new collection from a valid name entered in the dialog', async () => {
    const { dialog, written } = addWorkflow();

    dialog.emit('confirmed', { kind: 'new', name: 'highlights' });

    await vi.waitFor(() => expect(written.map(collection => collection.filename)).toEqual(['highlights.txt']));
  });

  it('shows the dialog a name problem and writes nothing', async () => {
    const { workflow, dialog, written } = addWorkflow();

    await workflow.addSelectedClips({ kind: 'new', name: 'Picks' }, { fromDialog: true });

    expect(dialog.showValidationError).toHaveBeenCalledWith(new AppText().collectionAlreadyExistsText(), { focusNameInput: true });
    expect(written).toEqual([]);
  });

  it('undoes a new collection and reports the failure when its file cannot be written', async () => {
    const { workflow, pipeline, dialog, entries } = addWorkflow({ writeFails: true });

    await workflow.addSelectedClips({ kind: 'new', name: 'highlights' }, { fromDialog: true });

    expect(pipeline.getCollectionByFilename('highlights.txt')).toBeNull();
    expect(dialog.close).toHaveBeenCalled();
    expect(entries.at(-1)).toMatchObject({ kind: 'error', affected: 'highlights' });
  });

  it('restores an existing collection when the rewrite fails', async () => {
    const { workflow, pipeline } = addWorkflow({ writeFails: true });

    await workflow.addSelectedClips({ kind: 'existing', collectionFilename: 'picks.txt' });

    expect(pipeline.getCollectionByFilename('picks.txt')?.orderedClipNames).toEqual(['bravo.mp4']);
  });

  it('does nothing without a selection', async () => {
    const { workflow, grid, written, entries } = addWorkflow();
    grid.selectedClipIds = [];

    await workflow.addSelectedClips({ kind: 'existing', collectionFilename: 'picks.txt' });

    expect(written).toEqual([]);
    expect(entries).toEqual([]);
  });

  it('opens the dialog from the toolbar with the collections the clips can go to', () => {
    const { dialog, toolbar } = addWorkflow();

    toolbar.emit('addToCollectionRequested');

    expect(dialog.open).toHaveBeenCalledWith({
      choices: [{ label: 'picks', value: 'picks.txt', collectionFilename: 'picks.txt' }],
      hasSelection: true,
      startWithNewCollection: false,
    });
  });
});
