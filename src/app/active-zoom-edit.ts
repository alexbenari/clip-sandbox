export class ActiveZoomEdit {
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  begin(): void {
    if (this.active) throw new Error('Zoom edit mode is already active.');
    this.active = true;
  }

  end(): void {
    this.active = false;
  }
}
