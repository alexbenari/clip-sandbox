import type {
  IPipelineCatalogCollection,
  IPipelineCatalogDetails,
  IPipelineCatalogEntry,
  PipelineCatalogResult,
} from '../app/pipeline-catalog.js';

type PipelineCatalogPort = {
  listPipelineCatalog(): Promise<PipelineCatalogResult>;
  describePipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<IPipelineCatalogDetails>;
};

type PipelineCatalogControlOptions = {
  host: HTMLElement;
  catalog: PipelineCatalogPort;
  onLoadPipeline(entry: IPipelineCatalogEntry): Promise<void>;
  onError(message: string, error: unknown): void;
  document?: Document;
};

export class PipelineCatalogControl {
  private readonly host: HTMLElement;
  private readonly catalog: PipelineCatalogPort;
  private readonly onLoadPipeline: (entry: IPipelineCatalogEntry) => Promise<void>;
  private readonly onError: (message: string, error: unknown) => void;
  private readonly document: Document;
  private readonly detailsByPipelineId = new Map<string, IPipelineCatalogDetails>();
  private requestGeneration = 0;
  private destroyed = false;

  constructor(options: PipelineCatalogControlOptions) {
    this.host = options.host;
    this.catalog = options.catalog;
    this.onLoadPipeline = options.onLoadPipeline;
    this.onError = options.onError;
    this.document = options.document ?? document;
  }

  async load(): Promise<void> {
    const requestGeneration = ++this.requestGeneration;
    this.detailsByPipelineId.clear();
    this.host.replaceChildren(this.message('Loading pipelines…', 'pipeline-catalog-loading'));
    try {
      const result = await this.catalog.listPipelineCatalog();
      if (!this.isCurrent(requestGeneration)) return;
      this.renderCatalog(result);
    } catch (error) {
      if (!this.isCurrent(requestGeneration)) return;
      this.host.replaceChildren(this.message('Pipelines could not be loaded. Review the configured folder and try again.', 'pipeline-catalog-error'));
      this.onError('Could not load Pipelines.', error);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.requestGeneration += 1;
  }

  private renderCatalog(result: PipelineCatalogResult): void {
    if (result.kind === 'unconfigured') {
      this.host.replaceChildren(this.message('Configure a Pipelines top folder in Settings to see pipelines here.', 'pipeline-catalog-empty'));
      return;
    }
    if (result.entries.length === 0) {
      this.host.replaceChildren(this.message('No pipelines with video clips were found in the configured folder.', 'pipeline-catalog-empty'));
      return;
    }
    this.host.replaceChildren(...result.entries.map(entry => this.pipelineEntry(entry)));
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
    const load = this.document.createElement('button');
    load.type = 'button';
    load.className = 'pipeline-tree-load';
    load.textContent = 'Load';
    load.setAttribute('aria-label', `Load ${entry.name}`);
    const details = this.document.createElement('div');
    details.className = 'pipeline-tree-details';
    details.hidden = true;

    expand.addEventListener('click', () => { void this.togglePipeline(entry, expand, details); });
    load.addEventListener('click', () => { void this.onLoadPipeline(entry); });
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
      if (this.destroyed || expand.getAttribute('aria-expanded') !== 'true') return;
      this.detailsByPipelineId.set(entry.id, pipelineDetails);
      details.replaceChildren(this.pipelineDetails(pipelineDetails));
    } catch (error) {
      if (this.destroyed || expand.getAttribute('aria-expanded') !== 'true') return;
      details.replaceChildren(this.message('Pipeline contents could not be loaded.', 'pipeline-catalog-error'));
      this.onError(`Could not load ${entry.name}.`, error);
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
    return !this.destroyed && requestGeneration === this.requestGeneration;
  }
}
