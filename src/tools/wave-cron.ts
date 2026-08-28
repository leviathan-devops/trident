// src/tools/wave-cron.ts — the 10-minute in-session clock (Part 5 + Part 16).
// THE OPERATOR'S NUMBER: "60s is slop fuel... 10m is best". The interval is
// registered at the plugin load (startWaveCron — the single registration per
// server). EVERY TICK is the SILENT work: the reads (children/status/messages/
// todos) → the pattern matching (the stuck detector's lexicon) → the tier-1
// reminders (the output-append) → the tier-2 directives (the completion handoff
// + the kill-respawn — the only two submit events). The tick NEVER crashes the
// cron — a dead provider marks the session error and the next tick continues.

import { WaveTracker, setGatePassed, setGateHeld, setGateExempt, type WaveTrack } from './wave-tracker.ts';
import { ReminderQueue } from './wave-reminder-queue.ts';
import { matchStuckPatterns, STUCK_ACTIVITY_AGE_MS, type StuckEvidence } from './wave-stuck-detector.ts';
import { buildCompletionDirective } from './wave-constants.ts';
import { tridentLog } from '../utils.js';
import {
  checkTTQOpening, checkTodowriteStaleness, readTodoRows, type TodoReadTarget,
} from './wave-todowrite.ts';
import { getOpencodeClient } from './trident-tools.ts';
import { readSessionStream } from './wave-status.ts';
// THE SELF-HEAL IMPORTS — COMMENTED OUT (2026-08-20 — pending paragon overhaul):
// the detector + kick functions are suspended with the heal; the imports stay
// dead until the overhaul rebuilds the mechanic with a recency gate. The
// functions themselves remain in main-session-heal.ts (untouched, still tested).
// import {
//   detectDroppedMainGeneration, classifyDroppedTail, kickMainSession, type HealClient,
// } from './main-session-heal.ts';
// @ts-ignore — bun:sqlite ships no type package under tsc (the same convention as wave-dispatch.ts:11-12)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// THE BACKGROUND-TERMINAL PREDICATE (2026-08-12 — the background-only ruling):
// a background task is terminal when its session's part stream stopped growing
// (the DB time_updated frozen) AND the last part is not a pending tool call —
// a read-only DB predicate, the same channel as the wave-status stream reader.
export function isBackgroundTerminal(taskId: string): boolean {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return false;
    const db = new Database(dbPath, { readonly: true });
    try {
      const parts = db.query('SELECT id, data FROM part WHERE session_id = ? ORDER BY id DESC LIMIT 3').all(taskId) as Array<{ data: string }>;
      if (parts.length === 0) return false;
      try {
        const d = JSON.parse(parts[0].data) as { type?: string };
        return d.type !== 'tool' && d.type !== 'step-start';   // a text/step-finish tail = terminal
      } catch { return false; }
    } finally { db.close(); }
  } catch { return false; }
}

// THE CRON INTERVAL (Part 5.1 — 10m; the env override lets the container test
// accelerate the clock without touching the production default):
const ENV_INTERVAL = parseInt(process.env.TRIDENT_WAVE_CRON_INTERVAL_MS ?? '', 10);
export const CRON_INTERVAL_MS = Number.isFinite(ENV_INTERVAL) && ENV_INTERVAL > 0
  ? ENV_INTERVAL
  : 10 * 60 * 1000;

