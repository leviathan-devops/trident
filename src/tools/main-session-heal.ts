// src/tools/main-session-heal.ts — the DROPPED-GENERATION detector + the
// MINIMAL KICK (2026-08-13 — the operator's design, verbatim rulings):
//
//   THE SIGNAL: the main agent's generation can DROP mid-sentence — the
//   provider cuts the stream, the runtime FINALIZES the partial message (the
//   ▣ timestamp renders — "Trident · DeepSeek V4 Flash (2x usage) · 20.3s"),
//   and the agent goes IDLE with the work stuck. The detector: the LAST
//   assistant text is OBVIOUSLY incomplete (the incompletion lexicon) AND the
//   message is FINALIZED (no pending step-start/reasoning — the agent is
//   idle, NOT processing). That discriminator kills the slow-vs-frozen
//   ambiguity: a slow HEALTHY generation has a pending step-start (in flight —
//   never kicked); a DROPPED generation is finalized + incomplete.
//
//   THE KICK (the operator: "just needs a simple 'continue' or even ' ' empty
//   space enter kick to reactivate it"): a minimal 'continue' chat message via
//   the TUI input (appendPrompt + submitPrompt — the same channel the human
//   typing in the TUI uses). NO interrupt path, NO model switch, NO re-issue
//   framing (the operator's rulings 2026-08-13 — removed entirely).
//
//   THE ISE LAW: the incompletion lexicon is the mechanical DETECTOR only (the
//   regexes flag CANDIDATES); the DECISION is the state machine
//   (READ → PARSED → ANALYZED → CLASSIFIED → EVIDENCED → EMITTED; the
//   fail-state = not-dropped, never a false kick) + the cooldown.

import { readSessionStream } from './wave-status.ts';
import { tridentLog } from '../utils.js';

// ═══ THE INCOMPLETION LEXICON — the mechanical DETECTOR (the ISE law: the
// regexes flag CANDIDATES only; the state machine decides — the lexicon is
// the detection layer, never the decision layer). ═══
const TRAILING_ELLIPSIS = /(?:\.\.\.|\u2026)\s*$/;                          // the operator's example — the sentence cut + "..." or "…"
const DANGLING_CONNECTIVE = /\b(the|and|or|but|because|of|to|with|for|on|at|from|by|a|an|is|are|was|were|that|which|this|these|if|then|so|as|in|it|its|their|his|her|our|your|we|they|he|she|not|no|yes)\s*$/i;  // a dangling connective — the sentence never landed
const UNCLOSED_FENCE = /```[^`]*$/;                                        // an unclosed code fence
const UNBALANCED_OPEN = (t: string): boolean => {
  const open = (t.match(/\(/g) || []).length + (t.match(/\[/g) || []).length;
  const close = (t.match(/\)/g) || []).length + (t.match(/\]/g) || []).length;
  return open > close;
};
// A COMPLETE message's tail ends with one of these (the terminal set — the
// deliberate colon/semicolon endings are NOT incompletions):
const TERMINALS = /[.!?"')\]}>`:;]/;

// ═══ THE DETECTION (the pure state machine — the stream reader injectable for
// the tests; the production uses the real readSessionStream). ═══
export interface HealStreamReader {
  (sessionId: string, opts?: { limit?: number; beforeId?: string }): ReturnType<typeof readSessionStream>;
}

export interface HealDetection {
  dropped: boolean;                  // the dropped-generation signature
  reason: string | null;             // 'in-flight' | 'complete' | 'trailing-ellipsis' | 'mid-sentence-cut' | 'dangling-connective' | 'unclosed-code-fence' | 'unbalanced-brackets' | 'no-text' | null (fail-safe)
  tail: string;                      // the EVIDENCE — the last 120 chars of the analyzed text
  newestPartType: string | null;     // the EVIDENCE — the stream's newest part type (the finalized signal)
}

export function detectDroppedMainGeneration(
  sessionId: string,
  opts: { stream?: HealStreamReader } = {},
): HealDetection {
  const reader = opts.stream ?? readSessionStream;
  try {
    // ── READ — the session's part stream (the newest 25 parts) ──
    const page = reader(sessionId, { limit: 25 });
    if (!page.ok || page.parts.length === 0) {
      return { dropped: false, reason: null, tail: '', newestPartType: null };
    }
    const newest = page.parts[page.parts.length - 1];
    // ── ANALYZED — THE FINALIZED CHECK (the state machine's discriminator) ──
    // A generation IN FLIGHT = a pending step-start/reasoning/tool at the top
    // of the stream — the agent is PROCESSING (a slow healthy generation is
    // NEVER kicked). A FINALIZED message = the newest part is a text or the
    // step-finish — the runtime completed the partial (the ▣ timestamp
    // rendered) and the agent is IDLE — the dropped signature is possible.
    if (newest.type !== 'text' && newest.type !== 'step-finish') {
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
    const tail = lastText.trimEnd();
    const tailSnippet = tail.length > 120 ? tail.slice(-120) : tail;
    // ── CLASSIFIED — THE INCOMPLETION LEXICON (the mechanical DETECTOR) ──
    let reason: string | null = null;
    if (TRAILING_ELLIPSIS.test(tail)) reason = 'trailing-ellipsis';
    else if (UNCLOSED_FENCE.test(tail)) reason = 'unclosed-code-fence';
    else if (UNBALANCED_OPEN(tail)) reason = 'unbalanced-brackets';
    else if (!TERMINALS.test(tail.slice(-1))) {
      reason = DANGLING_CONNECTIVE.test(tail) ? 'dangling-connective' : 'mid-sentence-cut';
    }
    if (!reason) {
      return { dropped: false, reason: 'complete', tail: '', newestPartType: newest.type };
    }
    // ── EVIDENCED + EMITTED ──
    return { dropped: true, reason, tail: tailSnippet, newestPartType: newest.type };
  } catch (e) {
    // THE FAIL-SAFE — a detection failure NEVER kicks (the false-kick is the
    // derailment fuel the operator flagged):
    tridentLog('WARN', 'main-session-heal', 'the dropped-generation detection failed (fail-safe — no kick): ' + (e instanceof Error ? e.message : String(e)));
    return { dropped: false, reason: null, tail: '', newestPartType: null };
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
