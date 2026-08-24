// src/loop-killer/index.ts — THE DEGENERACY-LOOP KILLER — THE INDEX
// (2026-08-16 — the module's typed public surface. The stack's 6 files:
// the machine (the transitions), the actor (the per-key counters), the
// engine (hashInput + classifyDispatchInput + countIdenticalReFires +
// decideEscalation), the adapter (observe/observeSuccess), the kick (the
// session.prompt fire), the config (the thresholds). The index exports the
// TYPED surface the hook + the tests import — every boundary is typed,
// never any.
//
// THE TYPED BOUNDARIES (the acceptance vector):
//   the engine never fires the kick (the kick module owns the side effect),
//   the kick never classifies (the engine owns the decision),
//   the adapter never owns state (the actor owns the counters).

// ── THE MACHINE — the transitions ────────────────────────────────────
export {
  advanceMachine,
  type LoopMachineState,
  type LoopMachineEvent,
} from './machine.ts';

// ── THE ACTOR — the per-key counters ─────────────────────────────────
export {
  LoopActor,
  actorAdvance,
  type LoopKeyCounter,
  type LoopActorOptions,
  type LoopActorSnapshot,
  type NowFn,
} from './actor.ts';

// ── THE ENGINE — the decisions ───────────────────────────────────────
export {
  hashInput,
  classifyDispatchInput,
  countIdenticalReFires,
  decideEscalation,
  type EscalationRung,
  type EscalationDecision,
} from './engine.ts';

// ── THE ADAPTER — the hook bridge ────────────────────────────────────
export {
  observe,
  observeSuccess,
  type LoopObserveOutcome,
  type LoopObserveOptions,
  type LoopObserveSuccessOptions,
} from './adapter.ts';

// ── THE KICK — the session.prompt fire ───────────────────────────────
export {
  fireKick,
  type KickOptions,
  type KickResult,
  type KickClientLike,
} from './kick.ts';

// ── THE CONFIG — the thresholds ──────────────────────────────────────
export {
  RUNG_1_PASS,
  RUNG_2_WARNING,
  RUNG_3_ESCALATE,
  RUNG_4_BLOCK,
  LOOP_WINDOW_MS,
  LOOP_WARNING_PREFIX,
  LOOP_ESCALATION_PREFIX,
  LOOP_STOP_MESSAGE,
  LOOP_RUNG_SUFFIX,
  warningMessage,
  escalationMessage,
} from './config.ts';

// ── THE COMPOSED INSTANCE (the runtime's default actor) ──────────────
// The hook wires ONE actor at module load — the per-process per-key
// counters. The window is the CONFIG's value (LOOP_WINDOW_MS — the spec owns
// it); the tests create their OWN actors with injected now()s.
import { LoopActor } from './actor.ts';
import { LOOP_WINDOW_MS } from './config.ts';

/** The runtime's default actor — the per-process per-key counters. */
export const defaultLoopActor = new LoopActor({ windowMs: LOOP_WINDOW_MS });
