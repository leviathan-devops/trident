import initSqlJs from 'sql.js';
import type { SqlJsDatabase } from 'sql.js';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface EvidenceRow {
  id: number;
  sessionId: string;
  mode: string;
  layer: string;
  eventType: string;
  payload: string;
  inputDigest: string;
  outputDigest: string;
  previousHash: string;
  hash: string;
  timestamp: string;
}

export class EvidenceStore {
  private db: SqlJsDatabase | null = null;
  private initialized = false;
  private dbPath: string;
  private previousHash: string = '0'.repeat(64);
  private persistCounter = 0;

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.dbPath = path.join(dir, '.trident', 'evidence.db');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const SQL = await initSqlJs();

    // Seed from disk if file exists
    let sqlBytes: Buffer | null = null;
    try {
      if (fs.existsSync(this.dbPath)) {
        sqlBytes = fs.readFileSync(this.dbPath);
        console.log(`[EvidenceStore] Loaded existing DB: ${this.dbPath} (${sqlBytes.length} bytes)`);
      }
    } catch (e: unknown) {
      console.warn(`[EvidenceStore] Could not read ${this.dbPath}: ${e instanceof Error ? e.message : String(e)} — starting fresh`);
    }

    this.db = new SQL.Database(sqlBytes);

    this.db.run(`CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT, mode TEXT, layer TEXT, eventType TEXT,
      payload TEXT, inputDigest TEXT, outputDigest TEXT,
      previousHash TEXT, hash TEXT, timestamp TEXT
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
    this.db.run(`PRAGMA journal_mode=WAL`);

    // Restore last hash from previous session
    const stmt = this.db.prepare(`SELECT value FROM meta WHERE key = 'lastHash'`);
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      this.previousHash = row.value as string;
      console.log(`[EvidenceStore] Restored lastHash: ${this.previousHash.substring(0, 16)}...`);
    }
    stmt.free();
    this.initialized = true;
  }

  async append(
    sessionId: string, mode: string, layer: string,
    eventType: string, payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error('[P2] EvidenceStore: db not initialized');

    const payloadStr = JSON.stringify(payload);
    const inputDigest = createHash('sha256').update(payloadStr).digest('hex');
    const outputDigest = createHash('sha256').update(eventType).digest('hex');
    const hashInput = this.previousHash + eventType + inputDigest + outputDigest;
    const hash = createHash('sha256').update(hashInput).digest('hex');
    const timestamp = new Date().toISOString();

    this.db.run(
      `INSERT INTO evidence (sessionId, mode, layer, eventType, payload, inputDigest, outputDigest, previousHash, hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, mode, layer, eventType, payloadStr, inputDigest, outputDigest, this.previousHash, hash, timestamp]
    );

    this.previousHash = hash;
    this.db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('lastHash', ?)`, [hash]);

    this.persistCounter++;
    if (this.persistCounter % 10 === 0) {
      try {
        const data = this.db!.export();
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.dbPath, Buffer.from(data));
      } catch { /* best-effort */ }
    }

    return { id: 0, sessionId, mode, layer, eventType, payload: payloadStr, previousHash: this.previousHash, currentHash: hash, timestamp: Date.parse(timestamp) };
  }

  async queryBySession(sessionId: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];
    const stmt = this.db.prepare(`SELECT * FROM evidence WHERE sessionId = ? ORDER BY id`);
    stmt.bind([sessionId]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  async queryByMode(mode: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];
    const stmt = this.db.prepare(`SELECT * FROM evidence WHERE mode = ? ORDER BY id`);
    stmt.bind([mode]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  async queryByLayer(layer: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];
    const stmt = this.db.prepare(`SELECT * FROM evidence WHERE layer = ? ORDER BY id`);
    stmt.bind([layer]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  async queryByTimestamp(start: number, end: number): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];
    const stmt = this.db.prepare(
      `SELECT * FROM evidence WHERE CAST(strftime('%s', timestamp) AS INTEGER) * 1000 >= ? AND CAST(strftime('%s', timestamp) AS INTEGER) * 1000 <= ? ORDER BY id`
    );
    stmt.bind([start, end]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  async queryBySessionAndMode(sessionId: string, mode: string): Promise<Record<string, unknown>[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];
    const stmt = this.db.prepare(`SELECT * FROM evidence WHERE sessionId = ? AND mode = ? ORDER BY id`);
    stmt.bind([sessionId, mode]);
    const results: Record<string, unknown>[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  async compact(maxAgeMs: number): Promise<{ deleted: number; newRootHash: string }> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return { deleted: 0, newRootHash: this.previousHash };
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM evidence WHERE timestamp < ?`);
    stmt.bind([cutoff]);
    let count = 0;
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      count = row.cnt as number;
    }
    stmt.free();
    this.db.run(`DELETE FROM evidence WHERE timestamp < ?`, [cutoff]);

    // Persist to disk after compaction
    try {
      const data = this.db!.export();
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch { /* best-effort */ }

    return { deleted: count, newRootHash: this.previousHash };
  }

  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return { valid: false, brokenAt: null };
    const stmt = this.db.prepare(`SELECT * FROM evidence ORDER BY id`);
    let validPrevHash = '0'.repeat(64);
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as EvidenceRow;
      if (row.previousHash !== validPrevHash) {
        stmt.free();
        return { valid: false, brokenAt: row.id };
      }
      const recomputed = createHash('sha256').update(row.previousHash + row.eventType + row.inputDigest + row.outputDigest).digest('hex');
      if (recomputed !== row.hash) {
        stmt.free();
        return { valid: false, brokenAt: row.id };
      }
      validPrevHash = row.hash;
    }
    stmt.free();
    return { valid: true, brokenAt: null };
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        // Persist to disk before closing
        const data = this.db.export();
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.dbPath, Buffer.from(data));
        console.log(`[EvidenceStore] Persisted DB: ${this.dbPath} (${data.length} bytes)`);
      } catch (e: unknown) {
        console.error('[EvidenceStore] Persist failed:', e instanceof Error ? e.message : String(e));
      }
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
