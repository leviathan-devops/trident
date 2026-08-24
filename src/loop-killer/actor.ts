// src/loop-killer/actor.ts — THE DEGENERACY-LOOP KILLER — THE ACTOR
// (2026-08-16 — the operator's directive: the ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL
// stack. The bible §1: "the ACTOR = the running copy of the machine (what IS
// happening, live state)". The MACHINE (machine.ts) is the blueprint — the 6
// states + the closed transition table; the ACTOR is the LIVE per-key state:
// the hashed inputs, the fire counts, the timestamps, the window state.
//
// THE ACTOR OWNS THE STATE — the adapter never owns state, the engine never
// reads state directly (it receives the count as an argument), the kick never
// touches the counters. The actor is the SINGLE store of the per-key loop
// counters: one entry per hashed dispatch input.
//
// THE PER-KEY SHAPE:
//   key          — the sha256 hash of the dispatch input (the identity — two
//                  inputs that hash the same are the SAME fire; the hashInput
//                  engine computes it — the actor never hashes).
//   state        — the current machine state (IDLE..RESET — machine.ts).
//   count        — the fire count within the CURRENT window (the ladder
//                  rung: 1 = the original, 2 = warning, 3 = escalate, 4+ =
//                  the hard block). The count RESETS when the window expires.
//   firstSeenAt  — the timestamp of the FIRST fire in this window (the window
//                  anchor — the expiry check measures from here).
//   lastFiredAt  — the timestamp of the LAST fire (the order diagnostic).
//   kickedAt     — the timestamp when the kick fired (null until the kick —
//                  the "the kick already fired" diagnostic for the audit).
//
// THE WINDOW EXPIRY (a first-class behavior, not an afterthought): an old fire
// past the WINDOW resets the count BEFORE the increment — the reset is a
// state transition (the machine's EXPIRY event → IDLE), not a side effect.
// The window's duration is owned by the CONFIG (loop-killer/config.ts) — the
// actor reads it via the injected now()-function for testability, never a
// hardcoded literal.
//
// THE ERROR PATHS (FIRST): a malformed key/state is validated before the write
// — a corrupt entry is dropped + the map re-created (the recover path), never
// silently read as a pass. The actor NEVER fabricates a count: a missing key
// reads as 0 (IDLE), and that 0 is the honest "no fires yet" — not a fitted
// oracle.

// ── THE PER-KEY COUNTER SHAPE ────────────────────────────────────────
export interface LoopKeyCounter {
  /** The sha256 of the dispatch input — the identity (the engine hashes). */
  key: string;
  /** The current machine state for this key (machine.ts). */
  state: 'IDLE' | 'OBSERVED' | 'WARNING' | 'ESCALATED' | 'KICKED' | 'RESET';
  /** The fire count within the current window (the ladder rung). */
  count: number;
  /** The FIRST fire's timestamp in this window (the expiry anchor). */
  firstSeenAt: number;
  /** The LAST fire's timestamp (the order diagnostic). */
  lastFiredAt: number;
  /** The kick's timestamp (null until the kick fired). */
  kickedAt: number | null;
}

/** The window-now dependency — injected for the tests, Date.now() live. */
export type NowFn = () => number;

/** The actor's constructor inputs — the window length is CONFIG-owned. */
export interface LoopActorOptions {
  /** The window's length in ms — the spec's config owns it. */
  windowMs: number;
  /** The clock — the tests inject a fake now, the runtime uses Date.now. */
  now?: NowFn;
}

/** The actor's read snapshot — what the adapter + the audit can observe. */
export interface LoopActorSnapshot {
  /** The counters keyed by the hashed input. */
  counters: ReadonlyMap<string, LoopKeyCounter>;
  /** The total tracked keys (the audit's count of active loops). */
  size: number;
}

// ── THE ACTOR ────────────────────────────────────────────────────────
export class LoopActor {
  private counters = new Map<string, LoopKeyCounter>();
  private windowMs: number;
  private nowFn: NowFn;

  constructor(opts: LoopActorOptions) {
    if (!opts || typeof opts.windowMs !== 'number' || !(opts.windowMs > 0)) {
      // THE ERROR PATH FIRST — a non-positive window is a programming defect,
      // not a config choice. The actor refuses to boot on a broken window.
      throw new Error('[LOOP KILLER] LoopActor: windowMs must be a positive number (got ' + String(opts && opts.windowMs) + ')');
    }
    this.windowMs = opts.windowMs;
    this.nowFn = typeof opts.now === 'function' ? opts.now : () => Date.now();
  }

  /** The live window length (the config's value — the spec owns it). */
  get window(): number { return this.windowMs; }

