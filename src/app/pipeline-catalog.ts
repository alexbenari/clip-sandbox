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
