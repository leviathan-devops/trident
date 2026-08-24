// src/tools/main-session-heal.ts — the DROPPED-GENERATION detector + the
// MINIMAL KICK (2026-08-13 the operator's design; 2026-08-16 the operator's
// override — the SHADOW-MODEL BINARY DECISION):
//
//   THE SIGNAL: the main agent's generation can DROP mid-sentence — the
//   provider cuts the stream, the runtime FINALIZES the partial message (the
//   ▣ timestamp renders), and the agent goes IDLE with the work stuck.
//
//   THE OPERATOR'S OVERRIDE (verbatim — 2026-08-16): "why is this not
//   literally ready the most recent 5 lines of prose and making an intelligent
//   shadow model based decision on if this is failing mid generation or
//   completed text this should be very fucking easy and simple binary yes/no
//   classifier w/ basic model intelligence" — THE REGEX LADDER IS DEAD. The
//   incompletion lexicon (the trailing-ellipsis / dangling-connective /
//   unclosed-fence / unbalanced-bracket regexes) is SLOP — a mechanical
//   DETECTOR tower making DECISIONS. The decision is now the SHADOW MODEL's
//   binary judgment: the last 5 lines of prose → "dropped" (yes/no) via the
//   model's intelligence. THE ISE LAW: the regex is the mechanical DETECTOR
//   ONLY (the FINALIZED pre-check — the state machine's discriminator); the
//   DECISION layer is the model classifier.
//
//   THE KICK (the operator: "just needs a simple 'continue' or even ' ' empty
//   space enter kick to reactivate it"): a minimal 'continue' chat message via
//   the TUI input (appendPrompt + submitPrompt). NO interrupt path, NO model
//   switch.

import { readSessionStream } from './wave-status.ts';
import { tridentLog } from '../utils.js';
import { callShadow } from './shadow/shadow-brain.ts';

// ═══ THE CLASSIFIER PROMPT — the model's binary judgment on the prose tail. ═══
// The last ~5 lines of the agent's text → "is this a DROPPED generation
// (cut mid-stream by the provider) or COMPLETE text (a finished message)?"
// The model answers with ONE word: dropped / complete. The output contract is
// BINARY — the model's intelligence decides, never a regex.
const DROPPED_CLASSIFIER_SYSTEM =
  'You are the dropped-generation classifier for the Trident self-heal. ' +
  'You receive the LAST FEW LINES of an agent\'s message text. ' +
  'Decide: was this message CUT MID-GENERATION (the provider dropped the ' +
  'stream — the text ends abruptly, mid-sentence, mid-code, or mid-thought, ' +
  'with no natural completion) or is it COMPLETE (a finished message)? ' +
  'Reply with EXACTLY ONE WORD: "dropped" or "complete". ' +
  'No explanation. No punctuation beyond the word. ' +
  'A message that ends a natural paragraph, report, or answer is COMPLETE — ' +
  'even if it has no trailing period. A message that stops mid-sentence, ' +
  'mid-code-fence, mid-list, or mid-word is DROPPED.';

export interface HealStreamReader {
  (sessionId: string, opts?: { limit?: number; beforeId?: string }): ReturnType<typeof readSessionStream>;
}

export interface HealDetection {
  dropped: boolean;                  // the model's binary decision (or the fail-safe false)
  reason: string | null;             // 'in-flight' | 'model-dropped' | 'model-complete' | 'no-text' | null (fail-safe)
  tail: string;                      // the EVIDENCE — the last ~5 lines analyzed
  newestPartType: string | null;     // the EVIDENCE — the stream's newest part type
}

// THE MODEL JUDGE — injectable for the tests (the production uses callShadow;
// the test injects a fake judge to avoid the network):
export type DroppedJudge = (tail: string) => Promise<{ dropped: boolean }>;

const defaultJudge: DroppedJudge = async (tail: string) => {
  try {
    const r = await callShadow(
      'The last lines of an agent message:\n\n"""\n' + tail + '\n"""\n\nIs this dropped mid-generation or complete? Answer with exactly one word: dropped or complete.',
      DROPPED_CLASSIFIER_SYSTEM,
      8,
      { retryBackoffMs: 1 },
    );
    if (!r.ok || r.content.length === 0) {
      tridentLog('WARN', 'main-session-heal', 'the dropped-classifier call failed (fail-safe — no kick): ' + (r.error ?? 'empty'));
      return { dropped: false };
    }
    const answer = r.content.trim().toLowerCase();
    return { dropped: answer.startsWith('dropped') };
  } catch (e) {
    tridentLog('WARN', 'main-session-heal', 'the dropped-classifier threw (fail-safe — no kick): ' + (e instanceof Error ? e.message : String(e)));
    return { dropped: false };
  }
};

