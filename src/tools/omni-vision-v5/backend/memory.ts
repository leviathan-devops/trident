// Omni Vision v5.0 — Backend Memory (bun:sqlite hot-state, session-scoped)
// The tool retains NOTHING between calls in-process — the FILESYSTEM + SQLite are the memory.
// Layout: ~/.vc-memory/{projectId}/sessions/{sessionKey}/
//   state.json       ← { sessionKey, projectId, lastFrameId, epochSummary, parentSessionId }
//   vision.sqlite    ← storyline / frames / analyses / timeline / epochs
//   frames/          ← raw extracted frames (referenced by SQLite)
//   analyses/        ← the JSON analysis records (append-only)
//   verify-log.jsonl ← the silent verify evidence trail

// @ts-ignore — bun:sqlite ships the runtime, not TS declarations (bun build resolves it natively — the same pattern as the trident's shadow-memory.ts)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface SessionState {
  sessionKey: string;
  projectId: string;
  lastFrameId: string | null;
  epochSummary: string | null;
  parentSessionId: string | null;
  created_at: string;
}

export interface AnalysisRecord {
  frame_id: string;
  seq: number;
  analysis_json: string;
  brief_hash: string;
  brain_model: string;
  vlm_model: string;
  created_at: string;
}

const MEMORY_ROOT = process.env.VC_MEMORY_ROOT || path.join(os.homedir(), '.vc-memory');

function nowIso(): string {
  return new Date().toISOString();
}

export class VisionMemory {
  readonly projectId: string;
  readonly sessionKey: string;
  readonly sessionDir: string;
  db: Database;

  private opened: boolean = false;

  constructor(projectId: string, sessionKey: string) {
    this.projectId = projectId;
    this.sessionKey = sessionKey;
    this.sessionDir = path.join(MEMORY_ROOT, projectId, 'sessions', sessionKey);
    // ASYNC-PROPER INIT (v5.1.3): the constructor performs NO I/O — it only
    // sets the paths. The filesystem + sqlite open happen in open() (awaited
    // by the pipeline), so no sync readFileSync/mkdirSync at construction.
    // THE FORKED FIREWALL (scoped execution): every write goes through
    // assertScopedWrite(). Writes outside = a loud error, never a silent pass.
    this.db = null as unknown as Database;
  }

