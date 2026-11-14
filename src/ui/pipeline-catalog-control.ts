import type {
  IPipelineCatalogCollection,
  IPipelineCatalogDetails,
  IPipelineCatalogEntry,
  PipelineCatalogResult,
  PipelineCreationProblem,
  PipelineCreationRequest,
} from '../app/pipeline-catalog.js';
import type { AppText } from '../app/app-text.js';
import { EventSource, type EventHandler, type IEventSource } from '../app/event-source.js';
import { DocumentElements } from './document-elements.js';
import { NewPipelineField } from './new-pipeline-field.js';

export type PipelineCatalogFailureKind = 'catalog' | 'pipeline-contents';

export interface IPipelineCatalogEvents {
  loadRequested: IPipelineCatalogEntry;
  createRequested: PipelineCreationRequest;
  failed: Readonly<{ kind: PipelineCatalogFailureKind; message: string; error: unknown }>;
  loaded: void;
}

type PipelineCatalogPort = {
  listPipelineCatalog(): Promise<PipelineCatalogResult>;
  describePipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<IPipelineCatalogDetails>;
};

type PipelineCatalogText = Pick<AppText, 'windowsNameRefusalText' | 'pipelineCreationRecoveryText'>;

type PipelineCatalogControlOptions = {
  host: HTMLElement;
  newPipelineButton: HTMLButtonElement;
  catalog: PipelineCatalogPort;
  appText: PipelineCatalogText;
  document: Document;
};

type CreateAvailability = 'available' | 'loading' | Readonly<{ unavailableBecause: string }>;

const NEW_PIPELINE = 'New pipeline';
const NO_TOP_FOLDER = 'Set a Pipelines top folder in Settings to create a pipeline.';
const LOAD_FAILED = 'Pipelines could not be loaded.';

export class PipelineCatalogControl implements IEventSource<IPipelineCatalogEvents> {
  private readonly host: HTMLElement;
  private readonly list: HTMLElement;
  private readonly newPipelineButton: HTMLButtonElement;
  private readonly catalog: PipelineCatalogPort;
  private readonly createProblemText: Readonly<Record<PipelineCreationProblem, string>>;
  private readonly events = new EventSource<IPipelineCatalogEvents>();
  private readonly document: Document;
  private readonly listeners = new AbortController();
  private readonly detailsByPipelineId = new Map<string, IPipelineCatalogDetails>();
  private readonly expandButtonsByName = new Map<string, HTMLButtonElement>();
  private nameField: NewPipelineField | null = null;
  private requestGeneration = 0;
  private disposed = false;

  static fromDocument(doc: Document, { catalog, appText }: {
    catalog: PipelineCatalogPort;
    appText: PipelineCatalogText;
  }): PipelineCatalogControl | null {
    const elements = new DocumentElements(doc);
    const host = elements.optional('pipelinesPanelHost');
    if (!host) return null;
    const newPipelineButton = elements.required<HTMLButtonElement>('newPipeline');
    return new PipelineCatalogControl({ host, newPipelineButton, catalog, appText, document: doc });
  }

  constructor(options: PipelineCatalogControlOptions) {
    this.host = options.host;
    this.newPipelineButton = options.newPipelineButton;
    this.catalog = options.catalog;
    this.document = options.document;
    this.createProblemText = Object.freeze({
      'invalid-name': options.appText.windowsNameRefusalText(),
      'name-taken': 'A folder with this name already exists in the Pipelines top folder.',
      'no-top-folder': NO_TOP_FOLDER,
      'top-folder-missing': 'The Pipelines top folder no longer exists. Choose it again in Settings.',
      failed: `The pipeline could not be created. ${options.appText.pipelineCreationRecoveryText()}`,
    });
    this.list = this.document.createElement('div');
    this.list.className = 'pipeline-catalog-list';
    this.newPipelineButton.setAttribute('aria-label', NEW_PIPELINE);
    this.newPipelineButton.addEventListener('click', () => this.beginCreate(), { signal: this.listeners.signal });
    this.showCreateAvailability('loading');
  }

  on<TName extends keyof IPipelineCatalogEvents>(name: TName, handler: EventHandler<IPipelineCatalogEvents[TName]>): () => void {
    return this.events.on(name, handler);
  }

