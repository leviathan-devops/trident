// src/tools/wave-read.ts — THE DEDICATED SESSION READER (2026-08-16 — the
// FALSE-LIVENESS incident's fix surface). THE TOOL'S ONLY JOB: read a subagent
// session's LIVE STREAM + compute the session STATUS from the session data.
//
// THE INCIDENT (the why): task_status (the runtime's background-JOB poll)
// reported 'cancelled' for TWO LIVE streaming sessions (the loop-killer + the
// memory-repair subagents were WRITING FILES while the job registry said
// cancelled) — the false read nearly caused a useless re-dispatch. THE JOB
// REGISTRY ≠ THE SESSION STREAM. THE STATUS IS COMPUTED FROM THE SESSION'S
// DATA (the opencode.db part stream — the same data the TUI renders), NEVER
// from the job registry, NEVER from the tracker.
//
// THE SINGLE SOURCE: the execute REUSES the readSessionStream export from
// wave-status.ts:137 — NO new read machinery. A second reader drifts. The
// ONLY additional read is the NEWEST-PART RECENCY probe (the part table's
// time_updated — the WINDOW CLOCK the stream rule needs) + the MESSAGE
// terminal-finish probe (the complete rule needs the terminal signal the part
// rows alone cannot give). Both are the SAME opencode.db channel, guarded by
// the same existsSync convention — the session data, never the job registry.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
// @ts-ignore — bun:sqlite ships no type package under tsc (the bun runtime provides it — the same convention as wave-status.ts:12)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { tridentLog } from '../utils.js';
import { readSessionStream, type SessionStreamPage } from './wave-status.ts';

// THE STATUS — the session truth, computed from the session's own data:
//   stream   — new parts in the window AND the last step unfinished (working)
//   idle     — no new parts in the window AND the last step finished (paused)
//   complete — the session has a TERMINAL signal (the final message's finish)
//   absent   — the sessionId has no rows in the db
export type WaveReadStatus = 'stream' | 'idle' | 'complete' | 'absent';

export interface WaveReadResult {
  ok: boolean;
  error?: string;
  sessionId: string;
  status: WaveReadStatus;
  live: boolean;            // THE SESSION-TRUTH LIVENESS (2026-08-16 — the spec §2.1: "The live field is the boolean liveness (the parts' recency — NEVER the job registry)". The S1 container test caught its absence: the explicit boolean the orchestrator reads for 'is this subagent alive' — status stream = live true; idle/complete/absent = live false. The incident's fix surfaces BOTH the status AND the explicit live flag.)
  partCount: number;
  returnedParts: number;
  moreAvailable: boolean;
  beforeId: string | null;
  lastTools: string[];
  parts: SessionStreamPage['parts'];
}

// THE WINDOW (the spec's "new parts within the last N seconds"): a part
// written within the last 5 minutes counts as NEW — the agent has produced
// stream output in the recent window. A frozen stream older than the window =
// no new parts. THE CALIBRATION (2026-08-16 — measured against the live db):
// the memory-repair session's newest part was an OPEN reasoning part 2 minutes
// old while the agent was ACTIVELY streaming (long reasoning bursts leave the
// part open for minutes) — a 45s window would have falsely reported it idle
// (the false-dead class the incident is about). 5 minutes covers the burst
// while still calling a genuinely-stale open part (interrupted mid-generation)
// idle. THE SAFE BIAS: when unsure, report stream (a live session reported
// dead is the DANGEROUS re-dispatch; a dead session reported live just gets
// re-polled).
export const STREAM_WINDOW_MS = 300_000;

// THE TOOL DESCRIPTION (exported for the unit tests — the incident warning is
// part of the tool surface, asserted mechanically):
export const WAVE_READ_TOOL_DESCRIPTION =
  'THE DEDICATED SESSION READER — reads a subagent session\'s LIVE STREAM + returns the session STATUS computed FROM THE SESSION DATA (the opencode.db part stream — the same data the TUI renders). Call with ONE arg (sessionId) + optional limit/beforeId. THE STATUS: \'stream\' (new parts in the window + the last step unfinished — the agent is WORKING), \'idle\' (no new parts + the last step finished — the agent paused/awaiting), \'complete\' (the session has a terminal message finish — the task_result rendered), \'absent\' (no rows in the db). THE INCIDENT WARNING: task_status reports the background-JOB state — it can report \'cancelled\' for a LIVE session (the 2026-08-16 FALSE-LIVENESS incident: the loop-killer + the memory-repair subagents were writing files while the job registry said cancelled). THE SESSION STREAM IS THE ONLY LIVENESS TRUTH — for \'is this subagent alive\', use THIS tool (or trident-wave-manager action=status sessionId=<id>) — NEVER task_status.';

