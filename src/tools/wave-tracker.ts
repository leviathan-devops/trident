// src/tools/wave-tracker.ts — the tracker's type surface + the state machines +
// the respawn lineage (Part 13.3 + Part 15). THE LEXICON: the respawn matching
// (the waveId + the name) is the tracker's identity lexicon — a respawn call
// WITHOUT the waveId (a genuinely new wave with the same name) is distinguished
// by the waveId's absence. The tracker NEVER guesses: an unmatched name in a
// respawn call → a NEW wave entry + a WARN log (the orchestrator's naming error
// surfaced, never silently merged).

import { tridentLog } from '../utils.js';

export type WaveStatus =
  | 'dispatching' | 'running' | 'checking' | 'complete' | 'aborted';

export type AgentState =
  | 'spawned' | 'running' | 'stuck' | 'killed' | 'respawned' | 'complete' | 'failed';

export type KillReason =
  | 'STUCK_NO_ACTIVITY' | 'PROVIDER_QUOTA' | 'SESSION_CRASH' | 'ORCHESTRATOR_ABORT';

export interface AgentTrack {
  sessionIds: string[];                  // the LINEAGE — a respawn APPENDS
  taskIds?: string[];                    // NEW (2026-08-12): the background dispatch's task_ids (optional — sync waves have none)
  state: AgentState;
  respawnCount: number;
  lastKillReason: KillReason | null;
  spawnTimes: {
    spawnedAt: number;
    killedAt?: number;
    respawnedAt?: number;
    completedAt?: number;
  };
  lastActivityAt: number | null;         // the stuck-detector evidence
  lastBytes: number;                     // the stream-bytes evidence
  errorCodes: string[];                  // the provider-error evidence
  lastError?: string;                    // the markFailed's reason
}

export interface WaveTrack {
  wave: string;
  names: string[];
  sessionIds: string[];
  dispatchedAt: number;
  etaMs: number;
  etaConfidence: number;
  status: WaveStatus;
  agents: Record<string, AgentTrack>;
  checkIns: { count: number; lastAt: number | null; nextDue: number | null };
  todoRowId: string | null;
  archiveIndex?: number;                 // the archive slot (the last-10 pruning)
}

export function freshAgentTrack(sessionId: string, now = Date.now()): AgentTrack {
  return {
    sessionIds: [sessionId],
    state: 'spawned',
    respawnCount: 0,
    lastKillReason: null,
    spawnTimes: { spawnedAt: now },
    lastActivityAt: now,
    lastBytes: 0,
    errorCodes: [],
  };
}

// THE ARCHIVE CAP (Part 4.4 — the last 10 completed/aborted waves kept).
export const WAVE_ARCHIVE_CAP = 10;

// THE TRACKER'S PUBLIC SURFACE (Part 13.3):
export interface WaveTrackerSurface {
  registerWave(entry: Omit<WaveTrack, 'status' | 'checkIns' | 'todoRowId'>): string;
  registerAgent(wave: string, name: string, sessionId: string): void;
  registerTaskIds(wave: string, name: string, taskIds: string[]): void;
  respawnAgent(wave: string, name: string, sessionId: string, reason: KillReason): void;
  markComplete(wave: string, name: string): void;
  markFailed(wave: string, name: string, error: string): void;
  markKilled(wave: string, name: string, reason: KillReason): void;
  markStuck(wave: string, name: string): void;
  getWave(wave: string): WaveTrack | undefined;
  getActiveWaves(): WaveTrack[];
  archiveWave(wave: string): void;
  getArchive(): WaveTrack[];
  clear(): void;
  size(): number;
}