// THE ACTIVE TICK (2026-08-26 — the RC-3/RC-5 fixes): while any wave is live,
// the tick runs at 60-90s cadence so task-completion toasts surface
// near-real-time; idle = the 10m default (the env override preserved for
// tests). A self-rescheduling setTimeout chain (setInterval cannot change its
// own period).
export const ACTIVE_TICK_MS = (() => {
  const v = parseInt(process.env.TRIDENT_WAVE_ACTIVE_TICK_MS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 75 * 1000;
})();

let cronHandle: ReturnType<typeof setTimeout> | null = null;
let cronStopped = false;

// THE TICK'S CLIENT SURFACE (the reads the cron performs — the sessions are
// the truth, never the narration):
export interface WaveCronClient {
  status(opts: { query?: Record<string, unknown> }): Promise<{ data?: { status?: string } | null }>;
  messages(opts: { path: { id: string }; query?: Record<string, unknown> }): Promise<{ data?: unknown[] | null }>;
  todo(opts: { path: { id: string } }): Promise<{ data?: unknown[] | null }>;
  // THE MAIN-SESSION RESOLUTION (2026-08-13 — the live finding: the hook
  // inputs carry sessionID 'default' in the container — the chat.message/event
  // tether never gets the real id. The CLIENT's session list is the reliable
  // source — the newest session IS the main session. P1-verified.)
  session?: {
    list(opts: Record<string, unknown>): Promise<{ data?: Array<{ id?: string }> | null }>;
  };
  // THE KICK CHANNEL (2026-08-13 — the main-session self-heal): the TUI input
  // (appendPrompt + submitPrompt — the same channel the human typing in the
  // TUI uses). The live client exposes it (the wave-probe's P3 verified it).
  tui?: {
    appendPrompt(opts: { body: { text: string } }): Promise<{ data?: unknown }>;
    submitPrompt(opts: Record<string, unknown>): Promise<{ data?: unknown }>;
  };
}

// THE MAIN-SESSION ID RESOLUTION (2026-08-13 — the tether fix, live-verified
// twice): (1) the hook inputs carry 'default' (never the real id) → the tether
// is null; (2) the client.session.list picked a SUBAGENT session as the
// 'newest' (the subagents are children — the main session is the newest ROOT).
// THE DEFINITIVE SOURCE: the opencode.db's session table — the newest session
// with parent_id NULL IS the main TUI session (the subagents carry a parent).
// The same db channel as the stream/terminal checks.
function resolveMainSessionId(client: WaveCronClient | null, mainSessionId: string | null): string | null {
  if (mainSessionId && mainSessionId !== 'default') return mainSessionId;
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.query('SELECT id FROM session WHERE parent_id IS NULL ORDER BY rowid DESC LIMIT 1').get() as { id?: string } | null;
      const sid = row?.id ?? null;
      if (sid && sid !== 'default') return sid;
    } finally {
      db.close();
    }
  } catch (e) {
    tridentLog('WARN', 'wave-cron', 'the main-session resolution failed (the heal + the todo checks skip this tick): ' + (e instanceof Error ? e.message : String(e)));
  }
  return null;
}

export function startWaveCron(): void {
  if (cronHandle) return;                  // the single registration per server
  cronStopped = false;
  const scheduleNext = () => {
    if (cronStopped) { cronHandle = null; return; }
    // ADAPTIVE: live waves → the fast tick; idle → the base interval. The
    // getActiveWaves check is an in-memory Map scan (microseconds idle cost).
    const delay = WaveTracker.getActiveWaves().length > 0 ? ACTIVE_TICK_MS : CRON_INTERVAL_MS;
    cronHandle = setTimeout(async () => {
      try {
        let client: WaveCronClient | null = null;
        try {
          const live = getOpencodeClient();
          if (live) client = live as unknown as WaveCronClient;
        } catch (cErr) {
          tridentLog('WARN', 'wave-cron', 'client resolution failed: ' + (cErr instanceof Error ? cErr.message : String(cErr)));
        }
        await waveTick(client, mainSessionIdRef());
      } catch (tErr) {
        // THE CRON NEVER DIES (Part 5.5 — a dead tick must not stop the loop):
        tridentLog('ERROR', 'wave-cron', 'waveTick crashed: ' + (tErr instanceof Error ? tErr.message : String(tErr)));
      } finally {
        scheduleNext();
      }
    }, delay);
    // The timer MUST NOT hold the process open (the tests + the server
    // shutdown rely on this):
    try {
      (cronHandle as unknown as { unref?: () => void }).unref?.();
    } catch (uErr) {
      tridentLog('WARN', 'wave-cron', 'timer unref failed (non-fatal): ' + (uErr instanceof Error ? uErr.message : String(uErr)));
    }
  };
  scheduleNext();
  tridentLog('INFO', 'wave-cron', 'the wave cron registered (adaptive: ' + ACTIVE_TICK_MS + 'ms with live waves, ' + CRON_INTERVAL_MS + 'ms idle)');
}