// THE NEWEST-PART RECENCY PROBE (the WINDOW CLOCK — the part table's
// time_updated for the session's newest part). The stream rule needs a REAL
// timestamp: the reader's part rows carry no clock, so the recency comes from
// this single bounded query — the same opencode.db channel the reader uses.
// Returns null when the db/session is absent (the absent state resolves there).
export function newestPartAgeMs(sessionId: string): number | null {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.query('SELECT time_updated FROM part WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId) as { time_updated?: number } | undefined;
      if (!row || typeof row.time_updated !== 'number') return null;
      return Date.now() - row.time_updated;
    } finally {
      db.close();
    }
  } catch (e) {
    tridentLog('WARN', 'wave-read', 'the newest-part recency probe failed for ' + sessionId + ': ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

// THE TERMINAL-FINISH PROBE (the COMPLETE rule's signal). A session is
// COMPLETE when its newest message carries a `finish` field — the runtime
// writes it when the response stream reaches a terminal state ('stop' | 'other'
// | 'error'). A LIVE session's newest message has NO finish yet. THE PART ROWS
// ALONE cannot distinguish 'complete' from 'idle' (both end with a terminal
// step-finish); the message finish is the terminal marker. THE PROBE IS THE
// SAME opencode.db channel — the session data, never the job registry.
export function sessionHasTerminalFinish(sessionId: string): boolean {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return false;
    const db = new Database(dbPath, { readonly: true });
    try {
      const msg = db.query('SELECT data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1').get(sessionId) as { data?: string } | undefined;
      if (!msg || typeof msg.data !== 'string') return false;
      const d = JSON.parse(msg.data) as { finish?: unknown };
      return typeof d.finish !== 'undefined';
    } finally {
      db.close();
    }
  } catch (e) {
    tridentLog('WARN', 'wave-read', 'the terminal-finish read failed for ' + sessionId + ': ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

// THE STATUS COMPUTATION (the wave-read core — PURE + TESTABLE). Computed from
// the session data ONLY — never the job registry, never the tracker. The
// window rule (new parts in the window) + the last-step rule (the newest part's
// terminal state) + the terminal rule (the message finish) + the no-rows rule.
export function computeWaveReadStatus(
  page: SessionStreamPage,
  hasTerminalFinish: boolean,
  newestPartAgeMs: number | null,
): WaveReadStatus {
  // THE NO-ROWS RULE: the reader reports !ok (db absent/error) OR ok with zero
  // part rows — the sessionId has no rows in the db = absent.
  if (!page.ok || page.parts.length === 0 || page.totalParts === 0) {
    return 'absent';
  }
  const newest = page.parts[page.parts.length - 1];
  // THE LAST-STEP UNFINISHED RULE: an OPEN newest part (no time.end — a text /
  // reasoning / step-start / tool part) = the step is UNFINISHED = the agent is
  // producing. A terminal step-finish as the newest part = the step FINISHED.
  const lastFinished = newest.type === 'step-finish' || newest.completed === true;
  // THE NEW-PARTS-IN-THE-WINDOW RULE: the newest part's recency — written
  // within the STREAM_WINDOW_MS window counts as NEW stream activity. An OPEN
  // part is trivially within the window (it was written microseconds ago);
  // the age probe still guards the crash case (an open part that went stale).
  const inWindow = newestPartAgeMs === null || newestPartAgeMs < STREAM_WINDOW_MS;
  if (!lastFinished) {
    return inWindow ? 'stream' : 'idle';
  }
  // THE TERMINAL RULE: the last step finished AND the session's newest message
  // carries the finish signal — the response stream reached a terminal state
  // (the task_result / the final text rendered) = complete.
  if (hasTerminalFinish) {
    return 'complete';
  }
  // THE IDLE RULE: the last step finished, no terminal message finish — the
  // agent PAUSED / awaiting (a step boundary, a tool waiting, an interrupt
  // hold). NOT dead — the session lives; it produced nothing terminal.
  return 'idle';
}

// THE RESULT COMPOSITION (the reader page → the tool result):
export function composeWaveReadResult(
  sessionId: string,
  page: SessionStreamPage,
  hasTerminalFinish: boolean,
  newestAge: number | null,
): WaveReadResult {
  const status = computeWaveReadStatus(page, hasTerminalFinish, newestAge);
  return {
    ok: page.ok,
    error: page.error,
    sessionId,
    status,
    live: status === 'stream',   // THE SESSION-TRUTH LIVENESS — status stream = the agent is producing = live. NEVER the job registry.
    partCount: page.totalParts,
    returnedParts: page.returnedParts,
    moreAvailable: page.moreAvailable,
    beforeId: page.beforeId,
    lastTools: page.lastTools,
    parts: page.parts,
  };
}

// ═══ THE TOOL (registered in trident-tools.ts — the wave-read joins the
// surface) ═══

export function createWaveReadTool() {
  return tool({
    description: WAVE_READ_TOOL_DESCRIPTION,
    args: {
      sessionId: z.string().describe('THE SUBAGENT SESSION ID — the task_id / the session to read (REQUIRED — this is a session instrument, not a wave instrument).'),
      limit: z.number().int().min(1).max(500).optional().describe('THE STREAM PAGE SIZE (default 50, max 500) — the number of newest parts to return.'),
      beforeId: z.string().optional().describe('THE STREAM PAGE CURSOR — pass the returned beforeId to page FURTHER BACK through the session\'s history.'),
    },
    execute: async (args: Record<string, unknown>): Promise<{ title: string; output: string }> => {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
      if (!sessionId) {
        throw new Error('[WAVE-READ] sessionId is required — the subagent session (the task_id) to read');
      }
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      const beforeId = typeof args.beforeId === 'string' && args.beforeId.trim().length > 0 ? args.beforeId.trim() : undefined;
      const page = readSessionStream(sessionId, { limit, beforeId });
      const terminal = sessionHasTerminalFinish(sessionId);
      const newestAge = newestPartAgeMs(sessionId);
      const result = composeWaveReadResult(sessionId, page, terminal, newestAge);
      return { title: 'WAVE-READ — ' + sessionId + ' [' + result.status + ']', output: JSON.stringify(result, null, 2) };
    },
  });
}
