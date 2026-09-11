export class ClipLabelFormatter {
  readonly placeholderDuration = '--:--:--';

  formatDuration(seconds: number | null | undefined): string {
    const total = Math.round(Math.max(0, Number(seconds)));
    if (!Number.isFinite(total)) return this.placeholderDuration;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainingSeconds = total % 60;
    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(remainingSeconds)}`;
  }

  formatLabel(name: string, durationSeconds: number | null): string {
    const formattedDuration = Number.isFinite(durationSeconds)
      ? this.formatDuration(durationSeconds)
      : this.placeholderDuration;
    return `${name} (${formattedDuration})`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
