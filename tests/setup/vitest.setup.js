// Guard against environments where Vitest worker globals are missing.
if (!globalThis.__vitest_worker__) {
  globalThis.__vitest_worker__ = {
    on() {},
    send() {},
    rpc: {},
  };
}
