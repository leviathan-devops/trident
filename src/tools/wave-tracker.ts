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
// tracker was MEMORY-ONLY — a process restart (compaction / session switch /
// crash) wiped the wave rows → the wave-status control surface saw
// "unknown_wave"/"no active waves" while the runtime had live background
// agents. THE FIX: the tracker persists to the shared trident-tmp on EVERY
// mutation + loads at the module init — the wave rows SURVIVE restarts, so the
// wave-status (the same process OR a fresh one) sees the waves it was built to
// control.)
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TRACKER_FILE = process.env.TRIDENT_TRACKER_FILE
  || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp', '.wave-tracker.json');
const TRACKER = new Map<string, WaveTrack>();
const ARCHIVE: WaveTrack[] = [];

function persistTracker(): void {
  try {
    fs.mkdirSync(path.dirname(TRACKER_FILE), { recursive: true });
    const payload = {
      tracker: [...TRACKER.values()],
      archive: [...ARCHIVE],
      savedAt: Date.now(),
    };
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    tridentLog('WARN', 'wave-tracker', 'the tracker persistence write failed (non-fatal — the in-memory state stays live): ' + (e instanceof Error ? e.message : String(e)));
  }
}

function loadTracker(): void {
  try {
    if (!fs.existsSync(TRACKER_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8')) as { tracker?: WaveTrack[]; archive?: WaveTrack[] };
    for (const w of parsed.tracker ?? []) {
      if (w && typeof w.wave === 'string') TRACKER.set(w.wave, w);
    }
    for (const w of parsed.archive ?? []) {
      if (w && typeof w.wave === 'string') ARCHIVE.push(w);
    }
    if (TRACKER.size > 0 || ARCHIVE.length > 0) {
      tridentLog('INFO', 'wave-tracker', 'the tracker LOADED from disk: ' + TRACKER.size + ' active waves + ' + ARCHIVE.length + ' archived');
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
    persistTracker();
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
    persistTracker();
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
    persistTracker();
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
    persistTracker();
  },

  markComplete(wave, name): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'complete';                   // running → complete
    agent.spawnTimes.completedAt = Date.now();
    agent.lastActivityAt = Date.now();
    persistTracker();
  },

  markFailed(wave, name, error): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'failed';                     // running → failed (the crash)
    agent.lastError = error;
    persistTracker();
  },

  markKilled(wave, name, reason): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'killed';                     // stuck → killed (the decision)
    agent.lastKillReason = reason;
    agent.spawnTimes.killedAt = Date.now();
    persistTracker();
  },

  markStuck(wave, name): void {
    const agent = TRACKER.get(wave)?.agents[name];
    if (!agent) return;
    agent.state = 'stuck';                      // running → stuck (the evidence)
    persistTracker();
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
    persistTracker();
  },

  clear(): void {
    TRACKER.clear();
    ARCHIVE.length = 0;
    persistTracker();
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
