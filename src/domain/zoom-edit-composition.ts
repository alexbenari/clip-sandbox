export type ZoomEditName = 'refine' | 'loopify';

export type ZoomEditSourceInfo = 'movie-range' | 'movie-only';

type ZoomEditDeclaration = Readonly<{
  name: ZoomEditName;
  label: string;
  adjective: string;
  order: number;
  keepsAudio: boolean;
  playsBackward: boolean;
  sourceInfo: ZoomEditSourceInfo;
  filenameSuffix: string;
}>;

// How each edit is staged still branches on its name in the session, the save request and StagedEditResolver.
// Move that onto the edits when a third edit is added.
interface IZoomEdit {
  declaration(): ZoomEditDeclaration;
}

// Order 1 cuts, 3 loops; 2 is left for a later speed edit.
class RefineEdit implements IZoomEdit {
  private static readonly declared: ZoomEditDeclaration = Object.freeze({
    name: 'refine', label: 'Refine', adjective: 'refined',
    order: 1, keepsAudio: true, playsBackward: false, sourceInfo: 'movie-range', filenameSuffix: 'refined',
  });

  declaration(): ZoomEditDeclaration {
    return RefineEdit.declared;
  }
}

class LoopifyEdit implements IZoomEdit {
  private static readonly declared: ZoomEditDeclaration = Object.freeze({
    name: 'loopify', label: 'Loopify', adjective: 'looped',
    order: 3, keepsAudio: false, playsBackward: true, sourceInfo: 'movie-only', filenameSuffix: 'looped',
  });

  declaration(): ZoomEditDeclaration {
    return LoopifyEdit.declared;
  }
}

// Edits cross the process boundary by name.
const EDITS_BY_NAME: ReadonlyMap<ZoomEditName, IZoomEdit> = new Map(
  [new RefineEdit(), new LoopifyEdit()].map(edit => [edit.declaration().name, edit]),
);

const SOURCE_INFO_STRENGTH: readonly ZoomEditSourceInfo[] = ['movie-only', 'movie-range'];

export class ZoomEditComposition {
  private constructor(private readonly declarations: readonly ZoomEditDeclaration[]) {
    Object.freeze(this);
  }

  static of(staged: Iterable<ZoomEditName>): ZoomEditComposition {
    const names = [...new Set(staged)];
    const declarations = names.map(name => ZoomEditComposition.declarationOf(name)).sort((first, second) => first.order - second.order);
    return new ZoomEditComposition(Object.freeze(declarations));
  }

  static labelOf(name: ZoomEditName): string {
    return ZoomEditComposition.declarationOf(name).label;
  }

  private static declarationOf(name: ZoomEditName): ZoomEditDeclaration {
    const edit = EDITS_BY_NAME.get(name);
    if (!edit) throw new Error('Zoom edit is unknown.');
    return edit.declaration();
  }

  get edits(): readonly ZoomEditName[] {
    return Object.freeze(this.declarations.map(declaration => declaration.name));
  }

  get isEmpty(): boolean {
    return this.declarations.length === 0;
  }

  includes(edit: ZoomEditName): boolean {
    return this.declarations.some(declaration => declaration.name === edit);
  }

  get labels(): readonly string[] {
    return Object.freeze(this.declarations.map(declaration => declaration.label));
  }

  get adjectives(): readonly string[] {
    return Object.freeze(this.declarations.map(declaration => declaration.adjective));
  }

  get keepsAudio(): boolean {
    return this.declarations.every(declaration => declaration.keepsAudio);
  }

  // The frames play forward, then the same frames backward.
  get playsBackward(): boolean {
    return this.declarations.some(declaration => declaration.playsBackward);
  }

  // The weakest source info any staged edit allows.
  get sourceInfo(): ZoomEditSourceInfo {
    const strengths = this.declarations.map(declaration => SOURCE_INFO_STRENGTH.indexOf(declaration.sourceInfo));
    return SOURCE_INFO_STRENGTH[Math.min(SOURCE_INFO_STRENGTH.length - 1, ...strengths)];
  }

  get filenameSuffix(): string {
    return this.declarations.map(declaration => `-${declaration.filenameSuffix}`).join('');
  }
}
