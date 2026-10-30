// The answer shape of main-process operations that IPC boundaries pass on to the renderer.
class OperationResult {
  static failure(code, message = code) {
    return { ok: false, code, error: { message } };
  }
}

module.exports = { OperationResult };