export function stopWaveCron(): void {
  cronStopped = true;
  if (cronHandle) {
    clearInterval(cronHandle);
    cronHandle = null;
    tridentLog('INFO', 'wave-cron', 'the wave cron stopped');
  }
}

// THE MAIN SESSION ID — the session-key tether (the sidecar's chain); set by
// the hook context when available (Part 3.2 — the parentID resolution).
// THE STICK-ONCE SEMANTICS (2026-08-13 — the operator's callout: the OLD
// setter was a plain overwrite and TWO call sites passed NULL when the hook
// input carried 'default' — the chat.message + the wave-event hooks — so the
// session.created anchor got NULLED in the container (the KICK hit the right
// session BY THE DB FALLBACK, not the tether). THE FIX: the anchor accepts
// ONLY a real non-default id, and the FIRST real id STICKS — a later 'default'
// or a different session's id can never hijack or clear it. The first real id
// the process sees IS its own session in the standard model (each TUI window =
// its own opencode server process = its own plugin = its own cron; the
// session.created event fires for ITS session at boot — container-proven).
let mainSessionIdOverride: string | null = null;
export function setCronMainSessionId(sid: string | null): void {
  if (typeof sid !== 'string' || sid.length === 0 || sid === 'default') return;  // never null, never 'default'
  if (mainSessionIdOverride) return;                                             // the first real id sticks
  mainSessionIdOverride = sid;
  // THE ONE-TIME ANCHOR LOG (once per process — the observable proof of the
  // session.created tether; NOT per-tick noise):
  void tridentLog('INFO', 'wave-cron', 'MAIN-SESSION ANCHOR: ' + sid + ' (the first real session id — the process\'s own session)');
}
function mainSessionIdRef(): string | null {
  return mainSessionIdOverride;
}
// THE TEST SEAM (the stick-once semantics are externally verifiable):
export function getCronMainSessionId(): string | null {
  return mainSessionIdOverride;
}

export function isCronRunning(): boolean {
  return cronHandle !== null;
}

