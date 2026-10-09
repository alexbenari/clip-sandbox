import { Collection } from '../domain/collection.js';
import type { Pipeline } from '../domain/pipeline.js';
import type { CollectionNameValidator } from './collection-name-validator.js';

export type NewCollectionNameProblem = 'required' | 'illegal-chars' | 'already-exists';

export type NewCollectionNameCheckResult =
  | Readonly<{ kind: 'accepted'; name: string; filename: string }>
  | Readonly<{ kind: 'rejected'; problem: NewCollectionNameProblem; message: string }>;

export interface ILoadedPipelineSource {
  readonly pipeline: Pipeline | null;
}

export class NewCollectionNameCheck {
  constructor(
    private readonly loadedPipeline: ILoadedPipelineSource,
    private readonly messages: Pick<CollectionNameValidator, 'validationErrorText'>,
  ) {}

  check(name: string): NewCollectionNameCheckResult {
    const validity = Collection.validateCollectionName(name);
    if (validity.code) return this.rejected(validity.code);
    if (this.loadedPipeline.pipeline?.hasCollectionWithFilename(validity.filename)) return this.rejected('already-exists');
    return Object.freeze({ kind: 'accepted', name: validity.name, filename: validity.filename });
  }

  problemText(name: string): string {
    const result = this.check(name);
    return result.kind === 'rejected' ? result.message : '';
  }

  private rejected(problem: NewCollectionNameProblem): NewCollectionNameCheckResult {
    return Object.freeze({ kind: 'rejected', problem, message: this.messages.validationErrorText(problem) });
  }
}
