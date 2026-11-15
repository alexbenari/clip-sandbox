import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineCatalogResult, PipelineCreationProblem } from '../../src/app/pipeline-catalog.js';
import { AppText } from '../../src/app/app-text.js';
import { PipelineCatalogControl } from '../../src/ui/pipeline-catalog-control.js';
import { deferred } from '../support/deferred.js';
import { shippedPageBody } from '../support/page-markup.js';

afterEach(() => { document.body.innerHTML = ''; });

const NO_TOP_FOLDER = 'Set a Pipelines top folder in Settings to create a pipeline.';
const LOAD_FAILED = 'Pipelines could not be loaded.';
const SAMPLE: PipelineCatalogResult = { kind: 'available', entries: [{ id: 'pipeline_1', name: 'Sample' }] };

function catalogControl(listPipelineCatalog = vi.fn(async (): Promise<PipelineCatalogResult> => SAMPLE)) {
  document.body.innerHTML = shippedPageBody();
  const catalog = {
    listPipelineCatalog,
    describePipelineCatalogEntry: vi.fn(async () => ({
      clipNames: ['sample-01.mp4', 'sample-02.mp4'],
      collections: [{ name: 'Review', clipNames: ['sample-02.mp4'] }],
    })),
  };
  const control = PipelineCatalogControl.fromDocument(document, { catalog, appText: new AppText() })!;
  const host = document.getElementById('pipelinesPanelHost')!;
  const newPipeline = document.getElementById('newPipeline') as HTMLButtonElement;
  const requests: string[] = [];
  control.on('createRequested', ({ name }) => requests.push(name));
  const nameField = () => host.querySelector<HTMLInputElement>('input[aria-label="Pipeline name"]');
  const refusal = () => host.querySelector<HTMLElement>('[role="alert"]:not([hidden])')?.textContent ?? null;
  const press = (key: string) => nameField()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const type = (text: string) => {
    nameField()!.value = text;
    nameField()!.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const leaveField = () => document.getElementById('foldPipelines')!.focus();
  return { control, catalog, host, newPipeline, requests, nameField, refusal, press, type, leaveField };
}

async function openedNameField() {
  const parts = catalogControl();
  await parts.control.load();
  parts.newPipeline.click();
  return parts;
}

describe('PipelineCatalogControl', () => {
  it('expands pipeline and collection disclosures separately while Load remains an explicit action', async () => {
    const { control, host } = catalogControl();
    const onLoadPipeline = vi.fn(async () => undefined);
    control.on('loadRequested', onLoadPipeline);

    await control.load();
    const expandPipeline = host.querySelector<HTMLButtonElement>('[aria-label="Expand Sample"]')!;
    expect(host.querySelector('[aria-label="Load Sample"]')).not.toBeNull();

    expandPipeline.click();
    await vi.waitFor(() => expect(host.textContent).toContain('Review'));
    expect(host.textContent).toContain('sample-01.mp4');
    expect(host.querySelector('[aria-label="Expand collection Review"]')).not.toBeNull();
    expect(host.querySelector<HTMLUListElement>('.pipeline-tree-collections .pipeline-tree-clip-list')!.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('[aria-label="Expand collection Review"]')!.click();
    expect(host.querySelector('.pipeline-tree-collections .pipeline-tree-clip-list')?.textContent).toContain('sample-02.mp4');

    host.querySelector<HTMLButtonElement>('[aria-label="Load Sample"]')!.click();
    await vi.waitFor(() => expect(onLoadPipeline).toHaveBeenCalledWith({ id: 'pipeline_1', name: 'Sample' }));
  });

  it('reports a failed load, then a later load that succeeds', async () => {
    const { control } = catalogControl(vi.fn()
      .mockRejectedValueOnce(new Error('ENOENT: no such folder'))
      .mockResolvedValueOnce({ kind: 'available', entries: [] }));
    const outcomes: string[] = [];
    control.on('failed', ({ kind }) => outcomes.push(`failed ${kind}`));
    control.on('loaded', () => outcomes.push('loaded'));

    await control.load();
    await control.load();

    expect(outcomes).toEqual(['failed catalog', 'loaded']);
  });

  describe('New pipeline button', () => {
    it('is available once a configured top folder has loaded, even with no pipelines in it', async () => {
      const { control, newPipeline } = catalogControl(vi.fn(async () => ({ kind: 'available' as const, entries: [] })));

      await control.load();

      expect(newPipeline.getAttribute('aria-disabled')).not.toBe('true');
      expect(newPipeline.title).toBe('New pipeline');
      expect(newPipeline.hasAttribute('aria-description')).toBe(false);
    });

    it.each([
      ['no top folder is set', vi.fn(async () => ({ kind: 'unconfigured' as const })), NO_TOP_FOLDER],
      ['the list could not be loaded', vi.fn(async () => { throw new Error('EACCES'); }), LOAD_FAILED],
    ])('is disabled but focusable, and says why, when %s', async (_case, listPipelineCatalog, reason) => {
      const { control, newPipeline } = catalogControl(listPipelineCatalog);

      await control.load();

      expect(newPipeline.getAttribute('aria-disabled')).toBe('true');
      expect(newPipeline.disabled).toBe(false);
      expect(newPipeline.title).toBe(reason);
      expect(newPipeline.getAttribute('aria-description')).toBe(reason);
    });

    it('is disabled with no reason before the list first loads', () => {
      const { newPipeline, nameField } = catalogControl();

      newPipeline.click();

      expect(newPipeline.getAttribute('aria-disabled')).toBe('true');
      expect(newPipeline.title).toBe('New pipeline');
      expect(newPipeline.hasAttribute('aria-description')).toBe(false);
      expect(nameField()).toBeNull();
    });

    it('is named New pipeline for assistive technology', () => {
      const { newPipeline } = catalogControl();

      expect(newPipeline.getAttribute('aria-label')).toBe('New pipeline');
    });

    it('is disabled with no reason while the list is loading', async () => {
      const reload = deferred<PipelineCatalogResult>();
      const { control, newPipeline } = catalogControl(vi.fn()
        .mockResolvedValueOnce(SAMPLE)
        .mockReturnValueOnce(reload.promise));
      await control.load();
      expect(newPipeline.getAttribute('aria-disabled')).not.toBe('true');

      void control.load();

      expect(newPipeline.getAttribute('aria-disabled')).toBe('true');
      expect(newPipeline.title).toBe('New pipeline');
      expect(newPipeline.hasAttribute('aria-description')).toBe(false);
    });

    it('opens no name field while disabled', async () => {
      const { control, newPipeline, nameField } = catalogControl(vi.fn(async () => ({ kind: 'unconfigured' as const })));
      await control.load();

      newPipeline.click();

      expect(nameField()).toBeNull();
    });

    it('opens a focused name field above the pipelines', async () => {
      const { host, nameField } = await openedNameField();

      expect(document.activeElement).toBe(nameField());
      expect(nameField()!.placeholder).toBe('Pipeline name');
      const sample = host.querySelector('[aria-label="Expand Sample"]')!;
      expect(nameField()!.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('focuses the open name field again instead of opening another', async () => {
      const { host, newPipeline, nameField, type } = await openedNameField();
      type('Heist films');
      newPipeline.focus();

      newPipeline.click();

      expect(host.querySelectorAll('input[aria-label="Pipeline name"]')).toHaveLength(1);
      expect(document.activeElement).toBe(nameField());
      expect(nameField()!.value).toBe('Heist films');
    });
  });

  describe('name field', () => {
    it('asks to create a pipeline with the typed name on Enter', async () => {
      const { requests, type, press } = await openedNameField();
      type('Heist films');

      press('Enter');

      expect(requests).toEqual(['Heist films']);
    });

    it('waits read-only for the answer and asks only once', async () => {
      const { requests, type, press, nameField } = await openedNameField();
      type('Heist films');

      press('Enter');
      press('Enter');

      expect(nameField()!.readOnly).toBe(true);
      expect(requests).toEqual(['Heist films']);
    });

    it('closes on Escape without asking, and the key goes no further', async () => {
      const { requests, type, press, nameField } = await openedNameField();
      const pageKeys: string[] = [];
      document.addEventListener('keydown', event => pageKeys.push(event.key));
      type('Heist films');

      press('Escape');

      expect(nameField()).toBeNull();
      expect(requests).toEqual([]);
      expect(pageKeys).toEqual([]);
    });

    it('returns focus to the New pipeline button when closed from the field', async () => {
      const { newPipeline, press } = await openedNameField();

      press('Escape');

      expect(document.activeElement).toBe(newPipeline);
    });

    it('asks to create the typed name when the user leaves the field, as folding the panel does', async () => {
      const { requests, type, leaveField } = await openedNameField();
      type('Heist films');

      leaveField();

      expect(requests).toEqual(['Heist films']);
    });

    it('closes without asking when the user leaves it empty', async () => {
      const { requests, leaveField, nameField } = await openedNameField();

      leaveField();

      expect(nameField()).toBeNull();
      expect(requests).toEqual([]);
    });

    it('closes without asking when Enter is pressed in an empty field', async () => {
      const { requests, press, nameField } = await openedNameField();

      press('Enter');

      expect(nameField()).toBeNull();
      expect(requests).toEqual([]);
    });

    it('closes without asking again when the user leaves a name that was just refused', async () => {
      const { control, requests, type, press, leaveField, nameField } = await openedNameField();
      type('Noir');
      press('Enter');
      control.showCreateProblem('name-taken');

      leaveField();

      expect(nameField()).toBeNull();
      expect(requests).toEqual(['Noir']);
    });

    it.each<[PipelineCreationProblem, string]>([
      ['invalid-name', 'Windows cannot use this name. Avoid \\ / : * ? " < > | and a dot or space at the end.'],
      ['name-taken', 'A folder with this name already exists in the Pipelines top folder.'],
      ['no-top-folder', NO_TOP_FOLDER],
      ['top-folder-missing', 'The Pipelines top folder no longer exists. Choose it again in Settings.'],
      ['failed', 'The pipeline could not be created. Check that the Pipelines top folder can be written to, then try again.'],
    ])('keeps the typed name editable and says why when refused as %s', async (problem, text) => {
      const { control, type, press, refusal, nameField } = await openedNameField();
      type('Noir');
      press('Enter');

      control.showCreateProblem(problem);

      expect(refusal()).toBe(text);
      expect(nameField()!.value).toBe('Noir');
      expect(nameField()!.readOnly).toBe(false);
      expect(document.activeElement).toBe(nameField());
    });

    it('hides the refusal once the user types again', async () => {
      const { control, type, press, refusal } = await openedNameField();
      type('Noir');
      press('Enter');
      control.showCreateProblem('name-taken');

      type('Noir 2');

      expect(refusal()).toBeNull();
    });

    it('keeps the field and its text when the list reloads', async () => {
      const { control, host, type, nameField } = await openedNameField();
      type('Heist');

      await control.load();

      expect(nameField()!.value).toBe('Heist');
      expect(host.textContent).toContain('Sample');
    });

    it('closes when creation ends', async () => {
      const { control, type, press, nameField } = await openedNameField();
      type('Heist films');
      press('Enter');

      control.endCreate();

      expect(nameField()).toBeNull();
    });
  });

  it('focuses a listed pipeline by its name', async () => {
    const { control, host } = catalogControl();
    await control.load();

    expect(control.focusPipeline('Sample')).toBe(true);

    expect(document.activeElement).toBe(host.querySelector('[aria-label="Expand Sample"]'));
  });

  it('answers that a pipeline the list does not show cannot be focused', async () => {
    const { control } = catalogControl();
    await control.load();

    expect(control.focusPipeline('Heist films')).toBe(false);
  });

  it('opens no name field once disposed', async () => {
    const { control, newPipeline, nameField } = catalogControl();
    await control.load();

    control.dispose();
    newPipeline.click();

    expect(nameField()).toBeNull();
  });
});
