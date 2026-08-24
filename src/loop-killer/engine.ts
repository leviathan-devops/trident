// src/loop-killer/engine.ts — THE DEGENERACY-LOOP KILLER — THE ENGINE
// (2026-08-16 — the ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL stack. The bible §1:
// "the ENGINE = the individual workers (the one doing the real work)" — the
// ENGINE COMPUTES EVERY DECISION FROM THE DATA: the hash of the input, the
// identical re-fire count within the window, the escalation rung. The engine
// NEVER fires the kick, NEVER owns the counters, NEVER holds session state —
// it is the PURE decision layer.
//
// THE HARDCODE BAN (the audit's law): every value is computed from the data,
// never fitted to a test oracle. The rung thresholds live in config.ts (the
// named calibration); the hash is a sha256 of the input; the count is
// accumulated by the ACTOR within the config's window; the decision maps the
// count against the config's bands. A hardcoded number in a call site is a
// violation — the config owns them ALL.
//
// THE ENGINE'S SURFACE (the three pure functions the adapter + the tests
// drive):
//   1. hashInput(text)                    — the sha256 identity of the input.
//   2. classifyDispatchInput(text)        — the EXISTING T.E.B. classifier
//      (src/firewalls/dispatch-input-lexicon.ts — the firewalls' intent
//      taxonomy: PATH / PROMPT / MIXED). The engine REUSES it — a private
//      classifier tower would be a doctrine violation in this codebase's own
//      terms (the "regex-as-detector + machine-as-decision" rule).
//   3. countIdenticalReFires(actor, key, now)
//                                        — the per-key count for THIS input
//      within the window (the actor's increment owns the expiry reset).
//   4. decideEscalation(count)            — maps the count to the ladder rung:
//      the PASS / WARNING / ESCALATE / BLOCK + the kick flag.
//
// THE TYPED BOUNDARIES (the acceptance vector):
//   the engine never fires the kick (the kick module owns the side effect),
//   the engine never owns state (the actor owns the counters),
//   the engine never writes the session (the adapter owns the wiring).
//
// THE ERROR PATHS (FIRST): a malformed input is classified NON-READ/PASS (the
// honest no-risk default), never a fabricated block. The hash of a
// non-string is the hash of its string form — never a crash. The count of a
// missing key is 0 (the honest IDLE), never a fitted number.

import { createHash } from 'node:crypto';
import { classifyDispatchInput as classifyDispatchInputTEB } from '../firewalls/dispatch-input-lexicon.ts';
import {
  RUNG_1_PASS, RUNG_2_WARNING, RUNG_3_ESCALATE, RUNG_4_BLOCK,
} from './config.ts';
import type { LoopActor } from './actor.ts';

// ── THE HASH — the input's identity ──────────────────────────────────
/**
 * The sha256 hash of the dispatch input — the key the actor's counters are
 * indexed by. Two inputs that hash the same ARE the same fire; a mutated
 * path or a changed prompt is a DIFFERENT key (a fresh ladder). The hash is
 * computed from the DATA — never a counter, never a fitted id.
 */
export function hashInput(text: string): string {
  const t = typeof text === 'string' ? text : String(text ?? '');
  return createHash('sha256').update(t).digest('hex');
}

// ── THE INPUT CLASSIFIER (the T.E.B. taxonomy — REUSED, never re-built) ──
/**
 * Classifies the dispatch input via the EXISTING T.E.B. classifier
 * (src/firewalls/dispatch-input-lexicon.ts — the firewalls' intent taxonomy:
 * PATH / PROMPT / MIXED). The engine delegates — a private re-implementation
 * of the classifier would split the taxonomy into two drifting truths. The
 * classification feeds the degeneracy decision: a PROMPT-class input that
 * keeps re-firing is a degeneracy loop; a PATH that re-fires is the wave's
 * own dispatch retry — the classifier's verdict is the DATA the engine reads.
 */
export function classifyDispatchInput(text: string): {
  cls: 'PATH' | 'PROMPT' | 'MIXED';
  action: 'ALLOW' | 'BLOCK';
  message: string;
} {
  return classifyDispatchInputTEB(typeof text === 'string' ? text : '');
}

// ── THE RE-FIRE COUNT (the actor's windowed accumulation) ────────────
/**
 * Counts the identical re-fires for the key WITHIN the config's window.
 * The identity is the hashed input; the count is per-window — the actor's
 * increment handles the EXPIRY reset (an old fire past the window resets
 * BEFORE it increments, so a fresh window starts at count 1). This function
 * returns the CURRENT count for the key — 0 when the key has never fired
 * (the honest IDLE). The count is DATA, never a fitted oracle.
 */
export function countIdenticalReFires(
  actor: LoopActor,
  key: string,
  now?: number,
): number {
  const c = actor.getCounter(key);
  return c ? c.count : 0;
}

// ── THE ESCALATION DECISION (the count → the rung map) ───────────────
/** The engine's ladder verdict — the rung the adapter acts on. */
export type EscalationRung =
  | 'PASS'       // count 1 — the original message passes unobstructed
  | 'WARNING'    // count 2 — the warning prefix attaches, the message passes
  | 'ESCALATE'   // count 3 — the escalation prefix + the kick flag
  | 'BLOCK';     // count 4+ — the stop message + the hard block

export interface EscalationDecision {
  rung: EscalationRung;
  /** The fire count that produced this rung. */
  count: number;
  /** True when the kick MUST fire into the session (rung ESCALATE). */
  shouldKick: boolean;
  /** The message the adapter should pass on — prefixed at ESCALATE/WARNING. */
  message: string;
}

/**
 * Maps a fire count to the ladder rung. The numbers are the CONFIG's named
 * bands (RUNG_1_PASS..RUNG_4_BLOCK — the spec's one-rung-per-fire truth) —
 * NEVER literals in this body. The decision is a PURE function of the count:
 * the engine computes the rung, the adapter acts on it, the kick fires the
 * side effect. The hardcode ban: the message text comes from config.ts's
 * prefix builders — never a hand-written variant.
 */
export function decideEscalation(count: number): EscalationDecision {
  const c = typeof count === 'number' && isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (c >= RUNG_4_BLOCK) {
    return {
      rung: 'BLOCK',
      count: c,
      shouldKick: false,
      message: '[DEGENERACY LOOP - STOP] the dispatch has re-fired ' + c +
        ' times with the identical input — the degeneracy loop is BLOCKED. ' +
        'STOP re-firing the same input. Change the input, the approach, or the ' +
        'target — the identical dispatch is the loop, and the loop is refused.',
    };
  }
  if (c >= RUNG_3_ESCALATE) {
    return {
      rung: 'ESCALATE',
      count: c,
      shouldKick: true,
      message: escalationMessage(c) + ' the dispatch has re-fired ' + c +
        ' times with the identical input — the degeneracy loop is ESCALATED. ' +
        'A chat-message kick has fired into the session. Change the behavior: ' +
        'the identical input produces the identical failure, and the identical ' +
        'failure is the loop.',
    };
  }
  if (c >= RUNG_2_WARNING) {
    return {
      rung: 'WARNING',
      count: c,
      shouldKick: false,
      message: warningMessage(c) + ' the dispatch has re-fired ' + c +
        ' times with the identical input. The message passes, but the pattern ' +
        'is the degeneracy loop — change the input or the approach now.',
    };
  }
  return {
    rung: 'PASS',
    count: c,
    shouldKick: false,
    message: '',
  };
}

import { warningMessage, escalationMessage } from './config.ts';