// THE PER-AGENT TICK — the reads → the evidence → the pattern decision:
async function tickAgent(
  client: WaveCronClient,
  wave: WaveTrack,
  name: string,
  agent: WaveTrack['agents'][string],
): Promise<void> {
  if (agent.state !== 'running' && agent.state !== 'spawned') return;
  const sid = agent.sessionIds[agent.sessionIds.length - 1];
  let status: string;
  let statusReadFailed = false;
  let bytes = agent.lastBytes;
  // ═══ THE EVENT-AWARE TERMINAL DETECTION (2026-08-26 — the operator: the
  // gate "literally fired in the middle of the agent reading — ZERO event
  // awareness"). THE BUG: step-finish fires after EVERY tool round — an
  // agent mid-work (read→step-finish→step-start→next tool) shows "newest =
  // step-finish" between every pair of steps, and the single-snapshot check
  // fired the gate on every inter-step gap the cron sampled. THE FIX: a
  // terminal state requires the stream QUIETED — the newest part is
  // step-finish AND the part COUNT is unchanged since the last tick (no new
  // work arrived) AND the last activity is at least one full quiet window
  // old. A step-finish on a GROWING stream = mid-work, not terminal. ═══
  const QUIET_WINDOW_MS = 90_000;   // one poll cycle of silence = quieted
  const isTerminalStream = (stream: { ok: boolean; parts: Array<{ type?: string; completed?: boolean }>; totalParts: number }): boolean => {
    if (!stream.ok || stream.parts.length === 0) return false;
    const newest = stream.parts[stream.parts.length - 1];
    const isFinishMarker = newest.type === 'step-finish' || newest.completed === true;
    if (!isFinishMarker) return false;
    // The stream must be QUIETED: no new parts since the last tick (the count
    // didn't grow) AND the last activity is past the quiet window.
    const grewSinceLastTick = stream.totalParts > agent.lastBytes;
    const quieted = !grewSinceLastTick && (Date.now() - (agent.lastActivityAt ?? 0)) > QUIET_WINDOW_MS;
    return quieted;
  };
  if (agent.taskIds && agent.taskIds.length > 0) {
    try {
      const stream = readSessionStream(agent.taskIds[agent.taskIds.length - 1], { limit: 1 });
      bytes = stream.totalParts;
      if (isTerminalStream(stream)) {
        agent.lastActivityAt = Date.now();
        tridentLog('INFO', 'wave-cron', 'TERMINAL(quieted): ' + wave.wave + '/' + name + ' — finish marker + no growth + past the quiet window — routed to the completion gate.');
        await routeCompletionGate(wave, name, agent, 'background');
        return;
      }
      status = stream.ok ? 'stream' : 'unknown';
    } catch (bgErr) {
      status = 'unknown';
      statusReadFailed = true;
      tridentLog('WARN', 'wave-cron', 'background stream read failed for ' + wave.wave + '/' + name + ' — the read-failure flag set (NOT a crash): ' + (bgErr instanceof Error ? bgErr.message : String(bgErr)));
    }
  } else {
    try {
      if (sid) {
        const stream = readSessionStream(sid, { limit: 1 });
        bytes = stream.totalParts;
        if (isTerminalStream(stream)) {
          agent.lastActivityAt = Date.now();
          tridentLog('INFO', 'wave-cron', 'TERMINAL(quieted): ' + wave.wave + '/' + name + ' — finish marker + no growth + past the quiet window (session-keyed) — routed to the completion gate.');
          await routeCompletionGate(wave, name, agent, 'foreground');
          return;
        }
        status = stream.ok ? 'stream' : 'unknown';
      } else {
        status = 'unknown';
      }
    } catch (fgErr) {
      status = 'unknown';
      statusReadFailed = true;
      tridentLog('WARN', 'wave-cron', 'foreground stream read failed for ' + wave.wave + '/' + name + ' — the read-failure flag set (NOT a crash): ' + (fgErr instanceof Error ? fgErr.message : String(fgErr)));
    }
  }
  const streamGrowing = bytes > agent.lastBytes;
  if (streamGrowing) agent.lastActivityAt = Date.now();
  agent.lastBytes = bytes;

  const evidence: StuckEvidence = {
    agent, wave,
    name,                                // the REAL agent name key (2026-08-13 — the directive names the exact agent)
    sessionStatus: status,
    statusReadFailed,
    lastTickBytes: agent.lastBytes,
    streamGrowing,
    lastActivityAgeMs: Date.now() - (agent.lastActivityAt ?? Date.now()),
    providerErrorCount: agent.errorCodes.length,
    now: Date.now(),
  };
  const decision = matchStuckPatterns(evidence);
  if (decision.action !== 'WAIT' && decision.directive) {
    // THE READ-AND-KICK (2026-08-23 — the operator: "wave manager read and
    // kick, don't sit here doing nothing"): before ANY kill directive, a
    // STUCK_NO_ACTIVITY agent gets EXACTLY ONE steer-kick — a queue-mode
    // 'continue' steered into its live session — and ONE escalation window
    // (another STUCK_ACTIVITY_AGE_MS of silence post-kick). Only a STILL
    // silent agent after the kick earns the kill-respawn directive. The kick
    // is exactly-once per agent (kickCount), never repeated, never spammed.
    if (decision.pattern?.id === 'STUCK_NO_ACTIVITY' && !agent.kickCount) {
      agent.kickCount = (agent.kickCount ?? 0) + 1;
      agent.kickedAt = Date.now();
      const sid = agent.taskIds?.[agent.taskIds.length - 1] || agent.sessionIds[agent.sessionIds.length - 1] || '';
      let kickOutcome = 'no session id to steer';
      if (sid) {
        try {
          const { executeWaveSteer } = await import('./wave-dispatch.ts');
          const r = await executeWaveSteer(sid,
            '[WAVE KICK] The watchdog sees no stream growth from you. If your current step is genuinely still running, keep going and emit SOMETHING (a tool call or a progress note) so the stream moves. If you are wedged, re-assess and continue the task now.',
            { mode: 'queue', subagentType: 'trident_explore' });
          kickOutcome = 'steered ' + r.sessionId + ' (' + r.mode + ')';
        } catch (kErr) {
          kickOutcome = 'steer failed: ' + (kErr instanceof Error ? kErr.message : String(kErr));
        }
      }
      tridentLog('WARN', 'wave-cron', 'KICKED (1/1) ' + wave.wave + '/' + name + ': ' + kickOutcome + ' — escalation to kill only after another ' + Math.round(STUCK_ACTIVITY_AGE_MS / 60000) + 'm of silence.');
      ReminderQueue.enqueue('WAVE ' + wave.wave + ' — KICKED ' + name + ' once (' + kickOutcome + '). Escalation window: ' + Math.round(STUCK_ACTIVITY_AGE_MS / 60000) + 'm of continued silence before the kill-respawn directive.');
      return;
    }
    // THE POST-KICK ESCALATION (exactly-once kick spent; still silent):
    if (decision.pattern?.id === 'STUCK_NO_ACTIVITY' && agent.kickCount && agent.kickedAt
      && (Date.now() - agent.kickedAt) < STUCK_ACTIVITY_AGE_MS) {
      // Inside the escalation window — hold fire, report, do not kill yet.
      tridentLog('INFO', 'wave-cron', 'post-kick window: ' + wave.wave + '/' + name + ' silent ' + Math.round((Date.now() - agent.kickedAt) / 60000) + 'm since kick — holding.');
      return;
    }
    // THE TIER-2 — the ONE interruption the evidence justifies (Part 5.3):
    ReminderQueue.enqueue(decision.directive);
    tridentLog('WARN', 'wave-cron', 'kill-respawn evidence matched for ' + wave.wave + '/' + name + ': ' + decision.pattern?.id + ' → ' + decision.action);
  }
}

