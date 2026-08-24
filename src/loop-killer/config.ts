// src/loop-killer/config.ts — THE DEGENERACY-LOOP KILLER — THE CONFIG
// (2026-08-16 — the ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL stack: the config is
// the OWNER of every threshold the stack references. The engine never
// hardcodes a rung; the actor never hardcodes a window; the kick never
// hardcodes the message text. The ladder's numbers + the window's length +
// the kick's message are the DATA — computed once, referenced everywhere.
//
// THE NAMED CALIBRATION (the ISE law's remediation — every threshold carries
// the calib source):
//   THE LADDER (the spec's truth, one rung per fire):
//     RUNG_1_PASS    = 1  — the original message passes unobstructed.
//     RUNG_2_WARNING = 2  — the [DEGENERACY LOOP - WARNING #2] prefix.
//     RUNG_3_ESCALATE = 3 — the [DEGENERACY LOOP - ESCALATION #3] prefix + the
//                           kick fires into the session.
//     RUNG_4_BLOCK   = 4  — the [DEGENERACY LOOP - STOP] + the hard block
//                           refuses the dispatch.
//   THE WINDOW (the spec's config — the re-fire identity window):
//     LOOP_WINDOW_MS = 5 minutes — the same-hash fires within the window
//     accumulate; a fire past the window resets the count BEFORE it
//     increments (the spec: "an old fire past the window resets the count
//     before it increments — the reset is a state transition, not a side
//     effect"). The 300s calibration matches the container-testing skill's
//     claim window (the documented 5-min bound for a dispatch retry storm).
//   THE KICK (the operator's rename — verbatim, no variant):
//     [DEGENERACY LOOP - STOP] — the session.prompt payload the kick module
//     fires (POSEIDON_CHAT_KICK_MECHANICS: the session.prompt REAL-turn is
//     the ONLY sanctioned kick channel).
//
// THE RUNG PREFIXES (the observable ladder rungs — the message the model
// SEES on each fire. The tests assert these strings verbatim; a typo is a
// failing test, not a cosmetic issue):
//   warning:    '[DEGENERACY LOOP - WARNING #' + count + ']'
//   escalate:   '[DEGENERACY LOOP - ESCALATION #' + count + ']'
//   stop:       '[DEGENERACY LOOP - STOP]'
//
// THE INVARIANT (validated at load — the ladder's ordering is mechanical):
//   1 < 2 < 3 < 4 — the warning must be EARLIER than the escalate, the block
//   LAST. A config that inverts the ladder is a CRITICAL defect, thrown LOUD.

// ── THE LADDER RUNG THRESHOLDS (the named bands — the engine's table) ──
/** The fire count at which the original message passes unobstructed. */
export const RUNG_1_PASS = 1;
/** The fire count at which the WARNING prefix attaches (count 2). */
export const RUNG_2_WARNING = 2;
/** The fire count at which the ESCALATION prefix + the kick fire (count 3). */
export const RUNG_3_ESCALATE = 3;
/** The fire count at which the STOP hard block refuses the dispatch (count 4+). */
export const RUNG_4_BLOCK = 4;

/** The identity window — same-hash fires within this window accumulate. */
export const LOOP_WINDOW_MS = 5 * 60 * 1000;

// ── THE OBSERVABLE RUNG PREFIXES (the ladder's message rungs) ─────────
/** The WARNING rung's prefix — attached to the message at count 2. */
export const LOOP_WARNING_PREFIX = '[DEGENERACY LOOP - WARNING #';
/** The ESCALATION rung's prefix — attached to the message at count 3. */
export const LOOP_ESCALATION_PREFIX = '[DEGENERACY LOOP - ESCALATION #';
/** The STOP message — the hard block's refusal + the kick's payload text. */
export const LOOP_STOP_MESSAGE = '[DEGENERACY LOOP - STOP]';

// THE PREFIX SUFFIX (the rung number closes the bracket: '#' + count + ']').
export const LOOP_RUNG_SUFFIX = ']';

/** Builds the warning message for the given count (count 2). */
export function warningMessage(count: number): string {
  return LOOP_WARNING_PREFIX + count + LOOP_RUNG_SUFFIX;
}

/** Builds the escalation message for the given count (count 3). */
export function escalationMessage(count: number): string {
  return LOOP_ESCALATION_PREFIX + count + LOOP_RUNG_SUFFIX;
}

// ── THE LADDER INVARIANT (validated at load — the ordering is mechanical) ──
(function validateLadder(): void {
  if (!(RUNG_1_PASS < RUNG_2_WARNING && RUNG_2_WARNING < RUNG_3_ESCALATE && RUNG_3_ESCALATE < RUNG_4_BLOCK)) {
    throw new Error('[LOOP KILLER] the ladder config is inverted: 1 < 2 < 3 < 4 must hold — the warning before the escalate, the block LAST');
  }
})();
