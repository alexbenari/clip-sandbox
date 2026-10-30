export type ZoomEditName = 'refine' | 'loopify';

export type ZoomEditSourceInfo = 'movie-range' | 'movie-only';

export type ZoomEditWords = Readonly<{ label: string; adjective: string }>;

// One method per edit, so an edit cannot be added until the text layer words it.
export interface IZoomEditWording {
  refine(): ZoomEditWords;
  loopify(): ZoomEditWords;
}

export type ZoomEditRangeFacts = Readonly<{ changesRange: boolean; frameCount: number }>;

export type ZoomEditRefusalReason = 'range-unchanged' | 'loop-needs-two-frames';

type ZoomEditDeclaration = Readonly<{
  name: ZoomEditName;
  order: number;
  keepsAudio: boolean;
  playsBackward: boolean;
  needsSourceMovie: boolean;
  sourceInfo: ZoomEditSourceInfo;
  filenameSuffix: string;
}>;

interface IZoomEdit {
  declaration(): ZoomEditDeclaration;
  wordsFrom(wording: IZoomEditWording): ZoomEditWords;
  refusal(facts: ZoomEditRangeFacts): ZoomEditRefusalReason | null;
}

// Order 1 cuts, 3 loops; 2 is left for a later speed edit.
class RefineEdit implements IZoomEdit {
  private static readonly declared: ZoomEditDeclaration = Object.freeze({
    name: 'refine', order: 1, keepsAudio: true, playsBackward: false, sourceInfo: 'movie-range', filenameSuffix: 'refined',
    // Extending the clip, and the movie range its source info records, use the movie around the clip.
    needsSourceMovie: true,
  });

  declaration(): ZoomEditDeclaration {
    return RefineEdit.declared;
  }

  wordsFrom(wording: IZoomEditWording): ZoomEditWords {
    return wording.refine();
  }

  refusal({ changesRange }: ZoomEditRangeFacts): ZoomEditRefusalReason | null {
    return changesRange ? null : 'range-unchanged';
  }
}

class LoopifyEdit implements IZoomEdit {
  private static readonly declared: ZoomEditDeclaration = Object.freeze({
    name: 'loopify', order: 3, keepsAudio: false, playsBackward: true, sourceInfo: 'movie-only', filenameSuffix: 'looped',
    needsSourceMovie: false,
  });

  declaration(): ZoomEditDeclaration {
    return LoopifyEdit.declared;
  }

  wordsFrom(wording: IZoomEditWording): ZoomEditWords {
    return wording.loopify();
  }

  refusal({ frameCount }: ZoomEditRangeFacts): ZoomEditRefusalReason | null {
    return frameCount >= 2 ? null : 'loop-needs-two-frames';
  }
}

// Edits cross the process boundary by name.
const EDITS_BY_NAME: ReadonlyMap<ZoomEditName, IZoomEdit> = new Map(
  [new RefineEdit(), new LoopifyEdit()].map(edit => [edit.declaration().name, edit]),
);

const SOURCE_INFO_STRENGTH: readonly ZoomEditSourceInfo[] = ['movie-only', 'movie-range'];

export class ZoomEditComposition {
  private constructor(private readonly staged: readonly IZoomEdit[]) {
    Object.freeze(this);
  }

  static of(staged: Iterable<ZoomEditName>): ZoomEditComposition {
    const edits = [...new Set(staged)].map(name => ZoomEditComposition.editOf(name))
      .sort((first, second) => first.declaration().order - second.declaration().order);
    return new ZoomEditComposition(Object.freeze(edits));
  }

  static names(): readonly ZoomEditName[] {
    return Object.freeze([...EDITS_BY_NAME.keys()]);
  }

  static wordsOf(name: ZoomEditName, wording: IZoomEditWording): ZoomEditWords {
    return ZoomEditComposition.editOf(name).wordsFrom(wording);
  }

  private static editOf(name: ZoomEditName): IZoomEdit {
    const edit = EDITS_BY_NAME.get(name);
    if (!edit) throw new Error('Zoom edit is unknown.');
    return edit;
  }

  get edits(): readonly ZoomEditName[] {
    return Object.freeze(this.declarations.map(declaration => declaration.name));
  }

  get isEmpty(): boolean {
    return this.staged.length === 0;
  }

  wordsFrom(wording: IZoomEditWording): readonly ZoomEditWords[] {
    return Object.freeze(this.staged.map(edit => edit.wordsFrom(wording)));
  }

  refusal(facts: ZoomEditRangeFacts): ZoomEditRefusalReason | null {
    for (const edit of this.staged) {
      const refusal = edit.refusal(facts);
      if (refusal) return refusal;
    }
    return null;
  }

  get keepsAudio(): boolean {
    return this.declarations.every(declaration => declaration.keepsAudio);
  }

  // The frames play forward, then the same frames backward.
  get playsBackward(): boolean {
    return this.declarations.some(declaration => declaration.playsBackward);
  }

  get needsSourceMovie(): boolean {
    return this.declarations.some(declaration => declaration.needsSourceMovie);
  }

  // The weakest source info any staged edit allows.
  get sourceInfo(): ZoomEditSourceInfo {
    const strengths = this.declarations.map(declaration => SOURCE_INFO_STRENGTH.indexOf(declaration.sourceInfo));
    return SOURCE_INFO_STRENGTH[Math.min(SOURCE_INFO_STRENGTH.length - 1, ...strengths)];
  }

  get filenameSuffix(): string {
    return this.declarations.map(declaration => `-${declaration.filenameSuffix}`).join('');
  }

  private get declarations(): readonly ZoomEditDeclaration[] {
    return this.staged.map(edit => edit.declaration());
  }
}
