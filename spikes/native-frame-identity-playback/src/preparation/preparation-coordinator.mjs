import {
  PreparationStateMachine,
  selectPreparationPolicy,
} from './preparation-policy.mjs';

export class PreparationCoordinator {
  #operations;
  #emit;

  constructor(operations, emit = () => {}) {
    for (const name of ['scan', 'normalize', 'index', 'publish', 'cleanup']) {
      if (typeof operations?.[name] !== 'function') {
        throw new Error(`Preparation operation ${name} is required.`);
      }
    }
    this.#operations = operations;
    this.#emit = emit;
    this.state = new PreparationStateMachine();
  }

  async prepare({ source, signal }) {
    this.state.begin();
    let work;
    try {
      this.#emit({ type: 'preparation-phase', phase: 'preflight', source });
      const sourceScan = await this.#operations.scan(source, { signal });
      const policy = selectPreparationPolicy(sourceScan);
      this.#emit({ type: 'preparation-policy', source, ...policy });
      throwIfAborted(signal);

      let reviewAsset = source;
      if (policy.action === 'normalize-timestamps') {
        this.#emit({ type: 'preparation-phase', phase: 'normalization', source });
        work = await this.#operations.normalize(source, { signal, sourceScan, policy });
        reviewAsset = work.reviewAsset;
        this.#emit({ type: 'preparation-phase', phase: 'review-preflight', source });
        const reviewScan = await this.#operations.scan(reviewAsset, { signal });
        if (sourceScan.packetPayloadDigest !== reviewScan.packetPayloadDigest) {
          throw new Error('Timestamp normalization changed the selected-track packet payload digest.');
        }
      }
      throwIfAborted(signal);

      this.#emit({ type: 'preparation-phase', phase: 'indexing', source });
      const indexed = await this.#operations.index(reviewAsset, { signal, sourceScan, policy, work });
      throwIfAborted(signal);
      const candidate = { reviewAsset, ...indexed, policy, sourceScan, ...work };
      const prepared = await this.#operations.publish(candidate, { signal });
      this.state.publishReady(prepared);
      this.#emit({ type: 'preparation-ready', source, reviewAsset, index: prepared.index });
      return prepared;
    } catch (error) {
      await this.#operations.cleanup(work);
      if (error?.name === 'AbortError' || signal?.aborted) {
        this.state.cancel();
        this.#emit({ type: 'preparation-cancelled', source });
      } else {
        this.state.fail(error);
        this.#emit({ type: 'preparation-failed', source, message: String(error?.message ?? error) });
      }
      throw error;
    }
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Preparation cancelled.', 'AbortError');
}
