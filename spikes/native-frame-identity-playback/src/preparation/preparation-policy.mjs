import { classifyPacketScan } from '../tooling/media-remediation.mjs';

export function selectPreparationPolicy(scan) {
  assertPacketScan(scan);
  const classification = classifyPacketScan(scan);
  const noPtsUsableKeyPackets = scan.keyPacketCount > 0 && scan.keyPacketsWithPts === 0;
  return {
    action: noPtsUsableKeyPackets ? 'normalize-timestamps' : 'use-source',
    reason: noPtsUsableKeyPackets
      ? 'no-pts-usable-key-packets'
      : scan.keyPacketCount === 0 ? 'no-key-packets-to-repair' : 'usable-key-packet-pts',
    normalizationContainer: noPtsUsableKeyPackets
      ? scan.codec === 'h264' ? 'nut' : 'matroska'
      : null,
    packedBFrameStatus: classification.packedBFrameStatus,
    packedBFrameDiagnosticRecommended: classification.packedBFrameDiagnosticRecommended,
    usesPackedBFrameFilter: false,
  };
}

export class PreparationStateMachine {
  #state = 'idle';
  #prepared = null;
  #error = null;

  get state() {
    return this.#state;
  }

  get error() {
    return this.#error;
  }

  begin() {
    if (this.#state !== 'idle') throw new Error(`Cannot begin preparation from ${this.#state}.`);
    this.#state = 'preparing';
  }

  publishReady(prepared) {
    if (this.#state !== 'preparing') throw new Error(`Cannot publish preparation from ${this.#state}.`);
    if (!prepared?.reviewAsset || !prepared?.index) {
      throw new Error('Prepared review state requires a review asset and index.');
    }
    this.#prepared = Object.freeze({ ...prepared });
    this.#state = 'exact-ready';
  }

  cancel() {
    if (this.#state !== 'preparing') throw new Error(`Cannot cancel preparation from ${this.#state}.`);
    this.#state = 'cancelled';
  }

  fail(error) {
    if (this.#state !== 'preparing') throw new Error(`Cannot fail preparation from ${this.#state}.`);
    this.#error = String(error?.message ?? error);
    this.#state = 'failed';
  }

  assertExactReady() {
    if (this.#state !== 'exact-ready') {
      throw new Error(`Prepared review is not exact-ready; current state is ${this.#state}.`);
    }
    return this.#prepared;
  }
}

function assertPacketScan(scan) {
  if (!scan || scan.type !== 'packet-scan') throw new Error('Packet scan result is missing or invalid.');
  for (const field of ['packetCount', 'keyPacketCount', 'keyPacketsWithPts']) {
    if (!Number.isInteger(scan[field]) || scan[field] < 0) {
      throw new Error(`Packet scan ${field} must be a non-negative integer.`);
    }
  }
  if (scan.keyPacketsWithPts > scan.keyPacketCount) {
    throw new Error('Packet scan reports more timestamped key packets than key packets.');
  }
}
