import { createHash } from 'crypto';
import { MerkleChain } from './merkle-chain.js';

export interface EvidenceEntry {
  id: number; sessionId: string; mode: string; layer: string;
  eventType: string; payload: string; previousHash: string;
  currentHash: string; timestamp: number;
}

export class EvidenceStore {
  private entries: EvidenceEntry[] = [];
  private merkle: MerkleChain;

  constructor() {
    this.merkle = new MerkleChain();
  }

  async queryBySession(sessionId: string): Promise<EvidenceEntry[]> {
    return this.entries.filter((e: EvidenceEntry) => e.sessionId === sessionId);
  }
  async queryByMode(mode: string): Promise<EvidenceEntry[]> {
    return this.entries.filter((e: EvidenceEntry) => e.mode === mode);
  }
  async queryByLayer(layer: string): Promise<EvidenceEntry[]> {
    return this.entries.filter((e: EvidenceEntry) => e.layer === layer);
  }
  async queryByTimestamp(start: number, end: number): Promise<EvidenceEntry[]> {
    return this.entries.filter((e: EvidenceEntry) => e.timestamp >= start && e.timestamp <= end);
  }
  async queryBySessionAndMode(sessionId: string, mode: string): Promise<EvidenceEntry[]> {
    return this.entries.filter((e: EvidenceEntry) => e.sessionId === sessionId && e.mode === mode);
  }

  async append(sessionId: string, mode: string, layer: string, eventType: string, payload: object): Promise<EvidenceEntry> {
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);
    const prevHash = this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
    const hashInput = sessionId + mode + layer + eventType + payloadStr + prevHash + timestamp;
    const currentHash = createHash('sha256').update(hashInput).digest('hex');
    const id = this.entries.length + 1;
    const entry: EvidenceEntry = { id, sessionId, mode, layer, eventType, payload: payloadStr, previousHash: prevHash, currentHash, timestamp };
    this.entries.push(entry);
    await this.merkle.append(sessionId, eventType, { mode, layer, payload });
    return entry;
  }

  async compact(maxAgeMs: number): Promise<{ deleted: number; newRootHash: string }> {
    const cutoff = Date.now() - maxAgeMs;
    const oldEntries = this.entries.filter((e: EvidenceEntry) => e.timestamp < cutoff);
    if (oldEntries.length === 0) return { deleted: 0, newRootHash: this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '' };
    let aggregateHash = '';
    for (const entry of oldEntries) {
      const hashInput = entry.sessionId + entry.mode + entry.layer + entry.eventType + entry.payload + entry.previousHash + entry.currentHash + entry.timestamp;
      aggregateHash = createHash('sha256').update(hashInput).digest('hex');
    }
    this.entries = this.entries.filter((e: EvidenceEntry) => e.timestamp >= cutoff);
    const compactTime = Date.now();
    const markerPayload = JSON.stringify({ deletedCount: oldEntries.length, aggregateHash });
    const prevHash = this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
    const markerId = this.entries.length + 1;
    const hashInput = 'system' + 'COMPACTION' + 'R0' + 'compaction' + markerPayload + prevHash + compactTime;
    const markerHash = createHash('sha256').update(hashInput).digest('hex');
    const marker: EvidenceEntry = {
      id: markerId, sessionId: 'system', mode: 'COMPACTION', layer: 'R0',
      eventType: 'compaction', payload: markerPayload,
      previousHash: prevHash,
      currentHash: markerHash, timestamp: compactTime,
    };
    this.entries.push(marker);
    return { deleted: oldEntries.length, newRootHash: markerHash };
  }

  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }> {
    // Empty chain — trivially valid, no entries to corrupt
    if (this.entries.length === 0) return { valid: true, brokenAt: null };
    // Verify each entry: hash integrity + chain linkage
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (i > 0 && e.previousHash !== this.entries[i - 1].currentHash) return { valid: false, brokenAt: e.id };
      const hashInput = e.sessionId + e.mode + e.layer + e.eventType + e.payload + e.previousHash + e.timestamp;
      const computed = createHash('sha256').update(hashInput).digest('hex');
      if (computed !== e.currentHash) return { valid: false, brokenAt: e.id };
    }
    // All entries verified — chain integrity confirmed
    return { valid: true, brokenAt: null };
  }

  close(): void { if (this.merkle) this.merkle.close(); }
}
