export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function after(ms, fn) {
  return setTimeout(fn, ms);
}

export function every(ms, fn) {
  return setInterval(fn, ms);
}

export function clear(id) {
  clearTimeout(id);
  clearInterval(id);
}