  /** Lazy async open — the only I/O boundary for the memory root. */
  async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    await fs.promises.mkdir(path.join(this.sessionDir, 'frames'), { recursive: true });
    await fs.promises.mkdir(path.join(this.sessionDir, 'analyses'), { recursive: true });
    this.db = new Database(path.join(this.sessionDir, 'vision.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.initSchema();
    this.ensureStateFile();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyline (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        content TEXT NOT NULL,
        art_direction TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS frames (
        id INTEGER PRIMARY KEY,
        frame_id TEXT UNIQUE NOT NULL,
        media_path TEXT,
        media_type TEXT,
        extracted_at TEXT,
        frame_seq INTEGER
      );
      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY,
        frame_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        analysis_json TEXT NOT NULL,
        brief_hash TEXT,
        brain_model TEXT,
        vlm_model TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline (
        id INTEGER PRIMARY KEY,
        seq INTEGER NOT NULL,
        frame_id TEXT,
        summary TEXT,
        epoch INTEGER
      );
      CREATE TABLE IF NOT EXISTS epochs (
        id INTEGER PRIMARY KEY,
        epoch INTEGER NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  // ── THE SCOPED-WRITE GUARD (the forked firewall, re-scoped to the tool) ──
  assertScopedWrite(target: string): string {
    const resolved = path.resolve(target);
    const root = path.resolve(this.sessionDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`FIREWALL BLOCKED: write target ${resolved} is outside the session memory root ${root} — scoped execution allows the memory root only.`);
    }
    return resolved;
  }

  // ── state.json ──
  private ensureStateFile(): void {
    const statePath = path.join(this.sessionDir, 'state.json');
    if (!fs.existsSync(statePath)) {
      const state: SessionState = {
        sessionKey: this.sessionKey,
        projectId: this.projectId,
        lastFrameId: null,
        epochSummary: null,
        parentSessionId: null,
        created_at: nowIso(),
      };
      this.writeState(state);
    }
  }

  writeState(state: Partial<SessionState>): void {
    const current = this.readState();
    const merged: SessionState = { ...current, ...state };
    fs.writeFileSync(
      this.assertScopedWrite(path.join(this.sessionDir, 'state.json')),
      JSON.stringify(merged, null, 2),
      'utf8',
    );
  }

  readState(): SessionState {
    try {
      const raw = fs.readFileSync(path.join(this.sessionDir, 'state.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        return {
          sessionKey: typeof p.sessionKey === 'string' ? p.sessionKey : this.sessionKey,
          projectId: typeof p.projectId === 'string' ? p.projectId : this.projectId,
          lastFrameId: typeof p.lastFrameId === 'string' ? p.lastFrameId : null,
          epochSummary: typeof p.epochSummary === 'string' ? p.epochSummary : null,
          parentSessionId: typeof p.parentSessionId === 'string' ? p.parentSessionId : null,
          created_at: typeof p.created_at === 'string' ? p.created_at : nowIso(),
        };
      }
      return {
        sessionKey: this.sessionKey,
        projectId: this.projectId,
        lastFrameId: null,
        epochSummary: null,
        parentSessionId: null,
        created_at: nowIso(),
      };
    } catch {
      return {
        sessionKey: this.sessionKey,
        projectId: this.projectId,
        lastFrameId: null,
        epochSummary: null,
        parentSessionId: null,
        created_at: nowIso(),
      };
    }
  }

  // ── storyline ──
  setStoryline(content: string, artDirection?: string): void {
    const existing = this.getStoryline();
    if (existing) {
      this.db
        .query(`UPDATE storyline SET content = ?, art_direction = ?, version = version + 1, updated_at = ? WHERE id = 1`)
        .run(content, artDirection ?? existing.art_direction ?? null, nowIso());
    } else {
      this.db
        .query(`INSERT INTO storyline (version, content, art_direction, updated_at) VALUES (1, ?, ?, ?)`)
        .run(content, artDirection ?? null, nowIso());
    }
  }

  getStoryline(): { content: string; art_direction: string | null; version: number } | null {
    const row = this.db.query(`SELECT content, art_direction, version FROM storyline WHERE id = 1`).get() as
      | { content: string; art_direction: string | null; version: number }
      | undefined;
    return row ?? null;
  }

  // ── frames ──
  registerFrame(frameId: string, mediaPath: string, mediaType: string, seq: number): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO frames (frame_id, media_path, media_type, extracted_at, frame_seq)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(frameId, mediaPath, mediaType, nowIso(), seq);
    this.writeState({ lastFrameId: frameId });
  }

  // ── analyses ──
  appendAnalysis(record: AnalysisRecord): void {
    this.db
      .query(
        `INSERT INTO analyses (frame_id, seq, analysis_json, brief_hash, brain_model, vlm_model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.frame_id,
        record.seq,
        record.analysis_json,
        record.brief_hash,
        record.brain_model,
        record.vlm_model,
        record.created_at,
      );
    // The timeline beat: the first line of the analysis as the narrative summary
    const firstLine = record.analysis_json.split('\n').find((l) => l.trim().length > 0) ?? '';
    const summary = firstLine.length > 160 ? firstLine.substring(0, 160) + '…' : firstLine;
    this.db
      .query(`INSERT INTO timeline (seq, frame_id, summary, epoch) VALUES (?, ?, ?, ?)`)
      .run(record.seq, record.frame_id, summary, this.currentEpoch());
    fs.writeFileSync(
      this.assertScopedWrite(path.join(this.sessionDir, 'analyses', `${record.seq.toString().padStart(6, '0')}_${record.frame_id}.json`)),
      JSON.stringify(record, null, 2),
      'utf8',
    );
  }

  lastAnalyses(n: number): AnalysisRecord[] {
    const rows: unknown = this.db
      .query(`SELECT frame_id, seq, analysis_json, brief_hash, brain_model, vlm_model, created_at
              FROM analyses ORDER BY seq DESC LIMIT ?`)
      .all(n);
    const list = Array.isArray(rows) ? rows : [];
    const out: AnalysisRecord[] = [];
    for (const raw of list) {
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (typeof r.frame_id === 'string' && typeof r.analysis_json === 'string') {
          out.push({
            frame_id: r.frame_id,
            seq: typeof r.seq === 'number' ? r.seq : 0,
            analysis_json: r.analysis_json,
            brief_hash: typeof r.brief_hash === 'string' ? r.brief_hash : '',
            brain_model: typeof r.brain_model === 'string' ? r.brain_model : '',
            vlm_model: typeof r.vlm_model === 'string' ? r.vlm_model : '',
            created_at: typeof r.created_at === 'string' ? r.created_at : '',
          });
        }
      }
    }
    return out.reverse();
  }

  nextSeq(): number {
    const row: unknown = this.db.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM analyses`).get();
    const n = row && typeof row === 'object' ? (row as Record<string, unknown>).next : undefined;
    return typeof n === 'number' ? n : 1;
  }

  // ── epochs ──
  currentEpoch(): number {
    const row: unknown = this.db.query(`SELECT COALESCE(MAX(epoch), 0) AS e FROM epochs`).get();
    const e = row && typeof row === 'object' ? (row as Record<string, unknown>).e : undefined;
    return typeof e === 'number' ? e : 0;
  }

  appendEpoch(summary: string): void {
    const epoch = this.currentEpoch() + 1;
    this.db.query(`INSERT INTO epochs (epoch, summary, created_at) VALUES (?, ?, ?)`).run(epoch, summary, nowIso());
    this.writeState({ epochSummary: summary });
  }

  getEpochSummary(): string | null {
    const row = this.db.query(`SELECT summary FROM epochs ORDER BY epoch DESC LIMIT 1`).get() as
      | { summary: string }
      | undefined;
    return row?.summary ?? null;
  }

  // ── verify log (the silent verify evidence trail) ──
  appendVerifyLog(entry: Record<string, unknown>): void {
    fs.appendFileSync(
      this.assertScopedWrite(path.join(this.sessionDir, 'verify-log.jsonl')),
      JSON.stringify({ ...entry, ts: nowIso() }) + '\n',
      'utf8',
    );
  }

  close(): void {
    try { this.db.close(); } catch (e) {
      // Idempotent close — a second close throws "database is not open"; log and move on.
      console.error(`[vc-memory] close() for ${this.sessionKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  static memoryRoot(): string {
    return MEMORY_ROOT;
  }
}

/**
 * Resolve a session memory from a tether (session_key + project_id).
 * The tether chain: session_key → project_id → parent_session_id (attached by hooks).
 */
export function resolveMemory(projectId: string, sessionKey: string): VisionMemory {
  return new VisionMemory(projectId, sessionKey);
}
