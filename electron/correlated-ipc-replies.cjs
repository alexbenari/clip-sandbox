class CorrelatedIpcReplies {
  #label;
  #failureCode;
  #failureMessage;
  #logPrefix;

  constructor({ label, failureCode, failureMessage, logPrefix }) {
    this.#label = label;
    this.#failureCode = failureCode;
    this.#failureMessage = failureMessage;
    this.#logPrefix = logPrefix;
  }

  operationId(value, prefix) {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[a-zA-Z0-9_-]{8,120}$`).test(value)) {
      throw Object.assign(new Error(`${this.#label} operation id is invalid.`), { code: 'invalid-operation' });
    }
    return value;
  }

  sendProgress(sender, channel, progress) {
    try {
      if (!sender.isDestroyed?.()) sender.send(channel, progress);
    } catch (error) {
      console.warn(`[${this.#logPrefix}] progress-delivery-failed`, { kind: error instanceof Error ? error.name : 'unknown' });
    }
  }

  envelope(operationId, result) {
    return result?.ok === true
      ? { ok: true, operationId, result: result.result }
      : {
        ok: false,
        operationId,
        error: {
          code: String(result?.code || this.#failureCode),
          message: String(result?.error?.message || this.#failureMessage).slice(0, 1024),
        },
      };
  }

  // Thrown messages can name files, so the renderer gets a fixed one.
  failure(operationId, error) {
    const invalidOperation = error?.code === 'invalid-operation';
    return this.envelope(operationId, {
      ok: false,
      code: invalidOperation ? 'invalid-operation' : this.#failureCode,
      error: { message: invalidOperation ? `${this.#label} operation id is invalid.` : this.#failureMessage },
    });
  }
}

module.exports = { CorrelatedIpcReplies };
