/**
 * THE SHADOW CAPTURE (2026-08-26 — the operator's mandate: "FULL DATA CAPTURE
 * WIRED SO WE CAN SEE EVERY SINGLE SHADOW AGENTS ENTIRE SESSION LOG IN
 * SEPARATE .MD FILES I WANT TO SEE VERY CLEARLY THE SAME DETAIL LIKE I WOULD
 * IF I /export AN OPENCODE TUI SESSION. EVERYTHING VISIBLE").
 *
 * Pure observation — ZERO behavior change. Every write is try/catch'd: a
 * capture failure can NEVER break a generation. No-op without a key (tests,
 * solo callers, injected generators).
 *
 * THE FILE: /tmp/trident-shadow-captures/<waveId>/<agentName>-capture.md
 * TWO layers, like a /export + a flight recorder:
 *   1. THE TIMELINE — a compact chronological table (every chain call, round,
 *      tool call, dispatch — one row each, ms-precision) for timing forensics.
 *   2. THE TRANSCRIPT — full-detail sections: the system prompt, every round
 *      prompt verbatim, every LLM call's assembled reasoning + text + tool
 *      calls with FULL arguments, every tool result with FULL content, and the
 *      RAW done-message JSON (the authoritative record — nothing summarized
 *      away, no truncation).
 *
 * Concurrency: keyed by the per-agent capture key (waveId + '-' + name) —
 * single-writer per file, Map lookups synchronous, safe under the 15-pool.
 * Re-begin (the retry pass re-running an agent) APPENDS a re-begin separator
 * and keeps the prior attempt's rows — the first attempt's forensics are never
 * destroyed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** THE CAPTURE ROOT — env-overridable (TRIDENT_SHADOW_CAPTURE_DIR) so tests
 *  sandbox their files; production defaults to /tmp/trident-shadow-captures.
 *  Read at CALL TIME (not import time) so test env setup ordering is free. */
export function captureDir(): string {
  return process.env.TRIDENT_SHADOW_CAPTURE_DIR ?? '/tmp/trident-shadow-captures';
}

interface CapState {
  file: string;
  t0: number;
  seq: number;
}

const active = new Map<string, CapState>();

function escCell(v: string): string {
  return redactControls(v.replace(/\|/g, '\\|').replace(/\r?\n/g, '⏎'));
}

/** THE CONTROL-CHAR REDACTION (2026-08-26 — the live capture carried 6,683
 *  NUL-contaminated lines from a PNG read result and grep flagged the file
 *  binary): every C0 control except \n\r\t is escaped to \\uXXXX — the
 *  capture stays a readable text .md, always. */
function redactControls(v: string): string {
  return v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function fmtData(data: unknown): string {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return escCell(String(s ?? '').slice(0, 2000));
  } catch {
    return 'CAPTURE_SERIALIZE_FAIL';
  }
}

/** Open (or re-open, appending) the per-agent capture file. */
export function beginCapture(key: string, waveId: string, agentName: string): string {
  try {
    const dir = path.join(captureDir(), waveId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, (agentName || 'agent').replace(/[^A-Za-z0-9_-]/g, '-') + '-capture.md');
    const t0 = Date.now();
    if (fs.existsSync(file)) {
      // THE RETRY PASS — append a separator; the first attempt's rows survive.
      fs.appendFileSync(file, '\n\n---\n\n## RE-BEGIN (retry pass) — ' + new Date(t0).toISOString() + '\n\n', 'utf-8');
    } else {
      fs.writeFileSync(
        file,
        '# SHADOW CAPTURE — ' + waveId + ' / ' + agentName + '\n\n' +
        '- started: ' + new Date(t0).toISOString() + '\n' +
        '- captureKey: `' + key + '`\n' +
        '- THE TIMELINE (below): one compact row per event — chain LLM calls (rung/attempt/duration/events), rounds, tools, the dispatch columns.\n' +
        '- THE TRANSCRIPT (below the timeline): full /export-level detail — system prompt, round prompts verbatim, every LLM call\'s reasoning + text + tool calls with FULL args, every tool result with FULL content, the raw done-message JSON per call.\n\n' +
        '## TIMELINE\n\n' +
        '| # | wallclock | +ms | stage | data |\n' +
        '|---|---|---|---|---|\n',
        'utf-8',
      );
    }
    active.set(key, { file, t0, seq: 0 });
    return file;
  } catch {
    return '';
  }
}

/** Append one TIMELINE row (compact — the timing forensics). */
export function captureEvent(key: string, stage: string, data: unknown): void {
  const st = active.get(key);
  if (!st) return;
  try {
    const now = Date.now();
    st.seq++;
    fs.appendFileSync(
      st.file,
      '| ' + st.seq + ' | ' + new Date(now).toISOString().slice(11, 23) + ' | +' + (now - st.t0) + 'ms | ' + stage + ' | ' + fmtData(data) + ' |\n',
      'utf-8',
    );
  } catch {
    /* never break the generation */
  }
}