// ═══ THE TASK-COMPLETION TOAST — REMOVED (2026-08-26, DB-verified): the
// runtime's VANILLA inject owns the completion notification. TaskTool.execute's
// background branch (which extra.taskDispatch calls — task.ts is byte-identical
// to vanilla 1.14.51) injects the synthetic `{type:"text",synthetic:true}` part
// ("Background task completed: <name> | task_id: <child session> | state:
// completed | <task_result>") into the OWNING session and wakes it only when
// idle (noReply:true — the gentle kick). PROVEN MECHANICALLY 2026-08-26 via the
// opencode.db probe (read-only, LIMIT-bounded): synthetic injects for
// wave-dispatched agents — calc-builder (this session, wave-1787720204493),
// util-builder, machine-surgery, gate-strategies, b4-verify-update, s5-battery,
// … — all landed in their dispatching orchestrator sessions. The promptAsync
// toast was a SECOND, chat-shaped, generation-forcing kick on every completion
// — the double-notification bug. The gate below stays a PURE OBSERVER
// (bookkeeping + the remediation steer): observation ≠ kick. Gate verdicts
// surface via the orchestrator's status polls (the W16 doctrine) + the vanilla
// inject's own task_result text — NEVER via promptAsync. ═══

// ═══ THE COMPLETION GATE ROUTER (2026-08-26 — COMPLETION_GATE_SPEC §2.4):
// BOTH completion paths route here. The gate evaluates the agent's return
// text against the artifact class; PASS → markComplete; HOLD → the
// one remediation steer + in_review; FAILED → the loud named failure.
// NOTIFICATION: vanilla TaskTool inject owns it (see the tombstone above) —
// this router NEVER prompts the orchestrator session. ═══
async function routeCompletionGate(wave: WaveTrack, name: string, agent: WaveTrack['agents'][string], _path: 'background' | 'foreground'): Promise<void> {
  try {
    const sid = agent.sessionIds[agent.sessionIds.length - 1] || (agent.taskIds && agent.taskIds[agent.taskIds.length - 1]) || '';
    // THE EVIDENCE READ: text parts AND tool-result outputs (the command
    // OUTPUTS live in tool results — the DB part shape nests them at
    // state.output / state.metadata.output; the read probes every level).
    let evidenceText = '';
    if (sid) {
      try {
        const page = readSessionStream(sid, { limit: 14 });
        if (page.ok) {
          evidenceText = page.parts.map((p: Record<string, unknown>) => {
            const t = String(p.type ?? '');
            if (t === 'text') return String(p.text ?? '');
            if (t === 'tool') {
              const st = p.state as Record<string, unknown> | undefined;
              const meta = st?.metadata as Record<string, unknown> | undefined;
              return String(st?.output ?? meta?.output ?? p.output ?? p.outputSnippet ?? '');
            }
            return '';
          }).filter(Boolean).join('\n');
        }
      } catch { /* empty → INCONCLUSIVE → HOLD (the fail state, never a pass) */ }
    }
    // THE DECLARED CLASS — from the track (computed at dispatch from the
    // spec's filepaths + template — NEVER from return text). The fallback
    // for pre-gate waves: a B-shaped name never defaults to REPORT — the
    // strictest defensible class for an unknown build agent is the battery
    // gate (an E-shaped/exploration agent defaults REPORT).
    const declaredClass = agent.declaredClass
      ?? (/^(b[0-9]|build|gate|evidence|writer|hunter|fix|impl)/i.test(name) ? 'TYPE_BATTERY' : 'REPORT');
    // EXEMPT classes complete without evidence checks (spec §2.6 misfire
    // guards 1+2: DOC + REPORT).
    if (declaredClass === 'REPORT' || declaredClass === 'DOC') {
      tridentLog('INFO', 'wave-cron', 'COMPLETION GATE ' + wave.wave + '/' + name + ': PASS [EXEMPT declaredClass=' + declaredClass + ']');
      setGateExempt(wave.wave, name);
      WaveTracker.markComplete(wave.wave, name);
      return;
    }
    const { evaluateCompletion } = await import('./wave-completion-gate.ts');
    const priorHolds = agent.gateHolds ?? 0;
    const verdict = evaluateCompletion(evidenceText, declaredClass, priorHolds);
    tridentLog('INFO', 'wave-cron', 'COMPLETION GATE ' + wave.wave + '/' + name + ': ' + verdict.decision + ' [declared=' + declaredClass + ' holds=' + priorHolds + '] ' + verdict.triad.evidence);
    if (verdict.decision === 'PASS') {
      setGatePassed(wave.wave, name);
      WaveTracker.markComplete(wave.wave, name);
      // ═══ THE INJECT TRIPWIRE (2026-08-28 — the EN-200 lesson, plugin-side):
      // the vanilla inject writes the synthetic "Background task completed"
      // part into the OWNING session at job completion. If that write ever
      // dies silently again (the stale-git-lock class), this WARN is the
      // operator-visible signal — a completed+gate-passed agent with NO
      // inject in the owner transcript. A tripwire, not a writer: the plugin
      // has no synthetic-part API (verified); the fix for a tripped wire is
      // environmental (e.g. rm a stale lock) or the shelved durable inject. ═══
      void (async () => {
        try {
          if (!wave.ownerSessionId || wave.ownerSessionId === 'default') return;
          const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
          if (!fs.existsSync(dbPath)) return;
          const db = new Database(dbPath, { readonly: true });
          try {
            const row = db.query(
              "SELECT COUNT(*) c FROM part WHERE session_id = ? AND data LIKE '%\"synthetic\":true%' AND data LIKE '%Background task completed: ' || ? || '%'"
            ).get(wave.ownerSessionId, name) as { c: number } | null;
            if (row && row.c === 0) {
              tridentLog('WARN', 'wave-cron', 'INJECT TRIPWIRE: ' + wave.wave + '/' + name + ' completed + gate-passed but NO vanilla inject found in owner ' + wave.ownerSessionId + ' — the completion notification may be LOST (check ~/.local/share/opencode/snapshot/*/index.lock or deploy the durable inject)');
            }
          } finally { db.close(); }
        } catch { /* the tripwire never breaks the gate path */ }
      })();
      return;
    }
    if (verdict.decision === 'HOLD') {
      // THE REAL ENFORCEMENT LOOP (spec §2.3-2.4): the agent STAYS 'running'
      // (tickAgent keeps processing it) — the steer makes it work again; its
      // next terminal state RE-ENTERS this gate (the re-evaluation). The
      // gateHolds counter rides the track; the 2nd insufficient hold →
      // evaluateCompletion returns FAILED (no infinite loop, no stranding).
      const holds = setGateHeld(wave.wave, name);
      try {
        const { executeWaveSteer } = await import('./wave-dispatch.ts');
        await executeWaveSteer(sid, verdict.remediation, { mode: 'soft', subagentType: 'trident_build' });
        tridentLog('WARN', 'wave-cron', 'GATE HOLD (' + holds + ') → remediation steered to ' + name + ' (' + sid + ') — the agent stays running; its resubmission re-enters the gate');
      } catch (sErr) {
        tridentLog('ERROR', 'wave-cron', 'GATE HOLD steer failed for ' + name + ': ' + (sErr instanceof Error ? sErr.message : String(sErr)) + ' — the gate state holds; the next tick re-evaluates.');
      }
      return;
    }
    // FAILED — the loud named failure; the orchestrator decides (it saw the
    // vanilla inject's task_result at child terminal; the verdict rides the
    // tracker row + its status polls).
    WaveTracker.markFailed(wave.wave, name, 'COMPLETION GATE: ' + (verdict.remediation || 'second return without execution evidence'));
  } catch (gErr) {
    tridentLog('ERROR', 'wave-cron', 'completion gate crashed for ' + wave.wave + '/' + name + ' — failing OPEN this cycle: ' + (gErr instanceof Error ? gErr.message : String(gErr)));
    WaveTracker.markComplete(wave.wave, name);
  }
}

