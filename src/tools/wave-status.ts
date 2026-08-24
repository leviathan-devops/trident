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

// ═══ THE RETURN-INTEGRITY LEXICON (the truncation detector, rebuilt to the
// LEXICON_GRADE_INTELLIGENT_SYSTEMS_ENGINEERING_BIBLE canon: the typed
// PatternFamily members + the state machine + the evidence triad).
//
// THE DOMAIN: a completed subagent's RETURN TEXT — is it a WHOLE report or a
// CUT? `complete` is the session-TERMINATION signal: a provider that dies
// mid-return still writes the terminal finish. This lexicon is the
// work-wholeness judgment on the return's tail.
//
// THE EVIDENCE CLASS: return-evidence — { finalText, terminalStatus } (the
// session's final text part + its computed status; both from the session
// stream, never the job registry).
//
// THE DECISION LAYER: the classifyReturnIntegrity state machine below — the
// patterns DETECT (Order-2: the token match + the surrounding tail
// structure), the machine DECIDES (the gated state transition), the caller
// receives the triad. The regex components are DETECTORS only, named per
// §3.4 of the bible.

export interface ReturnEvidence {
  /** The session's final non-empty text part, verbatim. */
  finalText: string;
  /** The computed session status ('complete' gates the whole lexicon). */
  terminalStatus: WaveReadStatusName;
}
type WaveReadStatusName = 'stream' | 'idle' | 'complete' | 'absent';

interface ReturnIntegrityPattern {
  id: string;
  kind: 'return-evidence';
  /** The mechanical DETECTOR — Order-2: a structural judgment on the tail
   *  (token identity + position + what surrounds it), regexes as components. */
  matcher: (ev: ReturnEvidence) => boolean;
  /** The contextual gate — non-complete statuses never fire any pattern. */
  triggerCondition: (ev: ReturnEvidence) => boolean;
  severity: 'INFO' | 'HIGH' | 'CRITICAL';
  messageTemplate: string;
  remediationHook: 'kick-resume';
}

// ── THE LEXICON MEMBERS ──

/** L-TRUNC-1 — THE DANGLING CONNECTIVE: the tail's final token is a
 *  connective/lead-in word with NO terminal punctuation after it — the
 *  sentence was building a continuation that never arrived. Order-2: the
 *  token must be (a) in the lexicon below, (b) the LAST whitespace token,
 *  (c) not followed by any terminal mark. The WORD CLASS (not a regex
 *  shape): coordinating/subordinating conjunctions, prepositions, relative
 *  pronouns, copulas, and the report-construction lead-ins — the words that
 *  grammatically REQUIRE a continuation. */
const DANGLING_CONNECTIVE_LEXICON: ReadonlySet<string> = new Set([
  // coordinating conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
  // subordinating conjunctions
  'if', 'when', 'while', 'because', 'since', 'although', 'though', 'unless',
  'until', 'whereas', 'after', 'before', 'once', 'than', 'that',
  // prepositions (the never-final class)
  'of', 'to', 'in', 'on', 'by', 'at', 'for', 'with', 'from', 'into', 'onto',
  'over', 'under', 'about', 'across', 'after', 'against', 'along', 'among',
  'around', 'before', 'behind', 'below', 'beneath', 'beside', 'between',
  'beyond', 'during', 'inside', 'near', 'outside', 'through', 'toward',
  'under', 'upon', 'within', 'without', 'via', 'per', 'as',
  // articles + relative/case tokens
  'the', 'a', 'an', 'which', 'who', 'whom', 'whose', 'what', 'where', 'how',
  'why', 'whether', 'this', 'these', 'those', 'each', 'every', 'either',
  'neither', 'both', 'all', 'any', 'some', 'such', 'no',
  // copulas + auxiliaries (a tail ending in these is mid-predicate)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'does', 'do', 'did', 'then', 'also', 'not', 'it', 'its', 'their',
]);

/** L-TRUNC-2 — THE UNCLOSED CODE FENCE: an odd count of fence markers — a
 *  block opened and never closed. Order-2: the COUNT parity, not a match. */
/** L-TRUNC-3 — THE UNCLOSED INLINE CODE: an odd trailing backtick run — the
 *  cut landed inside an inline-code span. Order-2: the parity of the FINAL
 *  line's trailing backticks + the span-never-closed judgment. */
/** L-TRUNC-4 — THE TRAILING STRUCTURE OPENER: the tail ends in an opening
 *  delimiter (paren/bracket/brace/colon-dash) — the structure was announced,
 *  never filled. Order-2: the delimiter class + nothing following it. */
/** L-TRUNC-5 — THE TRAILING MARKUP CELL: the tail's final non-empty line is a
 *  bare table row or a bare list marker — a row/marker with NO content cell
 *  after it. Order-2: the line shape (pipe-delimited but no closing pipe
 *  content, or a lone '- '/'* ' with EOL). */
