// src/tools/wave-status.ts — the WATCH INSTRUMENT (Part 23 — the orchestrator's
// control surface). The trident-wave-status tool's execute: the introspection
// (waveId → the per-agent report), the raw session view, the per-session kill,
// the kill-wave. THE READS are the mechanical ground truth (session.status +
// session.messages per child); the tracker's agent state (the lineage) rides on
// top. The kill NEVER touches the other agents (the untethering — one session's
// abort, the wave untouched).

import { tridentLog } from '../utils.js';
// THE SESSION-STREAM READER's deps (2026-08-12 — the in-flight vision channel:
// the opencode.db part stream — the same data the TUI renders):
// @ts-ignore — bun:sqlite ships no type package under tsc (the bun runtime provides it; the same convention as wave-dispatch.ts:11-12)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WaveTracker, type WaveTrack, type AgentTrack } from './wave-tracker.ts';
import { ReminderQueue } from './wave-reminder-queue.ts';
import {
  WaveStatusReport, buildOrchestratorAbortDirective, buildWaveAbortedDirective,
} from './wave-constants.ts';

export interface WaveStatusArgs {
  waveId?: string;
  sessionId?: string;
  taskId?: string;                       // NEW (2026-08-12): the background task's session id
  agent?: string;
  action?: 'status' | 'kill' | 'kill-wave';
  reason?: string;
  verbose?: boolean;                 // NEW (2026-08-13): false/absent = the COMPACT summary; true = the full tails/parts
  limit?: number;                        // NEW (2026-08-12): the stream page size (default 50, max 500)
  beforeId?: string;                     // NEW (2026-08-12): the stream page cursor (FULL SCROLL back)
}

export type KillReason =
  | 'STUCK_NO_ACTIVITY' | 'PROVIDER_QUOTA' | 'SESSION_CRASH' | 'ORCHESTRATOR_ABORT';

function toKillReason(reason: string | undefined): KillReason {
  const r = (reason || 'ORCHESTRATOR_ABORT').toUpperCase();
  if (r === 'STUCK_NO_ACTIVITY' || r === 'PROVIDER_QUOTA' || r === 'SESSION_CRASH') {
    return r;
  }
  return 'ORCHESTRATOR_ABORT';
}

// THE CLIENT SURFACE the status tool consumes (the session.reads + the abort):
export interface WaveStatusClient {
  status(opts: { query?: Record<string, unknown> }): Promise<{ data?: { status?: string } | null }>;
  messages(opts: { path: { id: string }; query?: Record<string, unknown> }): Promise<{ data?: Array<{ parts?: unknown[] }> | null }>;
  message(opts: { path: { id: string; messageID: string } }): Promise<{ data?: unknown }>;
  abort(opts: { path: { id: string } }): Promise<unknown>;
  children(opts: { path: { id: string } }): Promise<{ data?: Array<{ id: string }> | null }>;
}

// ── THE SESSION ABORT (2026-08-24 — the EN-160 kill fix): the opencode SDK's
// REAL surface is `client.session.abort({path:{id}})` (sdk.gen.d.ts — the
// Session class's own "Abort a session" method, the same object that carries
// the PROVEN client.session.promptAsync the steer delivery now uses). The OLD
// top-level `client.abort(...)` call was bookkeeping-only — EN 160's live
// test: the killed session's stream KEPT GROWING (13→21→47 parts) while the
// tracker said 'killed'. The helper prefers the session-scoped abort (the
// real endpoint: cancels the session's in-flight generation loop) and falls
// back to the legacy/injected seam (the unit tests' WaveStatusClient mock).
async function abortSession(client: WaveStatusClient, id: string): Promise<'session-abort' | 'legacy-abort'> {
  const scoped = (client as unknown as { session?: { abort?: (o: { path: { id: string } }) => Promise<unknown> } })
    .session?.abort;
  if (typeof scoped === 'function') {
    await scoped.call((client as unknown as { session: unknown }).session, { path: { id } });
    return 'session-abort';
  }
  await client.abort({ path: { id } });
  return 'legacy-abort';
}