// THE TICK (Part 16 — the silent reads + the classifications). The client is
// injectable (the tests stub the reads); the production uses the live client.
export async function waveTick(
  client: WaveCronClient | null,
  mainSessionId: string | null,
  opts: { openQueueCount?: number; todoTarget?: TodoReadTarget | null } = {},
): Promise<void> {
  const waves = WaveTracker.getActiveWaves();
  if (waves.length === 0) {
    // THE SECONDARY CHECKS still run (the [TTQ] opening + the stale sweeper):
    await secondaryChecks(client, mainSessionId, opts);
    return;
  }
  if (!client) {
    tridentLog('WARN', 'wave-cron', 'tick skipped — no client (the reads are the ground truth; a dead client marks the sessions error)');
    return;
  }

  for (const wave of waves) {
    for (const [name, agent] of Object.entries(wave.agents)) {
      await tickAgent(client, wave, name, agent);
      // THE BACKGROUND COMPLETION FEED (2026-08-12 — the background-only
      // ruling): a background agent's terminal state comes from the session
      // record. markComplete feeds the EXISTING allDone predicate below — the
      // wave completes when all agents are terminal, background or not.
      if (agent.taskIds && agent.taskIds.length > 0 && agent.state === 'running') {
        try {
          if (isBackgroundTerminal(agent.taskIds[agent.taskIds.length - 1])) {
            await routeCompletionGate(wave, name, agent, 'background');
          }
        } catch (bgErr) {
          tridentLog('WARN', 'wave-cron', 'background terminal check failed for ' + wave.wave + '/' + name + ' (the next tick retries): ' + (bgErr instanceof Error ? bgErr.message : String(bgErr)));
        }
      }
    }

    // ── THE COMPLETION DETECTION ──
    const allDone = Object.values(wave.agents).every((a) =>
      a.state === 'complete' || a.state === 'failed' || a.state === 'killed');
    if (allDone && wave.status !== 'complete' && wave.status !== 'aborted') {
      wave.status = 'complete';
      const n = Object.keys(wave.agents).length;
      ReminderQueue.enqueue(buildCompletionDirective(wave.wave, n));
      tridentLog('INFO', 'wave-cron', 'wave ' + wave.wave + ' complete — the completion directive queued');
      WaveTracker.archiveWave(wave.wave);
    }
  }

  await secondaryChecks(client, mainSessionId, opts);
}

