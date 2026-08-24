// src/loop-killer/adapter.ts — THE DEGENERACY-LOOP KILLER — THE ADAPTER
// (2026-08-16 — the ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL stack. The bible §1:
// "the ADAPTER = the managers (translate requests both ways)" — the adapter
// is the hook bridge: it translates the dispatch event (the task call's input
// + the fire count + the session) into the ladder outcome (the possibly-
// prefixed message + the kick trigger). The adapter OWNS NO STATE (the actor
// owns the counters), DECIDES NOTHING (the engine decides the rung), FIRES
// NOTHING (the kick owns the side effect) — it is the pure wiring between
// the runtime and the stack.
//
// THE ADAPTER'S SURFACE (the ONLY entry the hook calls on the dispatch path):
//   observe(opts)         — records the fire for the key, computes the rung,
//                            returns the outcome: the possibly-prefixed
//                            message + the kick flag. The hook wraps the
//                            THREE task blocks (the memory screen via
//                            classifyMemoryRead, the wave verbatim via
//                            TASK_BLOCK_MESSAGE, the wave mandate via
//                            assessTaskBlock) with this call — the ladder
//                            rides the dispatch path, never around it.
//   observeSuccess(opts)  — the pass-path call that clears the actor's key —
//                            the machine's RESET transition. A passing
//                            dispatch pushes the key back to IDLE, so the
//                            NEXT identical fire starts at count 1 again. A
//                            test must prove this — never assume it.
//
// THE LADDER (the adapter's outcome contract — one rung per fire):
//   count 1 — PASS        — the original message passes unobstructed.
//   count 2 — WARNING     — the [DEGENERACY LOOP - WARNING #2] prefix.
//   count 3 — ESCALATE    — the [DEGENERACY LOOP - ESCALATION #3] prefix +
//                            shouldKick:true (the adapter signals, the kick
//                            fires).
//   count 4+ — BLOCK      — the [DEGENERACY LOOP - STOP] + the hard block.
//
// THE ERROR PATHS (FIRST): the adapter never swallows the downstream blocks
// (the [WAVE MANDATE], the [WAVE VERBATIM], the [DISPATCH MEMORY SCREEN]
// throws) — the observe call returns the outcome; the HOOK decides whether to
// throw. The adapter's own failures (a malformed key, a dead actor) are LOUD:
// they return the named error outcome, never a silent pass.
//
// THE KICK TRIGGER (the adapter signals, the kick module fires): when the
// rung is ESCALATE, the adapter sets shouldKick:true and includes the
// STOP message. The HOOK (trident-hooks.ts) calls fireKick with the message
// + the session + the client getter. The adapter NEVER imports the kick — the
// kick is the hook's wiring decision, keeping the adapter pure.

import {
  hashInput, classifyDispatchInput, countIdenticalReFires, decideEscalation,
  type EscalationDecision,
} from './engine.ts';
import type { LoopActor } from './actor.ts';
import { LOOP_STOP_MESSAGE, warningMessage, escalationMessage } from './config.ts';

/** The observe outcome — what the hook acts on. */
export interface LoopObserveOutcome {
  /** The ladder rung for this fire. */
  rung: 'PASS' | 'WARNING' | 'ESCALATE' | 'BLOCK';
  /** The fire count that produced this rung. */
  count: number;
  /** The possibly-prefixed message — PASS passes the original unobstructed. */
  message: string;
  /** True when the kick MUST fire (rung ESCALATE — the adapter signals). */
  shouldKick: boolean;
  /** The hashed input — the actor's key (the diagnostics + the audit). */
  key: string;
  /** The engine's decision (the full detail — the audit + the tests). */
  decision: EscalationDecision;
}

export interface LoopObserveOptions {
  /** The actor — the per-key counters. */
  actor: LoopActor;
  /** The dispatch input — hashed into the key (the identity). */
  input: string;
  /** The session id (for the adapter's diagnostics). */
  sessionId?: string;
  /** The now() — injected for the tests, Date.now() live. */
  now?: number;
  /** The original message the ladder prefixes. */
  message?: string;
}

export interface LoopObserveSuccessOptions {
  /** The actor — the per-key counters. */
  actor: LoopActor;
  /** The dispatch input — the key to clear (the RESET). */
  input: string;
  /** The now() — injected for the tests. */
  now?: number;
}

/**
 * Records a fire for the input's key + computes the ladder rung. The adapter
 * returns the outcome; the hook acts on it (prefixes the message, throws the
 * hard block, fires the kick). The adapter never throws the downstream blocks
 * itself — it reports the rung, the hook decides the throw.
 */
export function observe(opts: LoopObserveOptions): LoopObserveOutcome {
  if (!opts || !opts.actor || typeof opts.input !== 'string') {
    throw new Error('[LOOP KILLER] observe: actor + input are required');
  }
  const key = hashInput(opts.input);
  const count = opts.actor.increment(key, opts.now);
  const safeCount = typeof count === 'number' ? count : 0;
  const decision = decideEscalation(safeCount);
  const baseMessage = typeof opts.message === 'string' && opts.message.trim()
    ? opts.message
    : '';

  // THE MESSAGE PREFIXING (the ladder's observable rungs — the model SEES
  // the prefix on the message it sent): WARNING attaches the warning prefix,
  // ESCALATE attaches the escalation prefix + the kick message, BLOCK uses
  // the STOP message. PASS passes the original unobstructed.
  let message = baseMessage;
  if (decision.rung === 'WARNING') {
    message = warningMessage(safeCount) + ' ' + baseMessage;
  } else if (decision.rung === 'ESCALATE') {
    message = escalationMessage(safeCount) + ' ' + baseMessage;
  } else if (decision.rung === 'BLOCK') {
    message = LOOP_STOP_MESSAGE + ' ' + baseMessage;
  }

  return {
    rung: decision.rung,
    count: safeCount,
    message,
    shouldKick: decision.shouldKick,
    key,
    decision,
  };
}

/**
 * The observeSuccess path — clears the actor's key (the machine's RESET
 * transition). The hook calls it on the PASS path (a successful dispatch
 * that passed the firewalls — the dispatch is NOT the degeneracy loop). The
 * observable effect: the NEXT identical fire starts at count 1 again. The
 * tests prove this by firing after a success and asserting count 1.
 */
export function observeSuccess(opts: LoopObserveSuccessOptions): boolean {
  if (!opts || !opts.actor || typeof opts.input !== 'string') {
    return false;
  }
  const key = hashInput(opts.input);
  return opts.actor.clear(key);
}

/**
 * The adapter's classification pass-through — the hook's memory-screen /
 * wave-verbatim / wave-mandate blocks route through the adapter's observe,
 * and the adapter's classify feeds the degeneracy decision (a PROMPT-class
 * input that re-fires is the loop). The engine delegates to the T.E.B.
 * classifier (the single taxonomy); this is the adapter's re-export so the
 * hook has ONE entry point.
 */
export { classifyDispatchInput } from './engine.ts';