/** Append one TRANSCRIPT section — FULL detail, no truncation. Body is
 *  written verbatim inside a fenced block under a timestamped heading. */
export function captureSection(key: string, title: string, body: string, fence?: string): void {
  const st = active.get(key);
  if (!st) return;
  try {
    const now = Date.now();
    const f = fence ?? '';
    fs.appendFileSync(
      st.file,
      '\n### [' + new Date(now).toISOString().slice(11, 23) + ' +' + (now - st.t0) + 'ms] ' + title + '\n\n' +
      (f ? '```' + f + '\n' : '') + redactControls(body) + (f ? '\n```' : '') + '\n',
      'utf-8',
    );
  } catch {
    /* never break the generation */
  }
}

/** The final row + the key release. */
export function endCapture(key: string, stage: string, data: unknown): void {
  captureEvent(key, stage, data);
  active.delete(key);
}

// ── THE DELTA ASSEMBLER (best-effort readable layer over the raw stream
//    events; the raw done-message JSON in the transcript is authoritative —
//    unknown event shapes degrade to the raw JSON, never to silence). ──

/** One LLM call's assembled readable parts, built from the event buffer. */
export interface AssembledCall {
  reasoning: string;
  text: string;
  toolCalls: Array<{ id?: string; name?: string; args: string }>;
  eventCount: number;
  errorText: string | null;
}

function fragment(ev: unknown): string {
  const e = ev as Record<string, unknown>;
  for (const k of ['delta', 'content', 'text', 'thinking', 'args', 'arguments', 'input', 'data']) {
    if (typeof e[k] === 'string') return e[k] as string;
  }
  return '';
}

export function assembleCall(events: unknown[]): AssembledCall {
  const out: AssembledCall = { reasoning: '', text: '', toolCalls: [], eventCount: events.length, errorText: null };
  let curTool: { id?: string; name?: string; args: string } | null = null;
  let mode: 'none' | 'thinking' | 'text' | 'tool' = 'none';
  for (const ev of events) {
    const e = (ev ?? {}) as Record<string, unknown>;
    const t = String(e.type ?? '');
    if (t === 'thinking_delta' || t === 'reasoning_delta') { mode = 'thinking'; out.reasoning += fragment(e); continue; }
    if (t === 'text_delta') { mode = 'text'; out.text += fragment(e); continue; }
    if (t === 'toolcall_start' || t === 'tool_call_start') {
      curTool = { id: typeof e.toolCallId === 'string' ? e.toolCallId : (typeof e.id === 'string' ? e.id : undefined), name: typeof e.toolName === 'string' ? e.toolName : (typeof e.name === 'string' ? e.name : undefined), args: '' };
      out.toolCalls.push(curTool); mode = 'tool'; continue;
    }
    if (t === 'toolcall_delta' || t === 'tool_call_delta') { if (curTool) curTool.args += fragment(e); continue; }
    if (t === 'error') {
      const err = e.error as Record<string, unknown> | undefined;
      out.errorText = typeof err?.errorMessage === 'string' ? err.errorMessage : JSON.stringify(e).slice(0, 500);
      continue;
    }
    // toolcall_end / *_end / start / done: no fragment to accumulate
  }
  return out;
}

/** Render the assembled call as a readable transcript block (called at the
 *  chain's OK/FAIL points with the buffered events). */
export function writeCallTranscript(key: string, header: string, events: unknown[], doneMessage: unknown): void {
  const a = assembleCall(events);
  const parts: string[] = [];
  parts.push('**' + header + '** — ' + a.eventCount + ' stream events');
  if (a.errorText) parts.push('\n**ERROR:** ' + a.errorText);
  if (a.reasoning.trim().length > 0) {
    parts.push('\n**REASONING (assembled from thinking deltas):**\n\n' + a.reasoning);
  }
  if (a.text.trim().length > 0) {
    parts.push('\n**TEXT (assembled):**\n\n' + a.text);
  }
  if (a.toolCalls.length > 0) {
    parts.push('\n**TOOL CALLS (assembled):**');
    for (const tc of a.toolCalls) {
      parts.push('\n- `' + (tc.name ?? 'tool') + '`' + (tc.id ? ' (' + tc.id + ')' : '') + ' args:\n\n```json\n' + tc.args + '\n```');
    }
  }
  parts.push('\n**RAW DONE-MESSAGE (authoritative, full JSON):**\n\n```json\n' + safeJson(doneMessage) + '\n```');
  captureSection(key, 'LLM CALL', parts.join('\n'), '');
}

function safeJson(v: unknown): string {
  try {
    return redactControls(JSON.stringify(v, null, 2) ?? String(v));
  } catch {
    return 'CAPTURE_JSON_FAIL: ' + redactControls(String(v).slice(0, 2000));
  }
}

/** Public safe-JSON for the tee sites (tool results, args). */
export function captureJson(v: unknown): string {
  return safeJson(v);
}