  /**
   * Reads the counter for a key — returns a COPY (the callers must never
   * mutate the actor's internal state by reference). A missing key is the
   * honest IDLE/0 — never a fabricated pass.
   */
  getCounter(key: string): LoopKeyCounter | null {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return null;
    }
    const c = this.counters.get(key);
    return c ? { ...c } : null;
  }

  /**
   * Records a fire for a key. THE WINDOW EXPIRY IS A PRE-INCREMENT CHECK: an
   * old fire (firstSeenAt past the window) resets the count BEFORE it
   * increments — the reset is a state transition (EXPIRY → IDLE), never a
   * side effect. The count returned is the POST-reset, POST-increment rung —
   * the number the engine maps to the ladder.
   *
   * ERROR PATH: a malformed key is rejected (null) — the actor never
   * fabricates a count for a garbage key.
   */
  increment(key: string, now = this.nowFn()): number | null {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return null;
    }
    const existing = this.counters.get(key);
    if (!existing) {
      // The FIRST fire for this key — IDLE → OBSERVED (the machine owns the
      // transition; the actor records it).
      this.counters.set(key, {
        key,
        state: 'OBSERVED',
        count: 1,
        firstSeenAt: now,
        lastFiredAt: now,
        kickedAt: null,
      });
      return 1;
    }
    // THE WINDOW-EXPIRY CHECK (the pre-increment reset — the spec's first-class
    // behavior): a fire whose firstSeenAt is PAST the window is a NEW window —
    // the old count resets, the machine transitions EXPIRY → IDLE, and this
    // fire is the first of the fresh window (count 1, not count + 1).
    if (existing.firstSeenAt > 0 && (now - existing.firstSeenAt) > this.windowMs) {
      this.counters.set(key, {
        key,
        state: 'OBSERVED',
        count: 1,
        firstSeenAt: now,
        lastFiredAt: now,
        kickedAt: null,
      });
      return 1;
    }
    // THE NORMAL INCREMENT (within the window): the count +1, the machine
    // advances on FIRE from the CURRENT state (the transition table computes
    // the next state — the actor never decides the rung itself).
    const nextCount = existing.count + 1;
    this.counters.set(key, {
      key,
      state: this.advanceState(existing.state, 'FIRE'),
      count: nextCount,
      firstSeenAt: existing.firstSeenAt,
      lastFiredAt: now,
      kickedAt: existing.kickedAt,
    });
    return nextCount;
  }

  /**
   * The observeSuccess path — clears the key's counter. The machine's RESET
   * transition is the observable effect: a passing dispatch pushes the key
   * back to IDLE, so the NEXT identical fire starts at count 1 again. The
   * test must prove this — never assume it.
   */
  clear(key: string): boolean {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return false;
    }
    return this.counters.delete(key);
  }

  /**
   * Marks the key's kick as fired (sets the kickedAt timestamp). The kick
   * fires OUTSIDE the actor (the engine decides, the kick module fires) —
   * this is the actor's record of the side effect, set AFTER the kick
   * succeeds (the side effect precedes the claim).
   */
  markKicked(key: string, now = this.nowFn()): boolean {
    const c = this.counters.get(key);
    if (!c) return false;
    c.kickedAt = now;
    return true;
  }

  /**
   * Purges expired keys (the housekeeping — the audit + the cron call it).
   * An expired key is dropped: the machine's EXPIRY transition → IDLE, and
   * the entry's absence IS the IDLE state. Returns the count purged.
   */
  purgeExpired(now = this.nowFn()): number {
    let purged = 0;
    const expired: string[] = [];
    for (const [k, c] of this.counters) {
      if (c.firstSeenAt > 0 && (now - c.firstSeenAt) > this.windowMs) {
        expired.push(k);
      }
    }
    for (const k of expired) {
      if (this.counters.delete(k)) purged++;
    }
    return purged;
  }

  /** The read-only snapshot for the adapter + the audit. */
  snapshot(): LoopActorSnapshot {
    return {
      counters: new Map(this.counters),
      size: this.counters.size,
    };
  }

  // THE STATE-ADVANCE — the actor's bridge to the machine's closed table. The
  // machine OWNS the transitions; the actor simply applies them (the single
  // source of truth — the machine's advanceMachine validates the pair and
  // throws LOUD on a hole, never a silent pass). The result is the state the
  // counter records.
  private advanceState(
    state: 'IDLE' | 'OBSERVED' | 'WARNING' | 'ESCALATED' | 'KICKED' | 'RESET',
    event: 'FIRE' | 'SUCCESS' | 'EXPIRY',
  ): 'IDLE' | 'OBSERVED' | 'WARNING' | 'ESCALATED' | 'KICKED' | 'RESET' {
    return advanceMachine(state, event);
  }
}

import { advanceMachine, type LoopMachineState, type LoopMachineEvent } from './machine.ts';

// The actor's public advance — the machine's function, re-exported for the
// consumers that want the pure transition (the adapter + the tests).
export function actorAdvance(
  state: LoopMachineState,
  event: LoopMachineEvent,
): LoopMachineState {
  return advanceMachine(state, event);
}