// THE SESSION-SCOPED STATUS REPORT (2026-08-16 — the FALSE-LIVENESS incident's
// fix surface): the action=status sessionId branch's RAW SESSION TRUTH — the
// live flag + the session data (the stream page), NOT the wave-scoped per-agent
// generation noise (the WaveStatusReport's agents[] wrapper + the tracker's
// etaMs/etaConfidence/elapsedMs). A sessionId is a DIFFERENT surface from a
// waveId — the session read answers "is THIS session alive?", the wave read
// answers "what is THIS wave's state?". THE SHAPE MIRRORS the trident-wave-read
// tool's result (wave-read.ts) — the dedicated session instrument reads the
// SAME session data through the SAME readSessionStream core.
export interface WaveSessionStatusReport {
  ok: boolean;
  error?: string;
  wave: string;
  sessionId: string;
  status: string;
  live: boolean;
  partCount: number;
  returnedParts: number;
  lastTools: string[];
  parts: SessionStreamPage['parts'];
  moreAvailable: boolean;
  beforeId: string | null;
  streamOk: boolean;
  streamError?: string;
}

function toolNames(parts: unknown[] | undefined): string[] {
  return (parts ?? []).map((p) => (p as { tool?: string }).tool ?? '').filter(Boolean).slice(-8);
}

// THE LIVE-FLAG COMPUTATION (2026-08-16 — the FALSE-LIVENESS incident's fix:
// the action=status sessionId branch's `live` field). THE LIVE STATE FROM THE
// SESSION DATA — the reader page's newest part: an OPEN part (no time.end — a
// step-start / tool / open text / open reasoning) = the agent is mid-step =
// LIVE. A terminal step-finish as the newest part = the step finished = NOT
// live at this instant (idle/complete — the session still lives, it just
// produced nothing current). NEVER reads the job registry — the incident's
// whole point (task_status said cancelled for LIVE streaming sessions).
function computeLiveFlag(page: SessionStreamPage): boolean {
  if (!page.ok || page.parts.length === 0) return false;
  const newest = page.parts[page.parts.length - 1];
  const finished = newest.type === 'step-finish' || newest.completed === true;
  return !finished;
}

// THE RUNTIME-BACKED SESSION RESOLUTION (2026-08-13 — the failure doc's fix #2:
// the tracker row can be missing (a process restart before the persistence fix,
// or a cross-process gap). The wave's subagent sessions are titled
// 'agent-wave-<waveId>-*' in the opencode.db — the runtime's ground truth. The
// kill/kill-wave/list-all resolve THROUGH the db when the tracker misses, so
// the control surface NEVER reports "no active waves" while the runtime has
// live background agents.)
function resolveWaveSessionsFromDb(waveId: string): Array<{ id: string; title: string }> {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.query('SELECT id, title FROM session WHERE title LIKE ?').all('agent-wave-' + waveId + '-%') as Array<{ id: string; title: string }>;
      return rows.map((r) => ({ id: r.id, title: r.title ?? '' }));
    } finally { db.close(); }
  } catch (e) {
    tridentLog('WARN', 'wave-status', 'the runtime session resolution failed for ' + waveId + ': ' + (e instanceof Error ? e.message : String(e)));
    return [];
  }
}

// THE RUNTIME-ACTIVE SESSIONS (the list-all fallback — the running background
// agents the tracker cannot see after a loss):
function resolveRunningBackgroundSessions(): Array<{ id: string; title: string }> {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true });
    try {
      const cutoff = Date.now() - 30 * 60_000;
      const rows = db.query('SELECT id, title FROM session WHERE parent_id IS NOT NULL AND title LIKE ? AND time_updated > ? ORDER BY time_updated DESC LIMIT 20')
        .all('agent-wave-%', cutoff) as Array<{ id: string; title: string }>;
      return rows.map((r) => ({ id: r.id, title: r.title ?? '' }));
    } finally { db.close(); }
  } catch (e) {
    tridentLog('WARN', 'wave-status', 'the runtime-active resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    return [];
  }
}

function fmtAge(ms: number | null): string {
  if (ms === null) return 'never';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m ago';
  if (mins < 60) return mins + 'm ago';
  return Math.round(mins / 60) + 'h ago';
}

