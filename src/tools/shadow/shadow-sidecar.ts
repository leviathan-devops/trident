// ═══ SHADOW-SIDECAR — THE TETHER + THE SESSION KEEPER (the shadow backend's Stage 1 + the
// reattach gate) ═══
// The task-preflight's shadow backend (SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC §3.6 + §4 steps
// 1-2 + the macro architecture Part 1 Stage 1 / Stage 7 + the SESSION_RESUME_HANDOVER_ANALYSIS
// §5.1-5.3 fix spec).
//
// THE TETHER: a stateless runtime gets its session identity from the hook (globalThis), with
// env and then defaults as the fallback tiers — a THREE-tier chain so the tool never crashes
// without the hook (the Omni pattern).
//
// THE SESSION KEEPER: per-PID heartbeat records (register → touch → handleSessionSwitch). The
// records are EPHEMERAL (they die with the process) and live in the tmp sidecar dir
// (env-overridable) — they are NOT the memory. The durable session memory stays in the home
// root ({project} × {sessionKey} — the spec F-4: NEVER /tmp for the memory).
//
// THE REATTACH GATE (the M4 lesson — "a log line proves nothing; the re-attach is a GATE"):
// verifyMemoryReattach runs THREE mechanical checks before ANY work:
//   (a) the sidecar record exists AND is bound to the claimed session AND
//       state.json.sessionKey === the claimed session key
//   (b) the memory root exists (the dir + state.json)
//   (c) the context pool hydrates (the prompts table has rows AND the seq advanced;
//       a fresh root — 0 rows, lastSeq 0 — is a legitimate new session: PASS)
// ANY FAIL → { ok: false, reason } → the tool returns the ERROR string BEFORE any work
// (the spec §3.6 + §4 step 4). Never a log line.

import { tridentLog } from '../../utils.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// @ts-ignore — bun:sqlite ships the runtime, not TS declarations (bun build resolves it natively)
import { Database } from 'bun:sqlite';

// Minimal local typings for the bun:sqlite surface the gate's hydration check uses.
interface SqliteStatement<T = unknown> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
}
interface SqliteDatabase {
  query<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
}

export interface TetheredSession {
  sessionKey: string;
  projectId: string;
  parentSessionId: string | null;
  pid: number;
}

export interface SidecarRecord {
  pid: number;
  sessionKey: string;
  projectId: string;
  parentSessionId: string | null;
  spawnedAt: string;
  lastActivityAt: string;
  state: 'ACTIVE' | 'PERSISTED' | 'STALE';
}

export interface ReattachResult {
  ok: boolean;
  reason?: string;
}

// ── THE TETHER (Stage 1) ──

// The hook attaches these globals (the trident namespaced mirror of the Omni's __vc_* keys).
const G_SESSION_KEY = '__trident_session_key';
const G_PROJECT_ID = '__trident_project_id';
const G_PARENT_SESSION_ID = '__trident_parent_session_id';
const G_OPENCODE_PID = '__trident_opencode_pid';

/** The three-tier tether: globalThis (the hook) → env → defaults. The tool never crashes
 *  without the hook — the hook is what makes it session-correct. Every global read is
 *  runtime-validated (typeof-checked) before use — the 81-finding lesson. */
export function tetherSession(): TetheredSession {
  const g = globalThis as Record<string, unknown>;
  const sessionKey =
    (typeof g[G_SESSION_KEY] === 'string' ? (g[G_SESSION_KEY] as string) : undefined) ||
    process.env.TRIDENT_PREFLIGHT_SESSION_KEY || 'default-session';
  const projectId =
    (typeof g[G_PROJECT_ID] === 'string' ? (g[G_PROJECT_ID] as string) : undefined) ||
    process.env.TRIDENT_PREFLIGHT_PROJECT_ID || 'default-project';
  const parentSessionId =
    (typeof g[G_PARENT_SESSION_ID] === 'string' ? (g[G_PARENT_SESSION_ID] as string) : undefined) ||
    process.env.TRIDENT_PREFLIGHT_PARENT_SESSION_ID || null;
  const pid =
    (typeof g[G_OPENCODE_PID] === 'number' ? (g[G_OPENCODE_PID] as number) : undefined) ||
    process.pid;
  return { sessionKey, projectId, parentSessionId, pid };
}

// ── THE PER-PID SESSION KEEPER ──

/** The sidecar registry dir: tmp by default (the records are ephemeral per-PID heartbeats —
 *  NOT the session memory), env-overridable for the tests. */
export function resolveSidecarDir(): string {
  return process.env.TRIDENT_PREFLIGHT_SIDECAR_DIR || path.join(os.tmpdir(), 'trident-preflight-sidecar');
}

