export interface IPipelineCatalogEntry {
  readonly id: string;
  readonly name: string;
}

export interface IPipelineCatalogCollection {
  readonly name: string;
  readonly clipNames: readonly string[];
}

export interface IPipelineCatalogDetails {
  readonly clipNames: readonly string[];
  readonly collections: readonly IPipelineCatalogCollection[];
}

export type PipelineCatalogResult =
  | { readonly kind: 'unconfigured' }
  | { readonly kind: 'available'; readonly entries: readonly IPipelineCatalogEntry[] };

export type PipelineCreationRequest = Readonly<{ name: string }>;

export type PipelineCreationRefusal = 'invalid-name' | 'name-taken' | 'no-top-folder' | 'top-folder-missing';

export type PipelineCreationProblem = PipelineCreationRefusal | 'failed';

export type PipelineCreationOutcome =
  | Readonly<{ kind: 'created'; name: string }>
  | Readonly<{ kind: 'refused'; reason: PipelineCreationRefusal }>;

export interface IPipelineCreationService {
  createPipeline(name: string): Promise<PipelineCreationOutcome>;
}
