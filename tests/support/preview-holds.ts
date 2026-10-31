// Counts a grid's preview holds; like the grid, a release takes effect once.
export class FakePreviewHolds {
  count = 0;

  holdPreviews(): () => void {
    this.count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.count -= 1;
    };
  }
}
