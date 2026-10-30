// The anchor is the clip a Shift range starts from: the one last selected or toggled on its own.
export class GridSelection {
  private clipIds = new Set<string>();
  private anchorClipId: string | null = null;

  has(clipId: string): boolean {
    return this.clipIds.has(clipId);
  }

  selectOnly(clipId: string | null): void {
    this.clipIds = clipId ? new Set([clipId]) : new Set();
    this.anchorClipId = clipId;
  }

  toggle(clipId: string): void {
    if (this.clipIds.has(clipId)) this.clipIds.delete(clipId);
    else this.clipIds.add(clipId);
    this.anchorClipId = clipId;
  }

  extendTo(orderedClipIds: readonly string[], fallbackAnchorClipId: string, clipId: string): void {
    const anchor = this.anchorClipId && orderedClipIds.includes(this.anchorClipId) ? this.anchorClipId : fallbackAnchorClipId;
    const anchorIndex = orderedClipIds.indexOf(anchor);
    const index = orderedClipIds.indexOf(clipId);
    this.clipIds = new Set(orderedClipIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1));
    this.anchorClipId = anchor;
  }

  retainWhere(keep: (clipId: string) => boolean): void {
    this.clipIds = new Set([...this.clipIds].filter(keep));
    if (this.anchorClipId && !keep(this.anchorClipId)) this.anchorClipId = null;
  }

  clear(): void {
    this.selectOnly(null);
  }
}
