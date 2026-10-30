export type ZoomEditName = 'refine' | 'loopify';

export type ZoomEditSourceInfo = 'movie-range' | 'movie-only';

type ZoomEditDeclaration = Readonly<{
  order: number;
  keepsAudio: boolean;
  playsBackward: boolean;
  sourceInfo: ZoomEditSourceInfo;
  filenameSuffix: string;
}>;

// Order 1 cuts, 3 loops; 2 is left for a later speed edit.
const DECLARATIONS: Readonly<Record<ZoomEditName, ZoomEditDeclaration>> = Object.freeze({
  refine: Object.freeze({ order: 1, keepsAudio: true, playsBackward: false, sourceInfo: 'movie-range', filenameSuffix: 'refined' }),
  loopify: Object.freeze({ order: 3, keepsAudio: false, playsBackward: true, sourceInfo: 'movie-only', filenameSuffix: 'looped' }),
});

const SOURCE_INFO_STRENGTH: readonly ZoomEditSourceInfo[] = ['movie-only', 'movie-range'];

export class ZoomEditComposition {
  private constructor(readonly edits: readonly ZoomEditName[]) {
    Object.freeze(this);
  }

  static of(staged: Iterable<ZoomEditName>): ZoomEditComposition {
    const edits = [...new Set(staged)];
    if (!edits.every(edit => Object.hasOwn(DECLARATIONS, edit))) throw new Error('Zoom edit is unknown.');
    edits.sort((first, second) => DECLARATIONS[first].order - DECLARATIONS[second].order);
    return new ZoomEditComposition(Object.freeze(edits));
  }

  get isEmpty(): boolean {
    return this.edits.length === 0;
  }

  includes(edit: ZoomEditName): boolean {
    return this.edits.includes(edit);
  }

  get keepsAudio(): boolean {
    return this.edits.every(edit => DECLARATIONS[edit].keepsAudio);
  }

  // The frames play forward, then the same frames backward.
  get playsBackward(): boolean {
    return this.edits.some(edit => DECLARATIONS[edit].playsBackward);
  }

  // The weakest source info any staged edit allows.
  get sourceInfo(): ZoomEditSourceInfo {
    const strengths = this.edits.map(edit => SOURCE_INFO_STRENGTH.indexOf(DECLARATIONS[edit].sourceInfo));
    return SOURCE_INFO_STRENGTH[Math.min(SOURCE_INFO_STRENGTH.length - 1, ...strengths)];
  }

  get filenameSuffix(): string {
    return this.edits.map(edit => `-${DECLARATIONS[edit].filenameSuffix}`).join('');
  }
}