export function detectDroppedMainGeneration(
  sessionId: string,
  opts: { stream?: HealStreamReader; judge?: DroppedJudge } = {},
): HealDetection {
  const reader = opts.stream ?? readSessionStream;
  const judge = opts.judge ?? defaultJudge;
  // ── THE PURE-ASYNC PROBLEM: the detect is called from the cron's tick;
  // the model call is async. THE FIX: the detect returns the SYNC part (the
  // finalized pre-check) + the model decision is made by the CALLER via a new
  // async function (the cron awaits it). The legacy sync signature stays for
  // the pre-check (the dropped:false fast-path when in-flight/no-text) — the
  // model decision only runs when the message is FINALIZED.
  void sessionId; void judge;
  try {
    // ── READ — the session's part stream (the newest 25 parts) ──
    const page = reader(sessionId, { limit: 25 });
    if (!page.ok || page.parts.length === 0) {
      return { dropped: false, reason: null, tail: '', newestPartType: null };
    }
    const newest = page.parts[page.parts.length - 1];
    // ── ANALYZED — THE FINALIZED CHECK (the state machine's discriminator) ──
    // A message is FINALIZED ONLY when it carries the COMPLETION signal — a
    // 'step-finish' part OR a text part with the time.end present. A STREAMING
    // text part (no time.end, no step-finish yet) is a LIVE generation — the
    // agent is PROCESSING — NEVER kicked.
    const newestCompleted = newest.type === 'step-finish' || (newest.type === 'text' && newest.completed === true);
    if (!newestCompleted) {
      return { dropped: false, reason: 'in-flight', tail: '', newestPartType: newest.type };
    }
    // ── PARSED — the LAST assistant text part (the message content) ──
    let lastText = '';
    for (let i = page.parts.length - 1; i >= 0; i--) {
      if (page.parts[i].type === 'text' && typeof page.parts[i].text === 'string' && page.parts[i].text!.trim().length > 0) {
        lastText = page.parts[i].text!;
        break;
      }
    }
    if (lastText.length === 0) {
      return { dropped: false, reason: 'no-text', tail: '', newestPartType: newest.type };
    }
    // ── THE TAIL — the last ~5 lines of prose (the operator's spec) ──
    const lines = lastText.trimEnd().split('\n');
    const tail = lines.slice(-5).join('\n');
    const tailSnippet = tail.length > 600 ? tail.slice(-600) : tail;
    // ── THE MODEL DECISION (the operator's override) — the binary classifier.
    // The SYNC detect cannot await the model; the caller (the cron) calls the
    // async classifyDroppedTail AFTER this pre-check. The pre-check returns
    // the tail + reason 'pending-model' so the cron knows to run the judge.
    return { dropped: false, reason: 'pending-model', tail: tailSnippet, newestPartType: newest.type };
  } catch (e) {
    // THE FAIL-SAFE — a detection failure NEVER kicks:
    tridentLog('WARN', 'main-session-heal', 'the dropped-generation pre-check failed (fail-safe — no kick): ' + (e instanceof Error ? e.message : String(e)));
    return { dropped: false, reason: null, tail: '', newestPartType: null };
  }
}

// ═══ THE MODEL-BASED BINARY DECISION (the operator's override) — the async
// classifier the cron awaits: the pre-check passed (the message finalized +
// the tail extracted) → the model judges "dropped" or "complete". ═══
export async function classifyDroppedTail(
  sessionId: string,
  opts: { stream?: HealStreamReader; judge?: DroppedJudge } = {},
): Promise<HealDetection> {
  const pre = detectDroppedMainGeneration(sessionId, opts);
  if (pre.reason !== 'pending-model') return pre;   // in-flight / no-text / fail-safe — no model call
  const judge = opts.judge ?? defaultJudge;
  try {
    const decision = await judge(pre.tail);
    return {
      dropped: decision.dropped,
      reason: decision.dropped ? 'model-dropped' : 'model-complete',
      tail: pre.tail,
      newestPartType: pre.newestPartType,
    };
  } catch (e) {
    // THE FAIL-SAFE — a throwing judge NEVER kicks (the false-kick is the
    // derailment fuel):
    tridentLog('WARN', 'main-session-heal', 'the dropped-classifier judge threw (fail-safe — no kick): ' + (e instanceof Error ? e.message : String(e)));
    return { dropped: false, reason: null, tail: pre.tail, newestPartType: pre.newestPartType };
  }
}

// ═══ THE KICK — the minimal chat message (the operator: "literally just ' '
// or 'continue' just a chat message sent to kick it"). ═══
export interface HealClient {
  tui: {
    appendPrompt(opts: { body: { text: string } }): Promise<{ data?: unknown }>;
    submitPrompt(opts: Record<string, unknown>): Promise<{ data?: unknown }>;
  };
}

export interface KickResult { kicked: boolean; error?: string; }

// THE COOLDOWN (2026-08-13 — the anti-kick-storm guard): at most ONE kick per
// session per cooldown (10m — the cron interval). A repeated detection on the
// SAME stuck message re-kicks after the cooldown (a bounded retry — "this
// happens sometimes"), never a kick-per-tick storm.
export const KICK_COOLDOWN_MS = 10 * 60_000;
const lastKickAt: Record<string, number> = {};

export async function kickMainSession(client: HealClient, sessionId: string): Promise<KickResult> {
  const last = lastKickAt[sessionId] ?? 0;
  if (Date.now() - last < KICK_COOLDOWN_MS) {
    return { kicked: false, error: 'cooldown' };
  }
  try {
    await client.tui.appendPrompt({ body: { text: 'continue' } });
    await client.tui.submitPrompt({});
    lastKickAt[sessionId] = Date.now();
    tridentLog('INFO', 'main-session-heal', 'KICK: the dropped main generation in ' + sessionId + ' — the minimal "continue" sent (the agent reactivates)');
    return { kicked: true };
  } catch (e) {
    tridentLog('WARN', 'main-session-heal', 'the kick failed for ' + sessionId + ': ' + (e instanceof Error ? e.message : String(e)));
    return { kicked: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// THE TEST SEAM (the tests reset the cooldown state):
export function __resetHealState(): void {
  for (const k of Object.keys(lastKickAt)) delete lastKickAt[k];
}
