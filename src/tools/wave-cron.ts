// src/tools/wave-cron.ts — the 10-minute in-session clock (Part 5 + Part 16).
// THE OPERATOR'S NUMBER: "60s is slop fuel... 10m is best". The interval is
// registered at the plugin load (startWaveCron — the single registration per
// server). EVERY TICK is the SILENT work: the reads (children/status/messages/
// todos) → the pattern matching (the stuck detector's lexicon) → the tier-1
// reminders (the output-append) → the tier-2 directives (the completion handoff
// + the kill-respawn — the only two submit events). The tick NEVER crashes the
// cron — a dead provider marks the session error and the next tick continues.

import { WaveTracker, type WaveTrack } from './wave-tracker.ts';
import { ReminderQueue } from './wave-reminder-queue.ts';
import { matchStuckPatterns, type StuckEvidence } from './wave-stuck-detector.ts';
import { buildCompletionDirective } from './wave-constants.ts';
import { tridentLog } from '../utils.js';
import {
  checkTTQOpening, checkTodowriteStaleness, readTodoRows, type TodoReadTarget,
} from './wave-todowrite.ts';
import { getOpencodeClient } from './trident-tools.ts';
import { readSessionStream } from './wave-status.ts';
import {
  detectDroppedMainGeneration, kickMainSession, type HealClient,
} from './main-session-heal.ts';
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

let cronHandle: ReturnType<typeof setInterval> | null = null;

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
  cronHandle = setInterval(() => {
    // THE LIVE CLIENT — resolved at each tick (null before createTridentTools
    // runs; the tick handles a null client gracefully — the reads mark the
    // sessions error, the secondary checks still run):
    let client: WaveCronClient | null = null;
    try {
      const live = getOpencodeClient();
      if (live) client = live as unknown as WaveCronClient;
    } catch (cErr) {
      tridentLog('WARN', 'wave-cron', 'client resolution failed: ' + (cErr instanceof Error ? cErr.message : String(cErr)));
    }
    void waveTick(client, mainSessionIdRef()).catch((tErr) => {
      // THE CRON NEVER DIES (Part 5.5 — a dead tick must not stop the loop):
      tridentLog('ERROR', 'wave-cron', 'waveTick crashed: ' + (tErr instanceof Error ? tErr.message : String(tErr)));
    });
  }, CRON_INTERVAL_MS);
  // The interval MUST NOT hold the process open (the tests + the server
  // shutdown rely on this):
  try {
    (cronHandle as unknown as { unref?: () => void }).unref?.();
  } catch (uErr) {
    tridentLog('WARN', 'wave-cron', 'interval unref failed (non-fatal): ' + (uErr instanceof Error ? uErr.message : String(uErr)));
  }
  tridentLog('INFO', 'wave-cron', 'the 10m wave cron registered (interval ' + CRON_INTERVAL_MS + 'ms)');
}

export function stopWaveCron(): void {
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
  if (agent.taskIds && agent.taskIds.length > 0) {
    // THE BACKGROUND EVIDENCE (2026-08-12 — the background-only ruling): the DB
    // part stream SIZE is the activity signal (the client messages read errored
    // in the live environment). A growing part count = activity; a frozen count
    // past the ETA = STUCK (the PatternFamily below decides).
    try {
      const stream = readSessionStream(agent.taskIds[agent.taskIds.length - 1], { limit: 1 });
      bytes = stream.totalParts;
      status = stream.ok ? 'stream' : 'unknown';
    } catch (bgErr) {
      status = 'unknown';
      statusReadFailed = true;
      tridentLog('WARN', 'wave-cron', 'background stream read failed for ' + wave.wave + '/' + name + ' — the read-failure flag set (NOT a crash): ' + (bgErr instanceof Error ? bgErr.message : String(bgErr)));
    }
  } else {
    try {
      const st = await client.status({});
      status = st.data?.status ?? 'unknown';
      const tail = await client.messages({ path: { id: sid }, query: { limit: 1 } });
      bytes = JSON.stringify(tail.data ?? []).length;
    } catch (sErr) {
      // THE READ-FAILURE DISTINCTION (2026-08-07 — the live false-positive):
      // a failed read is NOT a session crash — the status stays unknown + the
      // read-failure flag set; the SESSION_CRASH pattern requires the confirmed
      // status, never the read error.
      status = 'unknown';
      statusReadFailed = true;
      tridentLog('WARN', 'wave-cron', 'read failed for ' + wave.wave + '/' + name + ' — the read-failure flag set (NOT a crash): ' + (sErr instanceof Error ? sErr.message : String(sErr)));
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
    // THE TIER-2 — the ONE interruption the evidence justifies (Part 5.3):
    ReminderQueue.enqueue(decision.directive);
    tridentLog('WARN', 'wave-cron', 'kill-respawn evidence matched for ' + wave.wave + '/' + name + ': ' + decision.pattern?.id + ' → ' + decision.action);
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
            WaveTracker.markComplete(wave.wave, name);
            tridentLog('INFO', 'wave-cron', 'background agent ' + wave.wave + '/' + name + ' marked complete (the part stream terminal)');
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
  const healSessionId = await resolveMainSessionId(client, mainSessionId);
  // ═══ THE MAIN-SESSION SELF-HEAL (2026-08-13 — the operator's design) ═══
  // The main agent's generation can DROP mid-sentence (the provider cuts the
  // stream; the runtime FINALIZES the partial — the ▣ timestamp renders, the
  // agent goes IDLE with the work stuck). The detector reads the main
  // session's part stream: the LAST assistant text is OBVIOUSLY incomplete
  // (the incompletion lexicon) AND the message is FINALIZED (no pending
  // step-start — the agent idle, NOT processing — the slow-vs-frozen
  // discriminator). THE KICK: the minimal 'continue' chat message via the TUI
  // input (appendPrompt + submitPrompt) — literally a space+Enter to
  // reactivate it. NO interrupt path, NO model switch (the operator's rulings
  // 2026-08-13 — both removed). The cooldown (10m — the cron interval) bounds
  // the kick rate. The fail-safe: a detection failure NEVER kicks.
  if (healSessionId && client && typeof client.tui?.appendPrompt === 'function') {
    try {
      const heal = detectDroppedMainGeneration(healSessionId);
      if (heal.dropped) {
        void kickMainSession(client as unknown as HealClient, healSessionId).then((kr) => {
          if (!kr.kicked && kr.error !== 'cooldown') {
            tridentLog('WARN', 'wave-cron', 'the main-session kick did not land: ' + (kr.error ?? 'unknown'));
          }
        }).catch((healErr) => {
          tridentLog('WARN', 'wave-cron', 'the main-session kick threw (non-fatal): ' + (healErr instanceof Error ? healErr.message : String(healErr)));
        });
      }
    } catch (healErr) {
      tridentLog('WARN', 'wave-cron', 'the main-session heal check failed (non-fatal): ' + (healErr instanceof Error ? healErr.message : String(healErr)));
    }
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
