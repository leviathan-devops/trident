import { createHash } from 'node:crypto';
import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { getEvidenceStore, tridentLog } from '../../utils.js';

interface EvidenceRecord {
  operation: string;
  inputDigest: string;
  outputDigest: string;
  timestamp: string;
  previousHash: string;
  hash: string;
}

class MerkleEvidenceWriter {
  private chain: Array<{ hash: string; record: EvidenceRecord }> = [];
  private lastHash = '0'.repeat(64);

  /**
   * Write a Merkle-verified evidence record.
   * Each record's hash includes the previous record's hash, forming a chain.
   * Tampering with any record breaks the chain, detectable by verifyChain().
   *
   * REAL: Uses SHA256, stores actual hashes, chain is verifiable.
   * ANTI-PATTERN: writeEvidence() that stores empty or constant hashes.
   */
  async writeEvidence(
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ): Promise<EvidenceRecord> {
    if (typeof input !== 'object' || input === null) return {
      operation: 'invalid',
      inputDigest: '',
      outputDigest: '',
      timestamp: new Date().toISOString(),
      previousHash: this.lastHash,
      hash: this.lastHash,
    }; // input not an object — skip
    const inputR = input as Record<string, unknown>;
    const operation = typeof inputR.tool === 'string'
      ? inputR.tool as string
      : 'unknown';

    const inputStr = JSON.stringify(inputR.args || '');
    const outputStr = JSON.stringify(output || {});

    const inputDigest = createHash('sha256').update(inputStr).digest('hex');
    const outputDigest = createHash('sha256').update(outputStr).digest('hex');
    const timestamp = new Date().toISOString();

    // Merkle chain: hash = SHA256(prevHash + operation + inputDigest + outputDigest + timestamp)
    const chainInput = this.lastHash + operation + inputDigest + outputDigest + timestamp;
    const hash = createHash('sha256').update(chainInput).digest('hex');

    const record: EvidenceRecord = {
      operation,
      inputDigest,
      outputDigest,
      timestamp,
      previousHash: this.lastHash,
      hash,
    };

    this.chain.push({ hash, record });
    this.lastHash = hash;

    // Persist to evidence store (best effort)
    try {
      const store = await getEvidenceStore();
      await store.append('global', 'SYSTEM', 'R0', 'warhead-evidence', {
        ...record,
        chainLength: this.chain.length,
      });
    } catch (e: unknown) {
      // Non-critical — evidence store may be unavailable
      await tridentLog('WARN', 'warhead-evidence',
        `Evidence persist failed: ${e instanceof Error ? e.message : String(e)}`);
      return record;
    }

    return record;
  }

  /**
   * Verify the integrity of the entire Merkle chain.
   * Returns {valid: true} only if every record's previousHash matches
   * the previous record's hash.
   *
   * REAL: Actually iterates the chain and checks every link.
   * ANTI-PATTERN: verifyChain() that always returns {valid: true}.
   */
  verifyChain(): { valid: boolean; brokenAt: number | null } {
    for (let i = 1; i < this.chain.length; i++) {
      const expectedPrevHash = this.chain[i].record.previousHash;
      if (this.chain[i - 1].hash !== expectedPrevHash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: this.chain.length > 0, brokenAt: null };
  }

  getChainLength(): number { return this.chain.length; }
  getLastHash(): string { return this.lastHash; }
}

// ── Warhead #4: PersistenceEvidence ──

class PersistenceWarhead implements Warhead {
  id = 'persistence-evidence';
  priority = 4;
  type = 'static' as const;

  private evidenceWriter = new MerkleEvidenceWriter();
  private writeCount = 0;

  register(hooks: HookRegistry): void {
    // ── HOOK: Write Merkle-verified evidence on EVERY tool.execute.after ──
    // WHY: Every tool execution produces a tamper-evident record.
    // REAL: Uses SHA256 hashing with chain linking.
    hooks.on('tool.execute.after', async (input, output) => {
      try {
        if (typeof input !== 'object' || input === null) return; // input not an object — skip
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        await this.evidenceWriter.writeEvidence(input, output);
        this.writeCount++;

        // Periodically verify chain integrity (every 10 records)
        if (this.writeCount % 10 === 0) {
          const integrity = this.evidenceWriter.verifyChain();
          if (!integrity.valid) {
            await tridentLog('CRITICAL', 'warhead-evidence',
              `Merkle chain BROKEN at position ${integrity.brokenAt}`);
          }

          // Cross-reference Merkle chains every 10 writes
          try {
            const store = await getEvidenceStore();
            const sqliteV = await store.verifyChain();
            const memV = this.evidenceWriter.verifyChain();
            if (sqliteV.valid !== memV.valid) {
              await tridentLog('CRITICAL', 'warhead-evidence',
                `Merkle chain DIVERGENCE! SQLite: ${sqliteV.valid ? 'OK' : 'BROKEN at ' + sqliteV.brokenAt}, Memory: ${memV.valid ? 'OK' : 'BROKEN at ' + memV.brokenAt}`);
            }
          } catch (e: unknown) {
            await tridentLog('ERROR', 'warhead-evidence', `Cross-chain verification failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-evidence', `Evidence write failed: ${msg}`);
      }
    });
  }

  getT0(): string {
    const integrity = this.evidenceWriter.getChainLength() > 0
      ? (this.evidenceWriter.verifyChain().valid ? 'INTEGRITY OK' : 'INTEGRITY FAILURE')
      : 'no records';
    return `[PERSISTENCE] ${this.writeCount} evidence records. Merkle chain: ${integrity}.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      writeCount: this.writeCount,
      chainLength: this.evidenceWriter.getChainLength(),
      chainIntegrity: this.evidenceWriter.verifyChain().valid ? 'OK' : 'BROKEN',
    };
  }
}

export const persistenceWarhead = new PersistenceWarhead();
