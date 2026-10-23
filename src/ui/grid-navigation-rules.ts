const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

type ArrowKey = typeof ARROW_KEYS[number];

export class GridNavigationRules {
  isArrowKey(key: string): key is ArrowKey {
    return (ARROW_KEYS as readonly string[]).includes(key);
  }

  // Cards fill rows left to right. Down from a row above a shorter last row lands on the last card.
  targetIndex({ key, index, columns, count }: { key: ArrowKey; index: number; columns: number; count: number }): number | null {
    const rowLength = Math.max(1, columns);
    const target = index + this.offset(key, rowLength);
    if (target >= 0 && target < count) return target;
    const isLastRow = Math.floor(index / rowLength) === Math.floor((count - 1) / rowLength);
    return key === 'ArrowDown' && !isLastRow ? count - 1 : null;
  }

  private offset(key: ArrowKey, rowLength: number): number {
    switch (key) {
      case 'ArrowLeft': return -1;
      case 'ArrowRight': return 1;
      case 'ArrowUp': return -rowLength;
      case 'ArrowDown': return rowLength;
    }
  }
}