const RETURN_INTEGRITY_LEXICON: readonly ReturnIntegrityPattern[] = [
  {
    id: 'L-TRUNC-1',
    kind: 'return-evidence',
    matcher: (ev) => {
      const t = ev.finalText.trimEnd();
      if (t.length === 0) return false;
      const lastLine = t.split('\n').slice(-1)[0] ?? '';
      const tokens = lastLine.trim().split(/\s+/).filter((w) => w.length > 0);
      const last = tokens[tokens.length - 1];
      if (!last) return false;
      // (a) the token IS a lexicon member (case-insensitive; strip a
      //     trailing comma/semicolon — "and," cut before the next word)
      const bare = last.replace(/[,;:]$/, '').toLowerCase();
      const inLexicon = DANGLING_CONNECTIVE_LEXICON.has(bare);
      // (b) NO terminal punctuation after it — a period/quote/bracket/etc
      //     after the token means the sentence CLOSED (no continuation due)
      const terminalAfter = /[.!?:;"'`)\]}>*_|]$/.test(last);
      // (c) the line is prose-shaped (not inside a code fence — the fence
      //     pattern owns fenced tails)
      const fenceCount = (t.match(/^```/gm) ?? []).length;
      const insideFence = fenceCount % 2 === 1;
      // (d) THE BARE-BULLET LEAD-IN (the "- Writer" shape): a list line whose
      //     content is a SINGLE capitalized token — the bullet announced an
      //     entity whose description never arrived. Order-2: the list-marker
      //     shape + single-token content + no terminal + capitalized label.
      const lineTrim = lastLine.trim();
      const bareBulletLeadIn = /^[-*+]\s+\S+$/.test(lineTrim) && !terminalAfter && /^[A-Z]/.test(lineTrim.replace(/^[-*+]\s+/, ''));
      return (inLexicon && !terminalAfter && !insideFence) || (bareBulletLeadIn && !insideFence);
    },
    triggerCondition: (ev) => ev.terminalStatus === 'complete',
    severity: 'CRITICAL',
    messageTemplate: 'the return ends on the connective "{tailToken}" — the sentence was cut before its continuation',
    remediationHook: 'kick-resume',
  },
  {
    id: 'L-TRUNC-2',
    kind: 'return-evidence',
    matcher: (ev) => {
      const t = ev.finalText.trimEnd();
      const fences = (t.match(/^```/gm) ?? []).length;
      return fences % 2 === 1;
    },
    triggerCondition: (ev) => ev.terminalStatus === 'complete',
    severity: 'CRITICAL',
    messageTemplate: 'the return ends inside an unclosed code fence ({fenceCount} markers — odd parity)',
    remediationHook: 'kick-resume',
  },
  {
    id: 'L-TRUNC-3',
    kind: 'return-evidence',
    matcher: (ev) => {
      const t = ev.finalText.trimEnd();
      if (t.length === 0) return false;
      const lastLine = t.split('\n').slice(-1)[0] ?? '';
      // the trailing backtick run is ODD and the line did not OPEN with that
      // run (an opening backtick with content after = a span that continues;
      // an odd run with nothing after = a span cut open)
      // SHAPE A — the trailing backtick run is ODD and content precedes it
      // (a span opened, content, another open — cut):
      const m = lastLine.match(/`+$/);
      if (m) {
        const runLen = m[0].length;
        const beforeRun = lastLine.slice(0, lastLine.length - runLen);
        if (runLen % 2 === 1 && beforeRun.trim().length > 0) return true;
      }
      // SHAPE B — THE OPEN SPAN NEVER CLOSED (the live incident's
      // "- Writer: `report" — an odd backtick count in the line with NO
      // closing run at EOL: the span's content IS the tail, closer never came).
      const ticks = (lastLine.match(/`/g) ?? []).length;
      if (ticks > 0 && ticks % 2 === 1 && !(m && m[0].length === ticks)) return true;
      return false;
    },
    triggerCondition: (ev) => ev.terminalStatus === 'complete',
    severity: 'CRITICAL',
    messageTemplate: 'the return ends inside an unclosed inline-code span',
    remediationHook: 'kick-resume',
  },
  {
    id: 'L-TRUNC-4',
    kind: 'return-evidence',
    matcher: (ev) => {
      const t = ev.finalText.trimEnd();
      if (t.length === 0) return false;
      // (a) the very tail char is an opening delimiter — nothing after it
      const openerTail = /[([{:]$/.test(t) || /[-*+]\s*$/.test(t);
      if (!openerTail) return false;
      // (b) not inside a fence (the fence pattern owns fenced tails)
      const fences = (t.match(/^```/gm) ?? []).length;
      return fences % 2 === 0;
    },
    triggerCondition: (ev) => ev.terminalStatus === 'complete',
    severity: 'HIGH',
    messageTemplate: 'the return ends on a structure opener — the announced structure was never filled',
    remediationHook: 'kick-resume',
  },
  {
    id: 'L-TRUNC-5',
    kind: 'return-evidence',
    matcher: (ev) => {
      const t = ev.finalText.trimEnd();
      if (t.length === 0) return false;
      const lastLine = t.split('\n').slice(-1)[0] ?? '';
      // a bare table row: starts with |, has cells, but ENDS without the
      // closing | (the row was cut mid-cell) — or a lone list marker at EOL
      const bareTableRow = lastLine.trimStart().startsWith('|') && /\|[^|]*$/.test(lastLine.trim()) && !lastLine.trim().endsWith('|');
      const bareListMarker = /^\s*[-*+]\s*$/.test(lastLine);
      return bareTableRow || bareListMarker;
    },
    triggerCondition: (ev) => ev.terminalStatus === 'complete',
    severity: 'HIGH',
    messageTemplate: 'the return ends on a bare table row / list marker — the cell was cut before its content',
    remediationHook: 'kick-resume',
  },
];

// ── THE STATE MACHINE (the DECISION layer — IDLE→EVIDENCED→CLASSIFIED→EMITTED;
// the fail-state is INTEGRITY_UNKNOWN, never PASS-by-default) ──
type IntegrityState = 'IDLE' | 'EVIDENCED' | 'CLASSIFIED' | 'EMITTED' | 'INTEGRITY_UNKNOWN';

/** The public classification — the evidence triad rides in the result (the
 *  pattern ids + the instantiated messages = the finding anchors). */
export interface ReturnIntegrityVerdict {
  truncated: boolean;
  signals: string[];
  /** The per-match triads: {pattern, state, evidence: the tail excerpt}. */
  triads: Array<{ pattern: string; state: IntegrityState; evidence: string }>;
}

export function classifyReturnIntegrity(ev: ReturnEvidence): ReturnIntegrityVerdict {
  let state: IntegrityState = 'IDLE';
  if (typeof ev.finalText !== 'string' || ev.finalText.length === 0 || ev.terminalStatus !== 'complete') {
    // the gate: no text or not terminal → UNKNOWN, never PASS-by-default
    return { truncated: false, signals: [], triads: [{ pattern: 'none', state: 'INTEGRITY_UNKNOWN', evidence: 'not a terminal return — the integrity judgment does not apply' }] };
  }
  state = 'EVIDENCED';
  const signals: string[] = [];
  const triads: ReturnIntegrityVerdict['triads'] = [];
  for (const p of RETURN_INTEGRITY_LEXICON) {
    state = 'CLASSIFIED';
    let hit = false;
    try { hit = p.triggerCondition(ev) && p.matcher(ev); } catch { hit = false; }
    if (hit) {
      const tailExcerpt = ev.finalText.trimEnd().slice(-80);
      const msg = p.messageTemplate.replace('{tailToken}', tailExcerpt.split(/\s+/).slice(-1)[0] ?? '').replace('{fenceCount}', String((ev.finalText.match(/^```/gm) ?? []).length));
      signals.push(p.id + ': ' + msg);
      triads.push({ pattern: p.id, state, evidence: tailExcerpt });
    }
  }
  state = 'EMITTED';
  return { truncated: signals.length > 0, signals, triads };
}

// THE COMPAT SHIM (the callers + the tests use the old signature): the
// two-field return derived from the full verdict.
export function detectReturnTruncation(text: string): { truncated: boolean; signals: string[] } {
  const verdict = classifyReturnIntegrity({ finalText: text, terminalStatus: 'complete' });
  return { truncated: verdict.truncated, signals: verdict.signals.map((s) => s.split(':')[0]) };
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
  /** THE RETURN-INTEGRITY FLAG (the truncated-return incident): complete =
   *  TERMINATED, not whole — true = the final text part carries a cut
   *  signature; the agent needs a KICK (action=resume), never a harvest. */
  returnTruncated?: boolean;
  truncationSignals?: string[];
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
    // THE RETURN-INTEGRITY LAYER: the same detector the wave-read tool runs —
    // on a terminal status, the final text part's tail is scanned; a cut
    // signature flags the return incomplete.
    let returnTruncated: boolean | undefined;
    let truncationSignals: string[] | undefined;
    if (rawStatus === 'complete' && page.ok) {
      let finalText = '';
      for (let i = page.parts.length - 1; i >= 0; i--) {
        const p = page.parts[i] as { type?: string; text?: string };
        if (p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
          finalText = p.text;
          break;
        }
      }
      if (finalText.length > 0) {
        const det = detectReturnTruncation(finalText);
        returnTruncated = det.truncated;
        truncationSignals = det.signals;
      }
    }
    const sessionReport: WaveSessionStatusReport = {
      ok: page.ok,
      error: page.error,
      wave: args.sessionId,
      sessionId: args.sessionId,
      status: rawStatus,
      live,
      returnTruncated,
      truncationSignals,
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
