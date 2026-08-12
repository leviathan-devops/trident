// ═══ SHADOW-MEMORY — THE SESSION-SCOPED SQLITE MEMORY (the shadow backend's Stage 7) ═══
// The task-preflight's shadow backend (SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC §3.3 + §4 step 3
// + the macro architecture Part 1 Stage 7). The tool process retains NOTHING between calls
// — the FILESYSTEM + SQLite ARE the memory. The relationship between calls is materialized
// as CONTEXT (the chain: lastPrompts + epochSummary + nextSeq), never as agent behavior (L3).
//
// Layout: ~/.trident-preflight-memory/{project}/{sessionKey}/
//   state.json       ← { sessionKey, projectId, parentSessionId, lastSeq, episode, created_at }
//   preflight.sqlite ← the prompts table (WAL mode — the QUERYABLE state + the TEST SURFACE)
//   prompts/         ← the append-only JSON mirror: {seq}_{name}.json (the audit trail)
//
// THE SESSION SCOPE (L5): the root is key-derived {project} × {sessionKey} — two sessions on
// one project NEVER mix. The table's MAX(seq) is the seq authority (nextSeq reads it), so a
// mirror failure can never desync the sequence. The read path is runtime-validated (the
// 81-finding lesson: untyped casts crash on schema drift — every row cast is CHECKED before
// use; invalid rows are SKIPPED, never a crash).
//
// The memory root defaults to the home dir (the spec F-4: NEVER /tmp — session-scoped, not
// global) and is overridable via TRIDENT_PREFLIGHT_MEMORY_ROOT (the Omni's VC_MEMORY_ROOT
// pattern — the tests point it at a tmp sandbox; the production default stays in home).

import { tridentLog } from '../../utils.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// @ts-ignore — bun:sqlite ships the runtime, not TS declarations (bun build resolves it natively)
import { Database } from 'bun:sqlite';

// Minimal local typings for the bun:sqlite surface we use (bun ships no type package).
interface SqliteStatement<T = unknown> {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
}
interface SqliteDatabase {
  exec(sql: string): void;
  query<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
}

// The ready floor — the tool's `ready` = validated && lines >= 125 (the §7.7 firewall floor:
// "every generated prompt >= 125 lines"). NAMED here so the epochSummary's ready-rate can
// never drift from the tool's own definition (the macro rule: floors are named constants).
export const READY_FLOOR_LINES = 125;

export interface PromptRecord {
  seq: number;
  name: string;
  prompt_text: string;
  sha256: string;
  template: string;
  validated: boolean;
  lines: number;
  created_at: string;
}

export interface EpochSummary {
  count: number;
  avgLines: number;
  readyRate: number;
}

export interface Episode {
  trigger: string | null;
  count: number;
  lastAt: string | null;
}

export interface SessionState {
  sessionKey: string;
  projectId: string;
  parentSessionId: string | null;
  lastSeq: number;
  episode: Episode;
  created_at: string;
}

// THE DDL (verbatim from the spec §3.3 — the memory DDL is the test surface; a schema change
// updates the battery's assertions). The seq index is the macro pattern's standard companion
// for the ORDER BY seq chain reads (lastPrompts runs on EVERY call).
const PROMPTS_DDL = `
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, seq INTEGER NOT NULL UNIQUE, name TEXT NOT NULL,
  prompt_text TEXT NOT NULL, sha256 TEXT NOT NULL, template TEXT NOT NULL,
  validated INTEGER NOT NULL, lines INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompts_seq ON prompts(seq);
`;

function nowIso(): string {
  return new Date().toISOString();
}

/** The memory root — the home dir by default (F-4: NEVER /tmp), env-overridable for tests. */
export function resolveMemoryRoot(): string {
  return process.env.TRIDENT_PREFLIGHT_MEMORY_ROOT || path.join(os.homedir(), '.trident-preflight-memory');
}

/** The append-only mirror's file name: {seq}_{name}.json — zero-padded seq (the macro
 *  pattern's 000001_* convention), the name sanitized for the filesystem. Exported so the
 *  tests build the expected path from the SAME function (no drift between the assertion
 *  and the implementation). */
export function promptMirrorFileName(seq: number, name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '-') || 'prompt';
  return `${seq.toString().padStart(6, '0')}_${safe}.json`;
}

export class ShadowMemory {
  readonly projectId: string;
  readonly sessionKey: string;
  /** The session memory root: {memoryRoot}/{project}/{sessionKey} — the gate's memoryRoot. */
  readonly sessionDir: string;
  /** PUBLIC by design (the Omni's `readonly db` reference): the prompts table is the TEST
   *  SURFACE — the zero-hint battery asserts against the table, never the prose. */
  readonly db: SqliteDatabase;

  private constructor(projectId: string, sessionKey: string, sessionDir: string, db: SqliteDatabase) {
    this.projectId = projectId;
    this.sessionKey = sessionKey;
    this.sessionDir = sessionDir;
    this.db = db;
  }