// THE SECONDARY CHECKS (Part 7.5 + 7.6 — the silent tiers):
async function secondaryChecks(
  client: WaveCronClient | null,
  mainSessionId: string | null,
  opts: { openQueueCount?: number; todoTarget?: TodoReadTarget | null } = {},
): Promise<void> {
  // THE MAIN-SESSION RESOLUTION (2026-08-13 — the tether fix): the hook
  // inputs carry 'default' — the CLIENT's session list is the reliable id.
  // DISABLED — pending paragon overhaul (2026-08-20): the resolution served
  // ONLY the self-heal kick; the heal is suspended, so the per-tick DB read is
  // dead weight. Re-enable together with the heal.
  // const healSessionId = await resolveMainSessionId(client, mainSessionId);
  // ═══ THE MAIN-SESSION SELF-HEAL — DISABLED (2026-08-20 — pending paragon
  // overhaul) ═══
  // THE PHANTOM KICK: this mechanic auto-sent the minimal 'continue' chat
  // message to INACTIVE sessions. The detector's "finalized" check proves only
  // that the newest part is not streaming — an idle session whose last message
  // COMPLETED long ago reads identically to a just-dropped generation, and
  // there is NO recency gate on the last-text part. The shadow classifier can
  // judge a stale completed message as 'dropped' → the cron kicked the idle
  // main session with 'continue' → the phantom prompt appeared in the TUI.
  // DISABLED ISOLATED (pending paragon overhaul): the detector + kick
  // functions remain in main-session-heal.ts (untouched, still tested) but the
  // cron NEVER calls them — the auto-kick is dead until the overhaul rebuilds
  // the mechanic with a proper recency gate + an activity discriminator.
  //
  // (2026-08-13 — the operator's original design: the main agent's generation
  // can DROP mid-sentence — the provider cuts the stream; the runtime
  // FINALIZES the partial — the ▣ timestamp renders, the agent goes IDLE with
  // the work stuck. THE KICK: the minimal 'continue' chat message via the TUI
  // input. 2026-08-16 — the operator's override: the regex-ladder decision is
  // DEAD, the dropped-generation decision is the SHADOW MODEL's binary
  // judgment. The pre-check (the finalized signal) is sync; the model call is
  // async — the cron awaited it. THE COOLDOWN bounded the kick rate; the
  // fail-safe: a detection failure NEVER kicked. ALL OF IT IS SUSPENDED.)
  if (false) {
    // DISABLED — pending paragon overhaul (2026-08-20). The original logic is
    // preserved for the overhaul reference:
    //   const heal = await classifyDroppedTail(healSessionId);
    //   if (heal.dropped) {
    //     kickMainSession(client, healSessionId) — the phantom 'continue' kick.
    //   }
  }
  const todoTarget = opts.todoTarget ?? (client ? {
    get: async () => {
      const res = await client.todo({ path: { id: mainSessionId ?? '' } });
      return { data: (res.data ?? []) as never[] };
    },
  } : null);
  const rows = await readTodoRows(mainSessionId, todoTarget);
  const openQueueCount = typeof opts.openQueueCount === 'number' ? opts.openQueueCount : 0;
  await checkTTQOpening(rows, openQueueCount);
  await checkTodowriteStaleness(rows);
}
