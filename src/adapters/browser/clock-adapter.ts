export class ClockAdapter {
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  after(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    return setTimeout(fn, ms);
  }

  every(ms: number, fn: () => void): ReturnType<typeof setInterval> {
    return setInterval(fn, ms);
  }

  clear(id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
    clearTimeout(id);
    clearInterval(id);
  }
}

