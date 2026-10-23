// Lets queued promise continuations and zero-delay timers run before checking that something did not happen.
export function flushPendingWork(): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, 0); });
}