// THE IN-PROCESS REGISTRY + THE ARCHIVE:
// THE PERSISTENCE (2026-08-13 — WAVE_MANAGER_RUNTIME_FAILURE_2026-08-13.md: the
// tracker was MEMORY-ONLY — a process restart wiped the wave rows → the
// wave-status control surface saw "unknown_wave"/"no active waves" while the
// runtime had live background agents. THE FIX v1: the JSON file persistence —
// THE v2 HARDENING (the operator's 8-parallel-session callout: "this needs to
// work without a single global json file that collides and crashes"): the JSON
// read-modify-write COLLIDES across processes — each process loads the whole
// file + rewrites it on mutation → process A's persist clobbers B's rows and
// vice versa. THE FIX: SQLITE (trident-waves.sqlite in the shared trident-tmp)
// with WAL + the busy timeout + ROW-KEYED UPSERTS — each process upserts ITS
// wave's row (the wave primary key); the SQLite locking serializes the writers
// (one at a time, the busy timeout waits) — NO whole-file rewrite, NO lost
// rows. The tracker survives restarts AND the multi-process parallel sessions.)
// @ts-ignore — bun:sqlite ships no type package under tsc (the same convention as wave-dispatch.ts)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TRACKER_DB = process.env.TRIDENT_TRACKER_DB
  || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp', 'trident-waves.sqlite');
const TRACKER = new Map<string, WaveTrack>();
const ARCHIVE: WaveTrack[] = [];
// THE CACHED HANDLE (2026-08-13 — the multi-process hardening): ONE open
// connection per process (the CREATE + the WAL run ONCE at the first open, not
// per mutation) — the per-call open/close churn raced the concurrent first
// schema setup in the 8-session case.
let trackerDb: Database | null = null;