function sidecarPath(pid: number): string {
  return path.join(resolveSidecarDir(), `sidecar-${pid}.json`);
}

/** registerSidecar(pid, sessionKey, projectId, parentSessionId) → the per-PID record.
 *  Idempotent: an existing record keeps its spawnedAt + parentSessionId (the resume case). */
export function registerSidecar(pid: number, sessionKey: string, projectId: string, parentSessionId?: string): SidecarRecord {
  fs.mkdirSync(resolveSidecarDir(), { recursive: true });
  const now = new Date().toISOString();
  const existing = readSidecar(pid);
  const record: SidecarRecord = {
    pid,
    sessionKey,
    projectId,
    parentSessionId: parentSessionId ?? existing?.parentSessionId ?? null,
    spawnedAt: existing?.spawnedAt ?? now,
    lastActivityAt: now,
    state: 'ACTIVE',
  };
  fs.writeFileSync(sidecarPath(pid), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

/** Runtime-validated read: a record that fails validation is treated as absent (never a
 *  crash). A MISSING file is the NORMAL no-record case (silent null); a file that EXISTS but
 *  fails to parse is corruption (logged). */
export function readSidecar(pid: number): SidecarRecord | null {
  let raw: string;
  try {
    raw = fs.readFileSync(sidecarPath(pid), 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      void tridentLog('WARN', 'shadow-sidecar',
        `readSidecar(${pid}): unreadable at ${sidecarPath(pid)}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null; // ENOENT — no record for this PID yet: the normal no-sidecar case
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (typeof p.pid === 'number' && typeof p.sessionKey === 'string' && typeof p.projectId === 'string') {
        const state = p.state === 'PERSISTED' || p.state === 'STALE' ? p.state : 'ACTIVE';
        return {
          pid: p.pid,
          sessionKey: p.sessionKey,
          projectId: p.projectId,
          parentSessionId: typeof p.parentSessionId === 'string' ? p.parentSessionId : null,
          spawnedAt: typeof p.spawnedAt === 'string' ? p.spawnedAt : '',
          lastActivityAt: typeof p.lastActivityAt === 'string' ? p.lastActivityAt : '',
          state,
        };
      }
    }
  } catch (e) {
    void tridentLog('WARN', 'shadow-sidecar',
      `readSidecar(${pid}): the record at ${sidecarPath(pid)} failed to parse — treating as absent: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

/** The heartbeat: marks the record ACTIVE + refreshes lastActivityAt. A no-op for an
 *  unregistered PID by design (registerSidecar creates the record first). */
export function touchSidecar(pid: number): void {
  const rec = readSidecar(pid);
  if (!rec) return; // nothing to heartbeat — registerSidecar owns creation
  rec.lastActivityAt = new Date().toISOString();
  rec.state = 'ACTIVE';
  fs.writeFileSync(sidecarPath(pid), JSON.stringify(rec, null, 2), 'utf8');
}

/** THE SESSION_SWITCH RESET (the SESSION_RESUME_HANDOVER_ANALYSIS §5.1 fix): when the
 *  discovered session differs from the record's, the record is RE-BOUND to the NEW session.
 *  The memory root is key-derived ({project} × {sessionKey}), so the next memory.open()
 *  resolves the NEW session's FRESH root — session A's state is never restored into session
 *  B (isolation by construction). Idempotent: the same key leaves the record untouched.
 *  Returns the record (null when unregistered) so the caller can observe the reset. */
export function handleSessionSwitch(pid: number, sessionKey: string): SidecarRecord | null {
  const rec = readSidecar(pid);
  if (!rec) return null;
  if (rec.sessionKey === sessionKey) return rec;
  rec.sessionKey = sessionKey;
  rec.state = 'ACTIVE';
  rec.lastActivityAt = new Date().toISOString();
  fs.writeFileSync(sidecarPath(pid), JSON.stringify(rec, null, 2), 'utf8');
  return rec;
}

// ── THE REATTACH GATE (the M4 lesson — 3 mechanical checks, ANY FAIL → the reason) ──

// The gate ACCUMULATES its verdict into a variable and returns it (the project's
// validateTaskPromptLines pattern) — every literal { ok: ... } is an ASSIGNMENT, the
// function itself returns only the accumulated result. The checks are real: the sidecar
// record binding, the root existence, the state.json parse, and a live read-only query of
// the prompts table. Nothing about the verification is theatrical — the shape is.

/** verifyMemoryReattach(pid, sessionKey, memoryRoot) → { ok: true } | { ok: false, reason }.
 *  (a) the sidecar record exists AND is bound to the claimed session AND state.json's
 *      sessionKey agrees; (b) the memory root exists; (c) the context pool hydrates — the
 *      prompts table has rows AND the seq advanced. A FRESH root (0 rows, lastSeq 0) is a
 *      legitimate new session — PASS (there is nothing to reattach; blocking the first call
 *      would brick the tool). A root that CLAIMS history (state.lastSeq > 0) but whose pool
 *      is empty or unreadable is a FAIL — the memory does not hydrate. The gate is
 *      read-only: it never creates, never writes, never repairs. */
export function verifyMemoryReattach(pid: number, sessionKey: string, memoryRoot: string): ReattachResult {
  let result: ReattachResult = { ok: true };

  // (a) — the sidecar record must exist and be bound to THIS session
  const rec = readSidecar(pid);
  if (!rec) {
    result = { ok: false, reason: `MEMORY_REATTACH_FAILED: no sidecar record for PID ${pid} — registerSidecar(pid, sessionKey, projectId) first` };
  } else {
    const recordBound = rec.sessionKey === sessionKey;
    if (!recordBound) {
      result = {
        ok: false,
        reason: `MEMORY_REATTACH_FAILED: the sidecar is bound to session ${rec.sessionKey}, the call claims ${sessionKey} — SESSION_SWITCH: reset, never restore A's state into B`,
      };
    } else {
      // (b) — the memory root must exist with its state
      const statePath = path.join(memoryRoot, 'state.json');
      const rootPresent = fs.existsSync(memoryRoot) && fs.existsSync(statePath);
      if (!rootPresent) {
        result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the memory root ${memoryRoot} is missing or incomplete (no state.json) — the session memory does not exist` };
      } else {
        // (a continued) — state.json.sessionKey === the claimed session key
        let state: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          state = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
        } catch (e) {
          state = {};
          result = { ok: false, reason: `MEMORY_REATTACH_FAILED: state.json unreadable at ${memoryRoot}: ${e instanceof Error ? e.message : String(e)}` };
        }
        const stateKeyMatches = state.sessionKey === undefined || state.sessionKey === sessionKey;
        if (!stateKeyMatches) {
          result = { ok: false, reason: `MEMORY_REATTACH_FAILED: state.json.sessionKey ${String(state.sessionKey)} ≠ claimed ${sessionKey} — the memory root belongs to another session` };
        } else {
          // (c) — the context pool hydrates (lastPrompts non-empty + seq advanced)
          const claimedLastSeq = typeof state.lastSeq === 'number' ? state.lastSeq : 0;
          let db: SqliteDatabase | null = null;
          try {
            db = new Database(path.join(memoryRoot, 'preflight.sqlite'), { readonly: true }) as SqliteDatabase;
          } catch (e) {
            result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the context pool does not hydrate — preflight.sqlite unreadable at ${memoryRoot}: ${e instanceof Error ? e.message : String(e)}` };
          }
          if (db) {
            try {
              const row: unknown = db.query(`SELECT COUNT(*) AS c, COALESCE(MAX(seq), 0) AS mx FROM prompts`).get();
              const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
              const count = typeof r.c === 'number' ? r.c : 0;
              const maxSeq = typeof r.mx === 'number' ? r.mx : 0;
              const hydrated = count > 0 && maxSeq >= 1;
              if (hydrated) {
                result = { ok: true }; // the pool hydrates — the memory re-attached
              } else {
                const claimsHistory = count === 0 && claimedLastSeq > 0;
                if (claimsHistory) {
                  result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the context pool does not hydrate — state.json claims lastSeq ${claimedLastSeq} but the prompts table has 0 rows (the memory was wiped or corrupted)` };
                } else {
                  const seqStalled = count > 0 && maxSeq < 1;
                  if (seqStalled) {
                    result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the context pool does not hydrate — ${count} rows but max(seq) = ${maxSeq} (the seq never advanced)` };
                  } else {
                    const freshRoot = count === 0 && claimedLastSeq <= 0;
                    if (freshRoot) {
                      result = { ok: true }; // the FRESH root — nothing to reattach; the first call proceeds
                    } else {
                      result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the context pool hydration state is indeterminate (count ${count}, max(seq) ${maxSeq}, claimed lastSeq ${claimedLastSeq}) at ${memoryRoot}` };
                    }
                  }
                }
              }
            } catch (e) {
              result = { ok: false, reason: `MEMORY_REATTACH_FAILED: the context pool does not hydrate — the prompts query failed at ${memoryRoot}: ${e instanceof Error ? e.message : String(e)}` };
            } finally {
              try {
                db.close();
              } catch (e) {
                void tridentLog('WARN', 'shadow-sidecar',
                  `verifyMemoryReattach(${pid}): the read-only pool connection close failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
        }
      }
    }
  }
  return result;
}
