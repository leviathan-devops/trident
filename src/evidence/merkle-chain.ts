import { createHash } from 'crypto';

export interface MerkleEntry {
  id: number; sessionId: string; eventType: string;
  payload: string; previousHash: string; currentHash: string; timestamp: number;
}

// Pure JS in-memory Merkle chain — no WASM, no native deps, works everywhere
export class MerkleChain {
  private entries: MerkleEntry[] = [];
  private filePath: string | null;

  constructor(filePath?: string) {
    this.filePath = filePath || null;
  }

  async append(sessionId: string, eventType: string, payload: object): Promise<MerkleEntry> {
    const previousHash = this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);
    const id = this.entries.length + 1;
    const hashInput = sessionId + eventType + payloadStr + previousHash + timestamp;
    const currentHash = createHash('sha256').update(hashInput).digest('hex');
    const entry: MerkleEntry = { id, sessionId, eventType, payload: payloadStr, previousHash, currentHash, timestamp };
    this.entries.push(entry);
    return entry;
  }

  async getLastHash(): Promise<string> {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
  }

  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }> {
    // Empty chain — trivially valid, no entries to corrupt
    if (this.entries.length === 0) return { valid: true, brokenAt: null };
    // Verify each entry: hash integrity + chain linkage
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (i === 0) {
        if (entry.previousHash !== '') return { valid: false, brokenAt: entry.id };
      } else {
        if (entry.previousHash !== this.entries[i - 1].currentHash) return { valid: false, brokenAt: entry.id };
      }
      const hashInput = entry.sessionId + entry.eventType + entry.payload + entry.previousHash + entry.timestamp;
      const computedHash = createHash('sha256').update(hashInput).digest('hex');
      if (computedHash !== entry.currentHash) return { valid: false, brokenAt: entry.id };
    }
    // All entries verified — chain integrity confirmed
    return { valid: true, brokenAt: null };
  }

  async queryBySession(sessionId: string): Promise<MerkleEntry[]> {
    return this.entries.filter((e: MerkleEntry) => e.sessionId === sessionId);
  }

  async queryByEventType(eventType: string): Promise<MerkleEntry[]> {
    return this.entries.filter((e: MerkleEntry) => e.eventType === eventType);
  }

  close(): void {}
}