// ═══ THE SESSION-STREAM READER (2026-08-12 — THE IN-FLIGHT VISION CHANNEL,
// the operator's FULL-SCROLL ruling) ═══
// Reads the opencode.db part stream — the SAME data the TUI renders (the
// step-start/reasoning/text/tool parts, each with its tool + input + output).
// The plugin client's session reads returned error/partCount 0 in the live
// environment; the DB read is the reliable in-flight source (the identical
// channel the SHIPPED resume path uses — wave-dispatch.ts:613-618). Baseline:
// the last 50 parts. FULL SCROLL: limit (default 50, max 500) + beforeId (the
// cursor — page back through the ENTIRE history incl. ALL reasoning tokens).
export interface SessionStreamPage {
  ok: boolean;
  error?: string;
  sessionId: string;
  totalParts: number;                    // the session's FULL part count (the progress signal)
  returnedParts: number;                 // this page's size
  moreAvailable: boolean;                // older parts exist (page back with beforeId)
  beforeId: string | null;               // the cursor — pass as beforeId to page further back
  parts: Array<{
    type: string;                        // 'step-start' | 'reasoning' | 'text' | 'tool' | 'step-finish'
    tool?: string;                       // the tool name when type === 'tool'
    input?: unknown;                     // the tool call's input when type === 'tool'
    outputSnippet?: string;              // the tool result's first 200 chars when present
    text?: string;                       // the text/reasoning content
    completed?: boolean;                 // NEW (2026-08-13): the part's time.end present — the message COMPLETED (never true for a streaming part)
  }>;
  lastTools: string[];                   // the last N tool names (what it's doing right now)
  byteGrowth: number;                    // bytes since the last poll (the progress signal)
}

