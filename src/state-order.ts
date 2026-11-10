import type { ScanState } from './types.js';
/** Revisions are scoped to one server instance, never compared across restarts. */
export class SnapshotOrder {
  #instance = '';
  #revision = -1;
  #retired = new Set<string>();
  accept(next: ScanState, authoritative = false): boolean {
    if (!next.instanceId || this.#retired.has(next.instanceId)) return false;
    if (next.instanceId !== this.#instance) {
      // Only an RPC snapshot establishes a new epoch. Late/disconnected events
      // cannot replace a current instance; the next poll reconciles new events.
      if (!authoritative && this.#instance) return false;
      if (this.#instance) this.#retired.add(this.#instance);
      this.#instance = next.instanceId;
      this.#revision = -1;
    }
    if (next.revision < this.#revision) return false;
    this.#revision = next.revision;
    return true;
  }
}