  /** open(project, sessionKey) → Memory (the spec §3.3). Idempotent: opening an EXISTING
   *  root resumes it — the state + the sqlite persist; a re-open sees the prior appends
   *  (the same-key → same-memory property the coherence battery asserts). */
  static open(projectId: string, sessionKey: string): ShadowMemory {
    const sessionDir = path.join(resolveMemoryRoot(), projectId, sessionKey);
    fs.mkdirSync(path.join(sessionDir, 'prompts'), { recursive: true });
    const db = new Database(path.join(sessionDir, 'preflight.sqlite')) as SqliteDatabase;
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(PROMPTS_DDL);
    const mem = new ShadowMemory(projectId, sessionKey, sessionDir, db);
    mem.ensureStateFile();
    return mem;
  }

  // ── state.json ──
  private defaultState(): SessionState {
    return {
      sessionKey: this.sessionKey,
      projectId: this.projectId,
      parentSessionId: null,
      lastSeq: 0,
      episode: { trigger: null, count: 0, lastAt: null },
      created_at: nowIso(),
    };
  }

  private ensureStateFile(): void {
    const statePath = path.join(this.sessionDir, 'state.json');
    if (!fs.existsSync(statePath)) {
      this.writeState(this.defaultState());
    }
  }

  /** Runtime-validated read: a missing/corrupt state.json NEVER crashes a call — it
   *  recovers to the default state and logs (the 81-finding lesson; "skip, never crash"). */
  readState(): SessionState {
    const statePath = path.join(this.sessionDir, 'state.json');
    let raw: string;
    try {
      raw = fs.readFileSync(statePath, 'utf8');
    } catch (e) {
      void tridentLog('WARN', 'shadow-memory',
        `readState: state.json unreadable at ${this.sessionDir} — using the default state: ${e instanceof Error ? e.message : String(e)}`);
      return this.defaultState();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>;
        const ep = p.episode && typeof p.episode === 'object' ? (p.episode as Record<string, unknown>) : {};
        return {
          sessionKey: typeof p.sessionKey === 'string' ? p.sessionKey : this.sessionKey,
          projectId: typeof p.projectId === 'string' ? p.projectId : this.projectId,
          parentSessionId: typeof p.parentSessionId === 'string' ? p.parentSessionId : null,
          lastSeq: typeof p.lastSeq === 'number' ? p.lastSeq : 0,
          episode: {
            trigger: typeof ep.trigger === 'string' ? ep.trigger : null,
            count: typeof ep.count === 'number' ? ep.count : 0,
            lastAt: typeof ep.lastAt === 'string' ? ep.lastAt : null,
          },
          created_at: typeof p.created_at === 'string' ? p.created_at : nowIso(),
        };
      }
    } catch (e) {
      void tridentLog('WARN', 'shadow-memory',
        `readState: state.json parse failed at ${this.sessionDir} — using the default state: ${e instanceof Error ? e.message : String(e)}`);
    }
    return this.defaultState();
  }

  writeState(patch: Partial<SessionState>): void {
    const merged: SessionState = { ...this.readState(), ...patch };
    fs.writeFileSync(path.join(this.sessionDir, 'state.json'), JSON.stringify(merged, null, 2), 'utf8');
  }

  /** The episode is the session's narrative counter (the shadow-agent's episode shape).
   *  A SESSION_SWITCH / milestone advances it; the trigger names the cause. */
  advanceEpisode(trigger: string | null): Episode {
    const cur = this.readState();
    const episode: Episode = { trigger, count: cur.episode.count + 1, lastAt: nowIso() };
    this.writeState({ episode });
    return episode;
  }

  // ── the prompts table ──

  /** appendPrompt(record) → the DUAL WRITE (the spec §3.3 / macro Stage 7): the sqlite row
   *  FIRST (the queryable state + the test surface), then the append-only JSON mirror (the
   *  audit trail), then state.json.lastSeq. Side effects precede claims. A failure in either
   *  leg PROPAGATES with the precise partial-write state named — a silent half-write would
   *  be a silent failure (CRITICAL).
   *  THE ATOMIC SEQ (2026-08-07 — the parallel-wave race, live): the OLD flow was
   *  nextSeq() (SELECT MAX(seq)+1) THEN the INSERT — a TOCTOU race under the PARALLEL
   *  generation (the wave manager's Promise.allSettled runs N pipelines on the SAME
   *  session DB): all N read MAX(seq)=0 → all INSERT seq=1 → the UNIQUE constraint killed
   *  all but one → appendPrompt THREW → the generation FAILED → the batch form carried
   *  EMPTY prompts (the silent-failure the loud-fail law bans). THE FIX: the INSERT
   *  computes (SELECT COALESCE(MAX(seq),0)+1) INSIDE the statement — sqlite serializes the
   *  writes, each INSERT sees the committed MAX → the seqs are unique BY CONSTRUCTION.
   *  The returned seq is the ACTUAL one used (the mirror + state.json write it). The
   *  record.seq is IGNORED (the table is the authority — the header's own doctrine). */
  appendPrompt(record: PromptRecord): number {
    let seq: number;
    try {
      const row: unknown = this.db.query(
        `INSERT INTO prompts (seq, name, prompt_text, sha256, template, validated, lines, created_at)
         VALUES ((SELECT COALESCE(MAX(seq), 0) + 1 FROM prompts), ?, ?, ?, ?, ?, ?, ?)
         RETURNING seq`,
      ).get(
        record.name, record.prompt_text, record.sha256, record.template,
        record.validated ? 1 : 0, record.lines, record.created_at,
      );
      seq = row && typeof row === 'object' ? Number((row as Record<string, unknown>).seq) : NaN;
      if (!Number.isFinite(seq)) {
        const msg = `appendPrompt: the atomic INSERT returned no seq (${record.name}) — the sqlite surface did not honor RETURNING`;
        void tridentLog('ERROR', 'shadow-memory', msg);
        throw new Error(msg);
      }
    } catch (e) {
      const msg = `appendPrompt: the sqlite row failed for ${record.name}: ${e instanceof Error ? e.message : String(e)}`;
      void tridentLog('ERROR', 'shadow-memory', msg);
      throw new Error(msg);
    }
    try {
      fs.mkdirSync(path.join(this.sessionDir, 'prompts'), { recursive: true });
      fs.writeFileSync(
        path.join(this.sessionDir, 'prompts', promptMirrorFileName(seq, record.name)),
        JSON.stringify({ ...record, seq }, null, 2),
        'utf8',
      );
    } catch (e) {
      const msg = `appendPrompt: the sqlite row for seq ${seq} WAS written but the JSON mirror failed — the dual write is incomplete (${record.name}): ${e instanceof Error ? e.message : String(e)}`;
      void tridentLog('ERROR', 'shadow-memory', msg);
      throw new Error(msg);
    }
    this.writeState({ lastSeq: seq });
    return seq;
  }

  /** lastPrompts(n) → the last N records in ASCENDING seq order — the chain for Stage 4
   *  (the memory hydration). Every row cast is CHECKED before use; an invalid row (schema
   *  drift) is SKIPPED, never a crash. */
  lastPrompts(n: number): PromptRecord[] {
    const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    const rows: unknown = this.db.query(
      `SELECT seq, name, prompt_text, sha256, template, validated, lines, created_at
       FROM prompts ORDER BY seq DESC LIMIT ?`,
    ).all(k);
    const list = Array.isArray(rows) ? rows : [];
    const out: PromptRecord[] = [];
    let skipped = 0;
    for (const raw of list) {
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (
          typeof r.seq === 'number' && typeof r.name === 'string' &&
          typeof r.prompt_text === 'string' && typeof r.sha256 === 'string' &&
          typeof r.template === 'string' && typeof r.validated === 'number' &&
          typeof r.lines === 'number' && typeof r.created_at === 'string'
        ) {
          out.push({
            seq: r.seq,
            name: r.name,
            prompt_text: r.prompt_text,
            sha256: r.sha256,
            template: r.template,
            validated: r.validated === 1,
            lines: r.lines,
            created_at: r.created_at,
          });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      void tridentLog('WARN', 'shadow-memory',
        `lastPrompts(${n}): skipped ${skipped} invalid row(s) — possible schema drift in ${this.sessionDir}/preflight.sqlite`);
    }
    return out.reverse();
  }

  /** nextSeq() → seq + 1, MONOTONIC (the test surface). The table's MAX(seq) is the
   *  authority — immune to state.json corruption. */
  nextSeq(): number {
    const row: unknown = this.db.query(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM prompts`).get();
    const n = row && typeof row === 'object' ? (row as Record<string, unknown>).next : undefined;
    return typeof n === 'number' ? n : 1;
  }

  /** epochSummary() → { count, avgLines, readyRate } — the aggregate for Stage 4. The
   *  readyRate = the share of rows that are ready (validated ∧ lines >= 125) — the tool's
   *  own `ready` definition, derived from the STORED columns (never the prose). */
  epochSummary(): EpochSummary {
    const row: unknown = this.db.query(
      `SELECT COUNT(*) AS c, COALESCE(AVG(lines), 0) AS avg,
              COALESCE(SUM(CASE WHEN validated = 1 AND lines >= ? THEN 1 ELSE 0 END), 0) AS ready
       FROM prompts`,
    ).get(READY_FLOOR_LINES);
    const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const count = typeof r.c === 'number' ? r.c : 0;
    const avgLines = typeof r.avg === 'number' ? r.avg : 0;
    const ready = typeof r.ready === 'number' ? r.ready : 0;
    return { count, avgLines, readyRate: count > 0 ? ready / count : 0 };
  }

  /** Idempotent close — a second close throws "database is not open"; log and move on. */
  close(): void {
    try {
      this.db.close();
    } catch (e) {
      void tridentLog('WARN', 'shadow-memory',
        `close() for ${this.sessionKey} is idempotent — a second close throws: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