function getTrackerDb(): Database {
  if (trackerDb) {
    // THE HEALTH CHECK (2026-08-13 — "Database has closed": the cached handle
    // can go stale (a test isolation or a GC close) — the SELECT 1 probes it
    // + the reopen happens automatically).
    try {
      trackerDb.query('SELECT 1').get();
      return trackerDb;
    } catch (healthErr) {
      try { trackerDb.close(); } catch (cErr) { /* already closed */ }
      trackerDb = null;
    }
  }
  const db = new Database(TRACKER_DB);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
  } catch (e) { /* non-fatal — the pragmas are a hardening */ }
  // THE SCHEMA-SETUP RETRY (the concurrent first-open race: two processes
  // CREATE the tables simultaneously — one can hit the schema lock; the retry
  // waits the busy timeout + re-runs the idempotent DDL).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS waves (
        wave TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS wave_archive (
        wave TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        archive_index INTEGER NOT NULL,
        archived_at INTEGER NOT NULL
      )`);
      break;
    } catch (e) {
      if (attempt === 2) {
        tridentLog('WARN', 'wave-tracker', 'the tracker schema setup failed after 3 attempts: ' + (e instanceof Error ? e.message : String(e)));
      } else {
        try { db.exec('PRAGMA busy_timeout = 5000;'); } catch (rErr) { /* non-fatal */ }
      }
    }
  }
  trackerDb = db;
  return db;
}

// THE PERSIST — the ROW-KEYED UPSERT (each wave's row, NOT a whole-file
// rewrite): the SQLite writer lock serializes the parallel processes.
function persistWaveRow(wave: WaveTrack): void {
  try {
    fs.mkdirSync(path.dirname(TRACKER_DB), { recursive: true });
    const db = getTrackerDb();
    db.run(
      'INSERT INTO waves (wave, data, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(wave) DO UPDATE SET data = excluded.data, status = excluded.status, updated_at = excluded.updated_at',
      [wave.wave, JSON.stringify(wave), wave.status, Date.now()],
    );
  } catch (e) {
    tridentLog('WARN', 'wave-tracker', 'the tracker persist failed for ' + wave.wave + ' (non-fatal — the in-memory state stays live): ' + (e instanceof Error ? e.message : String(e)));
  }
}

function persistArchiveRow(wave: WaveTrack, index: number): void {
  try {
    const db = getTrackerDb();
    db.run(
      'INSERT INTO wave_archive (wave, data, archive_index, archived_at) VALUES (?, ?, ?, ?) ON CONFLICT(wave) DO UPDATE SET data = excluded.data, archive_index = excluded.archive_index, archived_at = excluded.archived_at',
      [wave.wave, JSON.stringify(wave), index, Date.now()],
    );
  } catch (e) {
    tridentLog('WARN', 'wave-tracker', 'the tracker archive persist failed for ' + wave.wave + ': ' + (e instanceof Error ? e.message : String(e)));
  }
}

function deleteWaveRow(wave: string): void {
  try {
    const db = getTrackerDb();
    db.run('DELETE FROM waves WHERE wave = ?', [wave]);
  } catch (e) {
    tridentLog('WARN', 'wave-tracker', 'the tracker delete failed for ' + wave + ': ' + (e instanceof Error ? e.message : String(e)));
  }
}

function loadTracker(): void {
  try {
    if (!fs.existsSync(TRACKER_DB)) return;
    const db = getTrackerDb();
    const rows = db.query<{ wave: string; data: string; status: string }>('SELECT wave, data, status FROM waves').all();
    for (const r of rows) {
      try {
        const w = JSON.parse(r.data) as WaveTrack;
        if (w && typeof w.wave === 'string') TRACKER.set(w.wave, w);
      } catch (pErr) { /* a malformed row is skipped — never a tracker failure */ }
    }
    const archiveRows = db.query<{ wave: string; data: string; archive_index: number }>('SELECT wave, data, archive_index FROM wave_archive ORDER BY archive_index ASC').all();
    for (const r of archiveRows) {
      try {
        const w = JSON.parse(r.data) as WaveTrack;
        if (w && typeof w.wave === 'string') ARCHIVE.push(w);
      } catch (pErr) { /* skip */ }
    }
    if (TRACKER.size > 0 || ARCHIVE.length > 0) {
      tridentLog('INFO', 'wave-tracker', 'the tracker LOADED from the sqlite db: ' + TRACKER.size + ' active waves + ' + ARCHIVE.length + ' archived');
    }
  } catch (e) {
    tridentLog('WARN', 'wave-tracker', 'the tracker load failed (fresh start): ' + (e instanceof Error ? e.message : String(e)));
  }
}
loadTracker();

function warnRespawnMiss(wave: string, name: string): void {
  tridentLog('WARN', 'wave-tracker',
    'respawn matched nothing: wave=' + wave + ' name=' + name +
    ' — the respawn was NOT merged; a new wave/agent entry is expected');
}

export const WaveTracker: WaveTrackerSurface = {
  registerWave(entry): string {
    const wave: WaveTrack = {
      ...entry,
      status: 'dispatching',
      checkIns: { count: 0, lastAt: null, nextDue: null },
      todoRowId: null,
    };
    TRACKER.set(entry.wave, wave);
    // THE TRANSITION: dispatching → running (all spawns settled).
    wave.status = 'running';
    persistWaveRow(wave);
    return entry.wave;
  },

  registerAgent(wave, name, sessionId): void {
    const w = TRACKER.get(wave);
    if (!w) throw new Error('unknown wave: ' + wave);
    const existing = w.agents[name];
    if (existing) {
      // A spawn lands on an EXISTING agent record (a respawn-in-place without
      // the respawn API — the execute's allSettled path) — the lineage appends,
      // the counts update (the lexicon — never a silent overwrite).
      existing.sessionIds.push(sessionId);
      existing.respawnCount++;
      existing.state = 'running';
      existing.spawnTimes.respawnedAt = Date.now();
      existing.lastActivityAt = Date.now();
      existing.lastBytes = 0;
    } else {
      const track = freshAgentTrack(sessionId);
      track.state = 'running';           // spawned → running (the spawn settled)
      w.agents[name] = track;
    }
    w.sessionIds.push(sessionId);
    persistWaveRow(w);
  },

  // THE BACKGROUND TASK-ID BACKFILL (2026-08-12 — the background-only ruling):
  // the background dispatch returns task_ids immediately; they land here. The
  // task_ids' landing = the dispatch happened → the wave leaves 'dispatching'.
  registerTaskIds(wave, name, taskIds): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.taskIds = [...(agent.taskIds ?? []), ...taskIds];
    const w = TRACKER.get(wave);
    if (w && w.status === 'dispatching') w.status = 'running';
    if (w) persistWaveRow(w);
  },

  // ── THE RESPAWN LINEAGE (Part 4.3 — the operator's "no new-wave stupidity") ──
  respawnAgent(wave, name, sessionId, reason): void {
    const w = TRACKER.get(wave);
    const agent = w?.agents[name];
    if (!w || !agent) {
      warnRespawnMiss(wave, name);
      return;
    }
    agent.sessionIds.push(sessionId);           // the lineage APPENDS
    agent.respawnCount++;
    agent.lastKillReason = reason;
    agent.spawnTimes.killedAt = agent.spawnTimes.killedAt ?? Date.now();
    agent.spawnTimes.respawnedAt = Date.now();
    agent.state = 'respawned';                  // killed → respawned
    agent.state = 'running';                    // respawned → running (the spawn settled)
    agent.taskIds = [];                         // the respawned session's task_id lands via registerTaskIds
    agent.lastActivityAt = Date.now();
    agent.lastBytes = 0;
    agent.errorCodes = [];
    w.sessionIds.push(sessionId);
    persistWaveRow(w);
  },

  markComplete(wave, name): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'complete';                   // running → complete
    agent.spawnTimes.completedAt = Date.now();
    agent.lastActivityAt = Date.now();
    const w5 = TRACKER.get(wave);
    if (w5) persistWaveRow(w5);
  },

  markFailed(wave, name, error): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'failed';                     // running → failed (the crash)
    agent.lastError = error;
    const w2 = TRACKER.get(wave);
    if (w2) persistWaveRow(w2);
  },

  markKilled(wave, name, reason): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'killed';                     // stuck → killed (the decision)
    agent.lastKillReason = reason;
    agent.spawnTimes.killedAt = Date.now();
    const w3 = TRACKER.get(wave);
    if (w3) persistWaveRow(w3);
  },

  markStuck(wave, name): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'stuck';                      // running → stuck (the evidence)
    const w4 = TRACKER.get(wave);
    if (w4) persistWaveRow(w4);
  },

  getWave(wave) {
    return TRACKER.get(wave);
  },

  getActiveWaves() {
    return [...TRACKER.values()].filter((w) =>
      w.status === 'running' || w.status === 'checking' || w.status === 'dispatching');
  },

  getArchive() {
    return [...ARCHIVE];
  },

  archiveWave(wave): void {
    const w = TRACKER.get(wave);
    if (!w) return;
    w.archiveIndex = ARCHIVE.length;
    ARCHIVE.push(w);                            // the last-10 pruning:
    while (ARCHIVE.length > WAVE_ARCHIVE_CAP) ARCHIVE.shift(); // the oldest first
    TRACKER.delete(wave);
    deleteWaveRow(wave);
    for (let ai = 0; ai < ARCHIVE.length; ai++) persistArchiveRow(ARCHIVE[ai], ai);
  },

  clear(): void {
    TRACKER.clear();
    ARCHIVE.length = 0;
    try {
      const db = getTrackerDb();
      try {
        db.run('DELETE FROM waves');
        db.run('DELETE FROM wave_archive');
      } finally { db.close(); }
    } catch (e) { /* non-fatal */ }
  },

  size(): number {
    return TRACKER.size;
  },
};

// THE TRANSITION GUARDS (the complete state machine — Part 15's table):
//   dispatching → running    (all spawns settled — registerWave)
//   spawned → running        (the promptAsync settled)
//   spawned → failed         (the create/promptAsync threw)
//   running → stuck          (the evidence matches)
//   running → complete       (the child idle + the final message)
//   running → failed         (the child error + unrecoverable)
//   stuck → killed           (the kill decision fires)
//   killed → respawned       (the respawn call lands)
//   respawned → running      (the new session's spawn settled)