  async load(): Promise<void> {
    const requestGeneration = ++this.requestGeneration;
    this.detailsByPipelineId.clear();
    this.expandButtonsByName.clear();
    if (this.list.parentElement !== this.host) this.host.replaceChildren(this.list);
    this.list.replaceChildren(this.message('Loading pipelines…', 'pipeline-catalog-loading'));
    this.showCreateAvailability('loading');
    try {
      const result = await this.catalog.listPipelineCatalog();
      if (!this.isCurrent(requestGeneration)) return;
      this.renderCatalog(result);
      this.events.emit('loaded');
    } catch (error) {
      if (!this.isCurrent(requestGeneration)) return;
      this.list.replaceChildren(this.message(`${LOAD_FAILED} Review the configured folder and try again.`, 'pipeline-catalog-error'));
      this.showCreateAvailability({ unavailableBecause: LOAD_FAILED });
      this.events.emit('failed', { kind: 'catalog', message: 'Could not load Pipelines.', error });
    }
  }

  endCreate(): void {
    const field = this.nameField;
    if (!field) return;
    this.nameField = null;
    const hadFocus = field.hasFocus;
    field.remove();
    if (hadFocus) this.newPipelineButton.focus();
  }

  showCreateProblem(problem: PipelineCreationProblem): void {
    this.nameField?.showProblem(this.createProblemText[problem]);
  }

  focusPipeline(name: string): boolean {
    const expand = this.expandButtonsByName.get(name);
    if (!expand?.isConnected) return false;
    expand.focus();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.requestGeneration += 1;
    this.listeners.abort();
    this.nameField?.remove();
    this.nameField = null;
  }

  private beginCreate(): void {
    if (this.newPipelineButton.getAttribute('aria-disabled') === 'true') return;
    if (!this.nameField) {
      this.nameField = new NewPipelineField(this.document, {
        submit: name => this.events.emit('createRequested', { name }),
        cancel: () => this.endCreate(),
      });
      this.host.prepend(this.nameField.element);
      this.host.scrollTop = 0;
    }
    this.nameField.focus();
  }

  private showCreateAvailability(availability: CreateAvailability): void {
    const reason = typeof availability === 'object' ? availability.unavailableBecause : null;
    this.newPipelineButton.setAttribute('aria-disabled', String(availability !== 'available'));
    this.newPipelineButton.title = reason ?? NEW_PIPELINE;
    if (reason) this.newPipelineButton.setAttribute('aria-description', reason);
    else this.newPipelineButton.removeAttribute('aria-description');
  }

  private renderCatalog(result: PipelineCatalogResult): void {
    if (result.kind === 'unconfigured') {
      this.list.replaceChildren(this.message('Configure a Pipelines top folder in Settings to see pipelines here.', 'pipeline-catalog-empty'));
      this.showCreateAvailability({ unavailableBecause: NO_TOP_FOLDER });
      return;
    }
    this.showCreateAvailability('available');
    if (result.entries.length === 0) {
      this.list.replaceChildren(this.message('No pipelines with video clips were found in the configured folder.', 'pipeline-catalog-empty'));
      return;
    }
    this.list.replaceChildren(...result.entries.map(entry => this.pipelineEntry(entry)));
  }

  private pipelineEntry(entry: IPipelineCatalogEntry): HTMLElement {
    const row = this.document.createElement('section');
    row.className = 'pipeline-tree-entry';
    const header = this.document.createElement('div');
    header.className = 'pipeline-tree-header';
    const expand = this.document.createElement('button');
    expand.type = 'button';
    expand.className = 'pipeline-tree-expand';
    expand.setAttribute('aria-expanded', 'false');
    expand.setAttribute('aria-label', `Expand ${entry.name}`);
    const name = this.document.createElement('span');
    name.className = 'pipeline-tree-name';
    name.textContent = entry.name;
    expand.append(this.disclosureIcon(), name);
    this.expandButtonsByName.set(entry.name, expand);
    const load = this.document.createElement('button');
    load.type = 'button';
    load.className = 'pipeline-tree-load';
    load.textContent = 'Load';
    load.setAttribute('aria-label', `Load ${entry.name}`);
    const details = this.document.createElement('div');
    details.className = 'pipeline-tree-details';
    details.hidden = true;

    expand.addEventListener('click', () => { void this.togglePipeline(entry, expand, details); });
    load.addEventListener('click', () => this.events.emit('loadRequested', entry));
    header.append(expand, load);
    row.append(header, details);
    return row;
  }

