// @ts-nocheck
export class ClockAdapter {
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  after(ms, fn) {
    return setTimeout(fn, ms);
  }

  every(ms, fn) {
    return setInterval(fn, ms);
  }

  clear(id) {
    clearTimeout(id);
    clearInterval(id);
  }
}