export function readSessionStream(
  sessionId: string,
  opts: { limit?: number; beforeId?: string } = {},
): SessionStreamPage {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) {
      return { ok: false, sessionId, totalParts: 0, returnedParts: 0, moreAvailable: false, beforeId: null, parts: [], lastTools: [], byteGrowth: 0, error: 'opencode.db absent' };
    }
    const db = new Database(dbPath, { readonly: true });
    try {
      const totalRow = db.query('SELECT COUNT(*) AS n FROM part WHERE session_id = ?').get(sessionId) as { n: number };
      const total = totalRow ? totalRow.n : 0;
      const rows = opts.beforeId
        ? db.query('SELECT id, data FROM part WHERE session_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(sessionId, opts.beforeId, limit)
        : db.query('SELECT id, data FROM part WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit);
      const parts: SessionStreamPage['parts'] = [];
      const lastTools: string[] = [];
      for (const r of (rows as Array<{ id: string; data: string }>).reverse()) {  // re-order ascending (chronological)
        try {
          const d = JSON.parse(r.data) as {
            type?: string; tool?: string;
            text?: { value?: string };
            state?: { tool?: string; input?: unknown; output?: unknown };
          };
          const rec: SessionStreamPage['parts'][number] = { type: d.type ?? 'unknown' };
          // THE COMPLETION SIGNAL (2026-08-13 — the detector's misfire fix:
          // the part's `time.end` exists ONLY when the message COMPLETED — a
          // STREAMING text part has only `time.start`. The self-heal's
          // finalized check needs this to never kick a live generation.)
          rec.completed = typeof (d as { time?: { end?: unknown } }).time?.end === 'number';
          if (d.type === 'tool') {
            rec.tool = d.tool ?? d.state?.tool ?? 'tool';
            rec.input = d.state?.input;
            rec.outputSnippet = typeof d.state?.output === 'string' ? d.state.output.slice(0, 200) : undefined;
            lastTools.push(rec.tool);
          } else if (d.type === 'text') {
            // THE TEXT SHAPE (2026-08-13 — the live finding: the runtime
            // 1.14.51 writes the text part's `text` as a PLAIN STRING
            // ({"type":"text","text":"the"}), NOT the {value: ...} object the
            // old mapping expected — the self-heal's detector read 'no-text'
            // on a session whose text WAS there. Handle BOTH shapes.
            const tv = (d as { text?: unknown }).text;
            if (typeof tv === 'string') rec.text = tv;
            else if (tv && typeof (tv as { value?: unknown }).value === 'string') rec.text = (tv as { value: string }).value;
          } else if (d.type === 'reasoning') {
            const rv = (d as { text?: unknown }).text;
            if (typeof rv === 'string') rec.text = rv.slice(0, 400);
            else if (rv && typeof (rv as { value?: unknown }).value === 'string') rec.text = (rv as { value: string }).value.slice(0, 400);
          }
          parts.push(rec);
        } catch { /* a malformed part is skipped — never a page failure */ }
      }
      return {
        ok: true, sessionId, totalParts: total, returnedParts: parts.length,
        moreAvailable: total > (opts.beforeId ? rows.length : limit),
        beforeId: rows.length > 0 ? (rows[0] as { id: string }).id : null,
        parts, lastTools: lastTools.slice(-8), byteGrowth: 0,
      };
    } finally { db.close(); }
  } catch (e) {
    return { ok: false, sessionId, totalParts: 0, returnedParts: 0, moreAvailable: false, beforeId: null, parts: [], lastTools: [], byteGrowth: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// THE PER-AGENT REPORT — the live reads (the sessions are the truth):
// THE COMPACT PER-AGENT ENTRY (2026-08-13 — the anti-context-bloat design:
// the model's context holds ONLY the wave hash + the alias token; the status
// default is the COMPACT summary — the minimal navigation data per agent. The
// FULL detail (the tails, the parts, the error codes) comes only with the
// verbose flag — retrieved on demand, never dumped into the context.)
function compactAgent(name: string, agent: AgentTrack): Record<string, unknown> {
  const sid = agent.sessionIds[agent.sessionIds.length - 1] ?? '';
  return {
    name,
    state: agent.state,
    sessionId: sid,
    taskId: agent.taskIds && agent.taskIds.length > 0 ? agent.taskIds[agent.taskIds.length - 1] : undefined,
    lastActivity: agent.lastActivityAt ? fmtAge(Date.now() - agent.lastActivityAt) : null,
  };
}

async function reportAgent(
  client: WaveStatusClient,
  wave: WaveTrack,
  name: string,
  agent: AgentTrack,
): Promise<Record<string, unknown>> {
  const sid = agent.sessionIds[agent.sessionIds.length - 1];
  let status = 'unknown';
  let parts: unknown[] | undefined;
  try {
    const st = await client.status({});
    status = st.data?.status ?? 'unknown';
  } catch (sErr) {
    status = 'error';
    tridentLog('WARN', 'wave-status', 'status read failed for ' + name + ': ' + (sErr instanceof Error ? sErr.message : String(sErr)));
  }
  try {
    const tail = await client.messages({ path: { id: sid }, query: { limit: 1 } });
    parts = tail.data?.at(-1)?.parts;
  } catch (mErr) {
    tridentLog('WARN', 'wave-status', 'messages read failed for ' + name + ': ' + (mErr instanceof Error ? mErr.message : String(mErr)));
  }
  const lastActivityMs = agent.lastActivityAt ? Date.now() - agent.lastActivityAt : null;
  return {
    name,
    state: agent.state,
    respawnCount: agent.respawnCount,
    sessionId: sid,
    taskIds: agent.taskIds ?? [],         // NEW (2026-08-12): the background dispatch handles
    lastKillReason: agent.lastKillReason,
    lastActivity: fmtAge(lastActivityMs),
    lastToolCalls: toolNames(parts),
    status,
    errorCodes: agent.errorCodes,
  };
}

/** THE EXECUTE — the tool registration (trident-tools.ts) calls this. The
 *  client is the live opencode client (getOpencodeClient); the tests inject a
 *  stub. */
export async function executeWaveStatus(
  args: WaveStatusArgs,
  client: WaveStatusClient | null,
  mainSessionId: string | null,
): Promise<WaveStatusReport | WaveSessionStatusReport> {
  const action = args.action ?? 'status';

  if (!client) {
    return {
      wave: args.waveId ?? args.sessionId ?? 'unknown',
      status: 'no_client',
      etaMs: 0, etaConfidence: 0, elapsedMs: 0, agents: [],
      note: 'the opencode client is unavailable — the status tool cannot read the live sessions',
    };
  }

  // ── KILL (an agent — the per-session abort, the untethering) ──
  if (action === 'kill' && args.agent && args.waveId) {
    const wave = WaveTracker.getWave(args.waveId);
    const agent = wave?.agents[args.agent];
    if (!wave || !agent) {
      // THE RUNTIME-BACKED FALLBACK (2026-08-13 — the failure doc's fix #2):
      // the tracker row can be missing — resolve the wave's sessions from the
      // runtime db and abort them anyway; the kill NEVER dead-ends while the
      // runtime has live agents.
      const runtimeSessions = resolveWaveSessionsFromDb(args.waveId);
      if (runtimeSessions.length > 0) {
        const reason = toKillReason(args.reason);
        for (const s of runtimeSessions) {
          try {
            await abortSession(client, s.id);
          } catch (abErr) {
            tridentLog('WARN', 'wave-status', 'kill abort failed for ' + s.id + ': ' + (abErr instanceof Error ? abErr.message : String(abErr)));
          }
        }
        tridentLog('INFO', 'wave-status', 'KILL ' + args.waveId + '/' + args.agent + ' via the RUNTIME-BACKED resolution (' + runtimeSessions.length + ' sessions aborted) — the tracker row was missing');
        return {
          wave: args.waveId, status: 'killed', etaMs: 0, etaConfidence: 0,
          elapsedMs: 0, agents: [],
          note: 'killed via the runtime-backed resolution — ' + runtimeSessions.length + ' sessions aborted (the tracker row was missing: ' + runtimeSessions.map((s) => s.id).join(',') + ')',
        };
      }
      return {
        wave: args.waveId, status: 'unknown_wave', etaMs: 0, etaConfidence: 0,
        elapsedMs: 0, agents: [],
        note: 'no tracked wave/agent for ' + args.waveId + '/' + args.agent,
      };
    }
    const sid = agent.sessionIds[agent.sessionIds.length - 1];
    const reason = toKillReason(args.reason);
    try {
      await abortSession(client, sid);
    } catch (abErr) {
      tridentLog('WARN', 'wave-status', 'abort failed for ' + args.agent + ': ' + (abErr instanceof Error ? abErr.message : String(abErr)));
    }
    WaveTracker.markKilled(args.waveId, args.agent, reason);
    // THE KILL IS LOGGED (the DEBUG_LOG — AP-7: never a silent kill):
    tridentLog('INFO', 'wave-status', 'KILL ' + args.waveId + '/' + args.agent +
      ' session=' + sid + ' reason=' + reason + ' — the DEBUG_LOG entry recorded');
    ReminderQueue.enqueue(buildOrchestratorAbortDirective(args.waveId, args.agent, sid));
    return {
      wave: args.waveId, status: 'killed', etaMs: wave.etaMs,
      etaConfidence: wave.etaConfidence, elapsedMs: Date.now() - wave.dispatchedAt,
      agents: [await reportAgent(client, wave, args.agent, agent)],
    };
  }

  // ── KILL-WAVE (abort per child — the wave aborted + the completion path) ──
  if (action === 'kill-wave' && args.waveId) {
    const wave = WaveTracker.getWave(args.waveId);
    if (!wave) {
      // THE RUNTIME-BACKED FALLBACK (2026-08-13 — the failure doc's fix #2):
      // the tracker row can be missing — resolve + abort the wave's sessions
      // from the runtime db; kill-wave NEVER dead-ends while the agents live.
      const runtimeSessions = resolveWaveSessionsFromDb(args.waveId);
      if (runtimeSessions.length > 0) {
        await Promise.all(runtimeSessions.map(async (s) => {
          try {
            await abortSession(client, s.id);
          } catch (abErr) {
            tridentLog('WARN', 'wave-status', 'kill-wave abort failed for ' + s.id + ': ' + (abErr instanceof Error ? abErr.message : String(abErr)));
          }
        }));
        tridentLog('INFO', 'wave-status', 'KILL-WAVE ' + args.waveId + ' via the RUNTIME-BACKED resolution (' + runtimeSessions.length + ' sessions aborted) — the tracker row was missing');
        return {
          wave: args.waveId, status: 'aborted', etaMs: 0, etaConfidence: 0,
          elapsedMs: 0, agents: [],
          note: 'aborted via the runtime-backed resolution — ' + runtimeSessions.length + ' sessions killed (the tracker row was missing)',
        };
      }
      return {
        wave: args.waveId, status: 'unknown_wave', etaMs: 0, etaConfidence: 0,
        elapsedMs: 0, agents: [], note: 'no tracked wave for ' + args.waveId,
      };
    }
    const entries = Object.entries(wave.agents);
    await Promise.all(entries.map(async ([, agent]) => {
      const sid = agent.sessionIds[agent.sessionIds.length - 1];
      try {
        await abortSession(client, sid);
      } catch (abErr) {
        tridentLog('WARN', 'wave-status', 'kill-wave abort failed for ' + sid + ': ' + (abErr instanceof Error ? abErr.message : String(abErr)));
      }
    }));
    wave.status = 'aborted';
    for (const [, agent] of entries) {
      if (agent.state !== 'complete' && agent.state !== 'failed') {
        agent.state = 'killed';
        agent.lastKillReason = 'ORCHESTRATOR_ABORT';
        agent.spawnTimes.killedAt = Date.now();
      }
    }
    ReminderQueue.enqueue(buildWaveAbortedDirective(args.waveId, entries.length));
    WaveTracker.archiveWave(args.waveId);
    return {
      wave: args.waveId, status: 'aborted', etaMs: wave.etaMs,
      etaConfidence: wave.etaConfidence, elapsedMs: Date.now() - wave.dispatchedAt,
      agents: entries.map(([name, agent]) => ({ name, state: agent.state, sessionId: agent.sessionIds[agent.sessionIds.length - 1] })),
    };
  }

  // ── STATUS — the raw session view (2026-08-12 — THE IN-FLIGHT VISION) ──
  // The plugin client's session reads returned error/partCount 0 in the live
  // environment — the raw view now reads the SESSION-STREAM READER (the
  // opencode.db part stream = the same data the TUI renders). The client reads
  // remain ONLY as the fallback when the DB is unavailable.
  // THE LIVE FIELD + THE WRAPPER STRIP (2026-08-16 — the FALSE-LIVENESS
  // incident's fix): the sessionId branch gains a `live` boolean — the session's
  // LIVE state computed FROM THE SESSION DATA (the parts' recency + the last
  // step state + the terminal message finish), SEPARATE from the tracker. The
  // session-scoped response is the raw session truth — NOT the wave-scoped
  // per-agent generation noise (the tracker's etaMs/etaConfidence/elapsedMs are
  // the WAVE scope; a sessionId is a DIFFERENT surface).
  if (action === 'status' && args.sessionId) {
    const page = readSessionStream(args.sessionId, { limit: args.limit, beforeId: args.beforeId });
    let rawStatus = page.ok ? 'stream' : 'error';
    let fallbackPartCount = 0;
    // THE LIVE FLAG — the session truth from the session data (the reader page
    // + the terminal-finish probe). The status computation NEVER reads the job
    // registry — the 2026-08-16 incident's fix (task_status said cancelled for
    // live streaming sessions; the SESSION STREAM is the only liveness truth).
    const live = page.ok && page.parts.length > 0 && computeLiveFlag(page);
    if (!page.ok || page.parts.length === 0) {
      // THE CLIENT FALLBACK — the old reads, unchanged behavior
      try {
        const st = await client.status({});
        rawStatus = st.data?.status ?? 'unknown';
      } catch (sErr) {
        rawStatus = 'error';
        tridentLog('WARN', 'wave-status', 'raw session status read failed for ' + args.sessionId + ': ' + (sErr instanceof Error ? sErr.message : String(sErr)));
      }
      try {
        const last = await client.messages({ path: { id: args.sessionId }, query: { limit: 1 } });
        fallbackPartCount = last.data?.at(-1)?.parts?.length ?? 0;
      } catch (mErr) {
        tridentLog('WARN', 'wave-status', 'raw session read failed for ' + args.sessionId + ': ' + (mErr instanceof Error ? mErr.message : String(mErr)));
      }
    }
    // THE WRAPPER STRIP (2026-08-16 — the FALSE-LIVENESS incident's fix): the
    // sessionId surface returns the RAW SESSION TRUTH — the live flag + the
    // stream page — NOT the WaveStatusReport's agents[] per-agent wrapper (the
    // wave-scoped generation noise). The caller asks "is THIS session alive?"
    // and gets the session answer, never the wave framing.
    const sessionReport: WaveSessionStatusReport = {
      ok: page.ok,
      error: page.error,
      wave: args.sessionId,
      sessionId: args.sessionId,
      status: rawStatus,
      live,
      partCount: page.ok ? page.totalParts : fallbackPartCount,
      returnedParts: page.returnedParts,
      lastTools: page.lastTools,
      parts: page.parts,
      moreAvailable: page.moreAvailable,
      beforeId: page.beforeId,
      streamOk: page.ok,
      streamError: page.error,
    };
    return sessionReport;
  }

  // ── STATUS — the wave introspection ──
  const waveId = args.waveId;
  if (!waveId) {
    // THE LIST-ALL BRANCH (2026-08-12 — the 8-agent dashboard): no waveId /
    // sessionId / taskId → iterate getActiveWaves() — the aggregate view (the
    // orchestrator asks "what's running?" in ONE call). A stuck agent marks the
    // wave ACTION_REQUIRED (the INVESTIGATE ruling — it blocks the completion).
    const waves = WaveTracker.getActiveWaves();
    if (waves.length === 0) {
      // THE RUNTIME-ACTIVE FALLBACK (2026-08-13 — the failure doc's fix #2):
      // the tracker can be empty after a loss while the runtime has live
      // background agents — the list-all must NEVER report "no active waves"
      // against a live world. Resolve the running agent-wave sessions from the db.
      const runtimeActive = resolveRunningBackgroundSessions();
      if (runtimeActive.length > 0) {
        return {
          wave: 'all', status: 'runtime_active', etaMs: 0, etaConfidence: 0, elapsedMs: 0,
          agents: runtimeActive.map((s) => ({ sessionId: s.id, name: s.title, status: 'running (runtime-resolved)' })),
          note: 'the tracker was empty — ' + runtimeActive.length + ' runtime-active background sessions resolved from the opencode.db',
        };
      }
      return {
        wave: 'none', status: 'no_wave', etaMs: 0, etaConfidence: 0, elapsedMs: 0,
        agents: [], note: 'no active waves — pass waveId (or sessionId, or action=kill with waveId+agent)',
      };
    }
    return {
      wave: 'all', status: 'active', etaMs: 0, etaConfidence: 0, elapsedMs: 0,
      agents: waves.map((w) => ({
        wave: w.wave, status: w.status, etaMs: w.etaMs, elapsedMs: Date.now() - w.dispatchedAt,
        agents: Object.entries(w.agents).map(([name, agent]) => ({
          name, state: agent.state, taskIds: agent.taskIds ?? [],
          sessionId: agent.sessionIds[agent.sessionIds.length - 1],
          respawnCount: agent.respawnCount,
          blocked: agent.state === 'stuck',
        })),
      })),
      note: waves.length + ' active wave(s)',
    };
  }
  const wave = WaveTracker.getWave(waveId);
  if (!wave) {
    return {
      wave: waveId, status: 'unknown_wave', etaMs: 0, etaConfidence: 0,
      elapsedMs: 0, agents: [], note: 'no tracked wave for ' + waveId,
    };
  }
  const entries = Object.entries(wave.agents);
  // THE COMPACT-vs-VERBOSE (2026-08-13 — the anti-context-bloat: the default
  // report = the wave hash + the alias + the per-agent one-liners (the
  // navigation data ONLY); the full tails/parts/error-codes come with verbose).
  const agents = args.verbose === true
    ? await Promise.all(entries.map(([name, agent]) => reportAgent(client, wave, name, agent)))
    : entries.map(([name, agent]) => compactAgent(name, agent));
  const orphanCheck = mainSessionId ? await scanOrphanedChildren(client, mainSessionId, entries.map(([, a]) => a.sessionIds[a.sessionIds.length - 1])) : [];
  return {
    wave: waveId, alias: wave.alias ?? null, projectToken: wave.projectToken ?? null,
    status: wave.status, etaMs: wave.etaMs,
    etaConfidence: wave.etaConfidence, elapsedMs: Date.now() - wave.dispatchedAt,
    agents,
    ...(orphanCheck.length > 0 ? { note: 'orphaned children (no tracker match): ' + orphanCheck.join(', ') } : {}),
  };
}

// THE ORPHAN SCAN (Part 4.4 — the crash-rebuild's live ground truth): the main
// session's children vs the tracked session IDs — the untracked children are
// the orphaned waves the rebuild should surface.
export async function scanOrphanedChildren(
  client: WaveStatusClient,
  mainSessionId: string,
  trackedSessionIds: string[],
): Promise<string[]> {
  if (!mainSessionId) return [];
  try {
    const children = await client.children({ path: { id: mainSessionId } });
    const ids = (children.data ?? []).map((c) => c.id);
    return ids.filter((id) => !trackedSessionIds.includes(id));
  } catch (chErr) {
    tridentLog('WARN', 'wave-status', 'children scan failed: ' + (chErr instanceof Error ? chErr.message : String(chErr)));
    return [];
  }
}