  private async togglePipeline(entry: IPipelineCatalogEntry, expand: HTMLButtonElement, details: HTMLElement): Promise<void> {
    if (expand.getAttribute('aria-expanded') === 'true') {
      expand.setAttribute('aria-expanded', 'false');
      expand.setAttribute('aria-label', `Expand ${entry.name}`);
      details.hidden = true;
      return;
    }
    expand.setAttribute('aria-expanded', 'true');
    expand.setAttribute('aria-label', `Collapse ${entry.name}`);
    details.hidden = false;
    const cachedDetails = this.detailsByPipelineId.get(entry.id);
    if (cachedDetails) {
      details.replaceChildren(this.pipelineDetails(cachedDetails));
      return;
    }
    details.replaceChildren(this.message('Loading contents…', 'pipeline-catalog-loading'));
    try {
      const pipelineDetails = await this.catalog.describePipelineCatalogEntry(entry);
      if (this.disposed || expand.getAttribute('aria-expanded') !== 'true') return;
      this.detailsByPipelineId.set(entry.id, pipelineDetails);
      details.replaceChildren(this.pipelineDetails(pipelineDetails));
    } catch (error) {
      if (this.disposed || expand.getAttribute('aria-expanded') !== 'true') return;
      details.replaceChildren(this.message('Pipeline contents could not be loaded.', 'pipeline-catalog-error'));
      this.events.emit('failed', { kind: 'pipeline-contents', message: `Could not load ${entry.name}.`, error });
    }
  }

  private pipelineDetails(details: IPipelineCatalogDetails): HTMLElement {
    const content = this.document.createElement('div');
    content.className = 'pipeline-tree-content';
    content.append(this.collectionGroup(details.collections), this.clipGroup('Clips', details.clipNames));
    return content;
  }

  private collectionGroup(collections: readonly IPipelineCatalogCollection[]): HTMLElement {
    const group = this.document.createElement('section');
    group.className = 'pipeline-tree-group pipeline-tree-collections';
    const heading = this.document.createElement('h3');
    heading.textContent = 'Collections';
    group.append(heading);
    if (collections.length === 0) {
      group.append(this.message('No saved collections.', 'pipeline-tree-empty'));
      return group;
    }
    const list = this.document.createElement('ul');
    for (const collection of collections) list.append(this.collectionEntry(collection));
    group.append(list);
    return group;
  }

  private collectionEntry(collection: IPipelineCatalogCollection): HTMLElement {
    const item = this.document.createElement('li');
    const toggle = this.document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pipeline-tree-collection';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `Expand collection ${collection.name}`);
    const name = this.document.createElement('span');
    name.textContent = collection.name;
    toggle.append(this.disclosureIcon(), name);
    const clips = this.clipList(collection.clipNames);
    clips.hidden = true;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} collection ${collection.name}`);
      clips.hidden = !expanded;
    });
    item.append(toggle, clips);
    return item;
  }

  private clipGroup(label: string, clipNames: readonly string[]): HTMLElement {
    const group = this.document.createElement('section');
    group.className = 'pipeline-tree-group pipeline-tree-clips';
    const heading = this.document.createElement('h3');
    heading.textContent = label;
    group.append(heading, this.clipList(clipNames));
    return group;
  }

  private clipList(clipNames: readonly string[]): HTMLUListElement {
    const list = this.document.createElement('ul');
    list.className = 'pipeline-tree-clip-list';
    if (clipNames.length === 0) {
      const empty = this.document.createElement('li');
      empty.className = 'pipeline-tree-empty';
      empty.textContent = 'No clips.';
      list.append(empty);
      return list;
    }
    for (const clipName of clipNames) {
      const clip = this.document.createElement('li');
      clip.className = 'pipeline-tree-clip';
      clip.textContent = clipName;
      list.append(clip);
    }
    return list;
  }

  private disclosureIcon(): HTMLElement {
    const icon = this.document.createElement('span');
    icon.className = 'pipeline-tree-disclosure';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  private message(text: string, className: string): HTMLElement {
    const message = this.document.createElement('p');
    message.className = className;
    message.textContent = text;
    return message;
  }

  private isCurrent(requestGeneration: number): boolean {
    return !this.disposed && requestGeneration === this.requestGeneration;
  }
}
