// src/loop-killer/machine.ts — THE DEGENERACY-LOOP KILLER — THE MACHINE
// (2026-08-16 — the operator's directive: "how do we kick this in the nuts and
// force a behavior change... needs a proper ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL
// backend intelligence that changes the actual firewall message + fires a chat
// message kick into the session forcing a change in behavior per
// POSEIDON_CHAT_KICK_MECHANICS").
//
// THE MACHINE — the blueprint (the ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL bible
// §1: "the MACHINE = the org chart (what CAN happen, the rules)"): the 6-state
// transition table for the per-key degeneracy ladder. The MACHINE OWNS THE
// TRANSITIONS — the engine owns the decision, the kick owns the side effect.
// A state machine never decides WHY — it maps the (state, event) pair to the
// next state. The per-key loops (counters) live in the ACTOR; the escalation
// math lives in the ENGINE; this file holds ONLY the closed transition map.
//
// THE LADDER (one rung per fire — the spec's truth):
//   IDLE      — no fires for the key. The first observe stays here (count 1).
//               The original message passes unobstructed.
//   OBSERVED  — the first identical re-fire (count 2) recorded — the prefix
//               [DEGENERACY LOOP - WARNING #2] attaches.
//   WARNING   — count 3 — [DEGENERACY LOOP - ESCALATION #3] + the kick flag.
//   ESCALATED — count 4+ — [DEGENERACY LOOP - STOP] + the hard block.
//   KICKED    — the kick has fired; the next identical fire returns to
//               ESCALATED (the hard block holds) until the window expires.
//   RESET     — the observeSuccess path: the pass clears the key back to
//               IDLE — the loop is broken AHEAD of the ladder.
//
// THE STATE NAMES (the 6 states the actor persists):
//   'IDLE' | 'OBSERVED' | 'WARNING' | 'ESCALATED' | 'KICKED' | 'RESET'
//
// THE TRANSITIONS (the closed map — every state + every event has a target,
// never a hole, never a default-pass):
//   (IDLE,     FIRE)  → OBSERVED      — the first re-fire: the ladder begins
//   (OBSERVED, FIRE)  → WARNING       — the second re-fire: the warning rung
//   (WARNING,  FIRE)  → ESCALATED     — the third re-fire: escalate + kick
//   (ESCALATED,FIRE)  → ESCALATED     — the hard block holds (self-loop)
//   (KICKED,   FIRE)  → ESCALATED     — the kick already fired: the block holds
//   (any,      SUCCESS) → RESET       — the observeSuccess clears the key
//   (RESET,    FIRE)  → OBSERVED      — a fresh fire after a reset: count 1
//   (any,      EXPIRY) → IDLE         — the window expired: the slate clean
//
// THE ERROR PATHS (FIRST — the honest-behavior law): a malformed event name is
// NEVER silently swallowed into a pass — it THROWS the named event. The
// transition table is exhaustive: the machine cannot produce an out-of-table
// state. An invalid (state, event) pair is a programming defect, and the
// defect is LOUD.

// ── THE TYPED BOUNDARY ──────────────────────────────────────────────
/** The 6 machine states — the ladder's rungs + the reset + the expiry. */
export type LoopMachineState =
  | 'IDLE'
  | 'OBSERVED'
  | 'WARNING'
  | 'ESCALATED'
  | 'KICKED'
  | 'RESET';

/** The machine's events — the ONLY three signals the ladder reacts to. */
export type LoopMachineEvent = 'FIRE' | 'SUCCESS' | 'EXPIRY';

// THE CLOSED TRANSITION TABLE (typed, exhaustive — the machine never
// falls through to a pass). The outer key = the current state; the inner key
// = the event; the value = the target state.
const TRANSITIONS: Record<LoopMachineState, Partial<Record<LoopMachineEvent, LoopMachineState>>> = {
  IDLE: { FIRE: 'OBSERVED', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
  OBSERVED: { FIRE: 'WARNING', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
  WARNING: { FIRE: 'ESCALATED', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
  ESCALATED: { FIRE: 'ESCALATED', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
  KICKED: { FIRE: 'ESCALATED', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
  RESET: { FIRE: 'OBSERVED', SUCCESS: 'RESET', EXPIRY: 'IDLE' },
};

// THE EXHAUSTIVENESS GUARD — the table must cover every (state, event) pair.
// The machine validates the table at load: a hole is a CRITICAL defect, and
// the defect is LOUD (the throw names the missing pair) — never a silent
// default-pass that turns the killer into theater.
const LOOP_MACHINE_EVENTS: LoopMachineEvent[] = ['FIRE', 'SUCCESS', 'EXPIRY'];
const LOOP_MACHINE_STATES: LoopMachineState[] =
  ['IDLE', 'OBSERVED', 'WARNING', 'ESCALATED', 'KICKED', 'RESET'];

(function validateTransitionTable(): void {
  for (const s of LOOP_MACHINE_STATES) {
    for (const e of LOOP_MACHINE_EVENTS) {
      const row = TRANSITIONS[s] || {};
      if (typeof row[e] !== 'string' || row[e]!.length === 0) {
        throw new Error('[LOOP KILLER] the transition table has a hole: (' + s + ', ' + e + ') → missing — the machine MUST cover every (state, event) pair');
      }
    }
  }
})();

// ── THE ADVANCE — the machine's ONLY public operation ─────────────────
/**
 * Advances the machine from the given state on the given event, returning the
 * next state. The transition is a PURE function of the two inputs — the
 * machine never reads the actor, never computes the count, never fires a
 * kick. The engine computes WHY (the escalation rung); the machine computes
 * WHERE (the next state).
 */
export function advanceMachine(
  state: LoopMachineState,
  event: LoopMachineEvent,
): LoopMachineState {
  const row = TRANSITIONS[state];
  const next = row ? row[event] : undefined;
  if (typeof next !== 'string' || next.length === 0) {
    // THE ERROR PATH FIRST — a malformed pair is a programming defect. The
    // named throw beats a silent pass: a killer that swallows into a pass is
    // theater, and the audit rejects it.
    throw new Error('[LOOP KILLER] advanceMachine: no transition for (' + state + ', ' + event + ') — the machine table is exhaustive; this pair is a programming defect');
  }
  return next;
}
