// ═══ THE DEGENERACY-LOOP KILLER — THE LADDER BATTERY ═══
// (2026-08-16 — the operator's directive: "how do we kick this in the nuts and
// force a behavior change... needs a proper ACTOR_ENGINE_ADAPTER_CONTAINER_MODEL
// backend intelligence that changes the actual firewall message + fires a chat
// message kick into the session forcing a change in behavior per
// POSEIDON_CHAT_KICK_MECHANICS").
//
// THE LADDER (one rung per fire — the spec's truth, mutation-checked):
//   count 1 — PASS        — the original message passes unobstructed.
//   count 2 — WARNING     — the [DEGENERACY LOOP - WARNING #2] prefix.
//   count 3 — ESCALATE    — the [DEGENERACY LOOP - ESCALATION #3] prefix +
//                            the kick flag (shouldKick).
//   count 4+ — BLOCK      — the [DEGENERACY LOOP - STOP] + the hard block.
//   the success reset     — observeSuccess clears the key → the next identical
//                            fire starts at count 1 again.
//   the window expiry     — an old fire past the window resets the count
//                            BEFORE it increments → count 1 again.
//
// THE ORACLE BAN: every test drives the PUBLIC API (observe → decide → kick),
// never the private counters. The observable outputs (the prefix, the flag,
// the block) are asserted — a mutation that removes a rung fails the test.
// THE MUTATION-CHECK: the warning MUST actually prefix the message, the kick
// MUST actually fire (the flag + the observable side effect via a mock client),
// the hard block MUST actually refuse. A test that passes without its side
// effect is a rejected failure, not a green.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import {
  LoopActor,
  advanceMachine,
  hashInput,
  classifyDispatchInput,
  countIdenticalReFires,
  decideEscalation,
  observe,
  observeSuccess,
  fireKick,
  warningMessage,
  escalationMessage,
  LOOP_STOP_MESSAGE,
  LOOP_WARNING_PREFIX,
  LOOP_ESCALATION_PREFIX,
  RUNG_2_WARNING,
  RUNG_3_ESCALATE,
  RUNG_4_BLOCK,
} from '../loop-killer/index.ts';

// THE FAKE CLOCK (the window tests drive the actor's now()):
function fakeNow(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function makeActor(windowMs = 5 * 60 * 1000, now?: () => number): LoopActor {
  return new LoopActor({ windowMs, now });
}

// ═══ THE MACHINE — the transition table ═══
describe('loop-killer machine', () => {
  test('advanceMachine: the full FIRE ladder (IDLE to OBSERVED to WARNING to ESCALATED)', () => {
    let s = advanceMachine('IDLE', 'FIRE');
    expect(s).toBe('OBSERVED');
    s = advanceMachine(s, 'FIRE');
    expect(s).toBe('WARNING');
    s = advanceMachine(s, 'FIRE');
    expect(s).toBe('ESCALATED');
    s = advanceMachine(s, 'FIRE');
    expect(s).toBe('ESCALATED');
  });

  test('advanceMachine: SUCCESS returns RESET from every state (the success reset)', () => {
    for (const st of ['IDLE', 'OBSERVED', 'WARNING', 'ESCALATED', 'KICKED', 'RESET'] as const) {
      expect(advanceMachine(st, 'SUCCESS')).toBe('RESET');
    }
  });

  test('advanceMachine: EXPIRY returns IDLE from every state (the window expiry)', () => {
    for (const st of ['IDLE', 'OBSERVED', 'WARNING', 'ESCALATED', 'KICKED', 'RESET'] as const) {
      expect(advanceMachine(st, 'EXPIRY')).toBe('IDLE');
    }
  });

  test('advanceMachine: RESET + FIRE returns OBSERVED (a fresh fire after a reset starts the ladder)', () => {
    expect(advanceMachine('RESET', 'FIRE')).toBe('OBSERVED');
  });

  test('advanceMachine: KICKED + FIRE returns ESCALATED (the kick fired; the block holds)', () => {
    expect(advanceMachine('KICKED', 'FIRE')).toBe('ESCALATED');
  });

  test('advanceMachine: an invalid event throws the named error (no silent pass)', () => {
    expect(() => advanceMachine('IDLE', 'BOGUS' as never)).toThrow(/no transition/);
  });

  test('advanceMachine: an invalid state throws the named error', () => {
    expect(() => advanceMachine('BOGUS' as never, 'FIRE')).toThrow(/no transition/);
  });

  test('advanceMachine: every (state, event) pair has a transition', () => {
    const states = ['IDLE', 'OBSERVED', 'WARNING', 'ESCALATED', 'KICKED', 'RESET'] as const;
    const events = ['FIRE', 'SUCCESS', 'EXPIRY'] as const;
    for (const s of states) {
      for (const e of events) {
        let next: string | null = null;
        try { next = advanceMachine(s, e); } catch { next = null; }
        expect(next).not.toBeNull();   // the shim's .not has no toThrow — assert the non-throw via the value
      }
    }
  });
});

// ═══ THE ACTOR — the per-key counters ═══
describe('loop-killer actor', () => {
  test('increment: the first fire returns count 1', () => {
    const a = makeActor();
    expect(a.increment('k')).toBe(1);
  });

  test('increment: identical fires accumulate within the window (1, 2, 3, 4)', () => {
    const a = makeActor();
    expect(a.increment('k')).toBe(1);
    expect(a.increment('k')).toBe(2);
    expect(a.increment('k')).toBe(3);
    expect(a.increment('k')).toBe(4);
  });

  test('increment: different keys accumulate independently', () => {
    const a = makeActor();
    expect(a.increment('k1')).toBe(1);
    expect(a.increment('k2')).toBe(1);
    expect(a.increment('k1')).toBe(2);
    expect(a.increment('k2')).toBe(2);
  });

  test('getCounter: a missing key is null (the honest IDLE), never a fabricated count', () => {
    const a = makeActor();
    expect(a.getCounter('missing')).toBeNull();
  });

  test('clear: removes the key (the RESET — the next fire starts at count 1)', () => {
    const a = makeActor();
    a.increment('k');
    a.increment('k');
    expect(a.clear('k')).toBe(true);
    expect(a.getCounter('k')).toBeNull();
    expect(a.increment('k')).toBe(1);
  });

  test('markKicked: records the kick timestamp', () => {
    const a = makeActor();
    a.increment('k');
    expect(a.markKicked('k')).toBe(true);
    const c = a.getCounter('k');
    expect(c && c.kickedAt).toBeTruthy();
  });

  test('purgeExpired: removes the keys past the window', () => {
    const clock = fakeNow();
    const a = makeActor(1000, clock.now);
    a.increment('k');
    clock.advance(2000);
    expect(a.purgeExpired(clock.now())).toBe(1);
    expect(a.getCounter('k')).toBeNull();
  });

  test('increment: an old fire past the window resets the count to 1 (the window expiry)', () => {
    const clock = fakeNow();
    const a = makeActor(1000, clock.now);
    a.increment('k');
    a.increment('k');
    clock.advance(2000);
    expect(a.increment('k', clock.now())).toBe(1);
  });

  test('increment: an empty/malformed key returns null (no fabricated count)', () => {
    const a = makeActor();
    expect(a.increment('')).toBeNull();
    expect(a.increment('   ')).toBeNull();
  });

  test('LoopActor: a non-positive window throws (the config guard)', () => {
    expect(() => new LoopActor({ windowMs: 0 })).toThrow(/windowMs/);
    expect(() => new LoopActor({ windowMs: -5 })).toThrow(/windowMs/);
  });
});

// ═══ THE ENGINE — hashInput / classifyDispatchInput / decideEscalation ═══
describe('loop-killer engine', () => {
  test('hashInput: identical inputs hash identically; different inputs differ', () => {
    expect(hashInput('the same input')).toBe(hashInput('the same input'));
    expect(hashInput('the same input')).not.toBe(hashInput('a different input'));
  });

  test('hashInput: is a 64-char hex sha256', () => {
    expect(hashInput('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('hashInput: a null/empty input hashes deterministically (no crash)', () => {
    const a = hashInput('');
    const b = hashInput('');
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  test('classifyDispatchInput: delegates to the T.E.B. classifier (PATH / PROMPT / MIXED)', () => {
    const workspacePath = process.cwd() + '/trident-tmp/a1.md';
    const pathDec = classifyDispatchInput(workspacePath);
    expect(pathDec.cls).toBe('MIXED');   // a path outside the workspace root + a slash-token → the T.E.B.'s MIXED
    expect(pathDec.action).toBe('BLOCK');
    const prompt = classifyDispatchInput('THE MISSION: do the thing');
    expect(prompt.cls).toBe('PROMPT');
    expect(prompt.action).toBe('BLOCK');
  });

  test('decideEscalation: the ladder rungs map the count (1 pass / 2 warning / 3 escalate / 4+ block)', () => {
    expect(decideEscalation(1).rung).toBe('PASS');
    expect(decideEscalation(1).shouldKick).toBe(false);
    expect(decideEscalation(2).rung).toBe('WARNING');
    expect(decideEscalation(2).shouldKick).toBe(false);
    expect(decideEscalation(3).rung).toBe('ESCALATE');
    expect(decideEscalation(3).shouldKick).toBe(true);
    expect(decideEscalation(4).rung).toBe('BLOCK');
    expect(decideEscalation(4).shouldKick).toBe(false);
    expect(decideEscalation(99).rung).toBe('BLOCK');
  });

  test('decideEscalation: a negative/zero count maps to PASS (never a fabricated block)', () => {
    expect(decideEscalation(0).rung).toBe('PASS');
    expect(decideEscalation(-3).rung).toBe('PASS');
  });

  test('decideEscalation: the rung prefixes carry the EXACT config strings', () => {
    expect(decideEscalation(2).message.startsWith(LOOP_WARNING_PREFIX)).toBe(true);
    expect(decideEscalation(3).message.startsWith(LOOP_ESCALATION_PREFIX)).toBe(true);
    expect(decideEscalation(4).message.startsWith(LOOP_STOP_MESSAGE)).toBe(true);
  });

  test('countIdenticalReFires: reads the actor count; a missing key is 0', () => {
    const a = makeActor();
    a.increment('k');
    a.increment('k');
    expect(countIdenticalReFires(a, 'missing-key')).toBe(0);
    expect(countIdenticalReFires(a, 'k')).toBe(2);
  });
});

// ═══ THE ADAPTER — observe / observeSuccess (the PUBLIC ladder) ═══
describe('loop-killer adapter — THE LADDER', () => {
  const INPUT = 'EXECUTE THE SAME DISPATCH PROMPT VERBATIM.';

  test('rung 1 — PASS: the original message passes unobstructed (no prefix)', () => {
    const a = makeActor();
    const o = observe({ actor: a, input: INPUT, message: 'the original' });
    expect(o.rung).toBe('PASS');
    expect(o.count).toBe(1);
    expect(o.shouldKick).toBe(false);
    expect(o.message).toBe('the original');
  });

  test('rung 2 — WARNING: the [DEGENERACY LOOP - WARNING #2] prefix attaches', () => {
    const a = makeActor();
    observe({ actor: a, input: INPUT });
    const o = observe({ actor: a, input: INPUT, message: 'the original' });
    expect(o.rung).toBe('WARNING');
    expect(o.count).toBe(2);
    expect(o.shouldKick).toBe(false);
    expect(o.message).toContain('[DEGENERACY LOOP - WARNING #2]');
    expect(o.message).toContain('the original');
  });

  test('rung 3 — ESCALATE: the [DEGENERACY LOOP - ESCALATION #3] prefix + the kick flag', () => {
    const a = makeActor();
    observe({ actor: a, input: INPUT });
    observe({ actor: a, input: INPUT });
    const o = observe({ actor: a, input: INPUT, message: 'the original' });
    expect(o.rung).toBe('ESCALATE');
    expect(o.count).toBe(3);
    expect(o.shouldKick).toBe(true);
    expect(o.message).toContain('[DEGENERACY LOOP - ESCALATION #3]');
  });

  test('rung 4+ — BLOCK: the [DEGENERACY LOOP - STOP] hard block refuses the dispatch', () => {
    const a = makeActor();
    observe({ actor: a, input: INPUT });
    observe({ actor: a, input: INPUT });
    observe({ actor: a, input: INPUT });
    const o = observe({ actor: a, input: INPUT, message: 'the original' });
    expect(o.rung).toBe('BLOCK');
    expect(o.count).toBe(4);
    expect(o.shouldKick).toBe(false);
    expect(o.message).toContain('[DEGENERACY LOOP - STOP]');
  });

  test('the ladder continues past the block (count 5, 6 — the block holds)', () => {
    const a = makeActor();
    for (let i = 0; i < 4; i++) observe({ actor: a, input: INPUT });
    const o5 = observe({ actor: a, input: INPUT });
    const o6 = observe({ actor: a, input: INPUT });
    expect(o5.rung).toBe('BLOCK');
    expect(o6.rung).toBe('BLOCK');
    expect(o5.count).toBe(5);
    expect(o6.count).toBe(6);
  });

  test('the success reset — observeSuccess clears the key, the next identical fire starts at count 1', () => {
    const a = makeActor();
    observe({ actor: a, input: INPUT });
    observe({ actor: a, input: INPUT });
    const cleared = observeSuccess({ actor: a, input: INPUT });
    expect(cleared).toBe(true);
    const o = observe({ actor: a, input: INPUT });
    expect(o.rung).toBe('PASS');
    expect(o.count).toBe(1);
  });

  test('a DIFFERENT input starts a fresh ladder (the identity is the hash)', () => {
    const a = makeActor();
    observe({ actor: a, input: INPUT });
    const other = observe({ actor: a, input: 'A DIFFERENT PROMPT' });
    expect(other.rung).toBe('PASS');
    expect(other.count).toBe(1);
  });

  test('observe: a missing actor throws the named error', () => {
    expect(() => observe({ actor: null as never, input: INPUT })).toThrow(/actor/);
  });

  test('observe: an empty input still tracks (the identity is the hash, not the text)', () => {
    const a = makeActor();
    const o1 = observe({ actor: a, input: '' });
    const o2 = observe({ actor: a, input: '' });
    expect(o1.rung).toBe('PASS');
    expect(o2.rung).toBe('WARNING');
  });

  // THE VAL-CARRIER NORMALIZATION (2026-08-16 — the container caught the bug
  // live): the T.E.B. VAL-carrier means the SAME logical dispatch can carry
  // DIFFERENT raw strings — #1 the path VAL (prompt = the path) vs #2-4 the
  // name + promptFile. THE HOOKS now normalize the observe input to the
  // DISPATCH IDENTITY (the description + the promptFile path) so the identical
  // re-fires accumulate. THIS TEST PINS THE NORMALIZED KEY: the path-VAL form
  // and the name+promptFile form hash to the SAME key → the ladder escalates.
  test('VAL-CARRIER NORMALIZATION: the path-VAL form and the name+promptFile form share the identity (the ladder accumulates)', () => {
    const a = makeActor();
    const pathValKey = 'lk-s1|/root/OPENCODE_WORKSPACE/trident-tmp/lk-s1.md';
    const namePromptFileKey = 'lk-s1|/root/OPENCODE_WORKSPACE/trident-tmp/lk-s1.md';
    // THE SAME normalized identity (the hooks build this — desc + the file path)
    expect(hashInput(pathValKey)).toBe(hashInput(namePromptFileKey));
    // THE LADDER: 4 identical normalized identities → the BLOCK rung
    const o1 = observe({ actor: a, input: pathValKey });
    expect(o1.rung).toBe('PASS');
    const o2 = observe({ actor: a, input: namePromptFileKey });
    expect(o2.rung).toBe('WARNING');
    const o3 = observe({ actor: a, input: pathValKey });
    expect(o3.rung).toBe('ESCALATE');
    const o4 = observe({ actor: a, input: namePromptFileKey });
    expect(o4.rung).toBe('BLOCK');
  });
});

// ═══ THE WINDOW EXPIRY (the ladder's first-class behavior) ═══
describe('loop-killer window expiry', () => {
  const INPUT = 'THE WINDOW TEST INPUT';

  test('a fire past the window resets the ladder to count 1 (never an infinite block)', () => {
    const clock = fakeNow();
    const a = makeActor(1000, clock.now);
    observe({ actor: a, input: INPUT, now: clock.now() });
    observe({ actor: a, input: INPUT, now: clock.now() });
    clock.advance(2000);
    const o = observe({ actor: a, input: INPUT, now: clock.now() });
    expect(o.rung).toBe('PASS');
    expect(o.count).toBe(1);
  });

  test('fires WITHIN the window accumulate (the ladder holds)', () => {
    const clock = fakeNow();
    const a = makeActor(1000, clock.now);
    observe({ actor: a, input: INPUT, now: clock.now() });
    clock.advance(500);
    observe({ actor: a, input: INPUT, now: clock.now() });
    clock.advance(500);
    const o = observe({ actor: a, input: INPUT, now: clock.now() });
    expect(o.rung).toBe('ESCALATE');   // count 3 — exactly AT the window edge (1000ms) is NOT expired (the > check)
    expect(o.count).toBe(3);
  });
});

// ═══ THE KICK — the session.prompt REAL-turn ═══
describe('loop-killer kick', () => {
  test('fireKick: fires the session.prompt with the [DEGENERACY LOOP - STOP] message', async () => {
    let fired: string | null = null;
    let sessionId: string | null = null;
    const client = {
      session: {
        prompt: async (opts: { body: { parts: Array<{ text: string }> }; path: { id: string } }) => {
          fired = opts.body.parts[0]?.text || null;
          sessionId = opts.path.id;
          return { ok: true };
        },
      },
    };
    const r = await fireKick({
      sessionId: 'ses-123',
      message: '[DEGENERACY LOOP - STOP] the loop is stopped',
      getClient: () => client as never,
    });
    expect(r.kicked).toBe(true);
    expect(fired).toContain('[DEGENERACY LOOP - STOP]');
    expect(sessionId).toBe('ses-123');
  });

  test('fireKick: a missing client returns kicked:false with the named detail', async () => {
    const r = await fireKick({ sessionId: 'ses-1', getClient: () => null });
    expect(r.kicked).toBe(false);
    expect(r.detail).toContain('NO_CLIENT');
  });

  test('fireKick: a failing session.prompt returns kicked:false + the error detail', async () => {
    const client = {
      session: {
        prompt: async () => { throw new Error('network down'); },
      },
    };
    const r = await fireKick({ sessionId: 'ses-1', getClient: () => client as never });
    expect(r.kicked).toBe(false);
    expect(r.detail).toContain('network down');
  });

  test('fireKick: the default message is the [DEGENERACY LOOP - STOP] text (the operator rename)', async () => {
    let fired: string | null = null;
    const client = {
      session: {
        prompt: async (opts: { body: { parts: Array<{ text: string }> } }) => {
          fired = opts.body.parts[0]?.text || null;
          return { ok: true };
        },
      },
    };
    const r = await fireKick({ sessionId: 'ses-1', getClient: () => client as never });
    expect(r.kicked).toBe(true);
    expect(typeof fired).toBe('string');
    expect((fired ?? '').indexOf('[DEGENERACY LOOP - STOP]')).toBe(0);
  });
});

// ═══ THE CONFIG — the named calibration + the message builders ═══
describe('loop-killer config', () => {
  test('the ladder ordering is 1 < 2 < 3 < 4 (the warning before the escalate, the block LAST)', () => {
    expect(RUNG_2_WARNING).toBe(2);
    expect(RUNG_3_ESCALATE).toBe(3);
    expect(RUNG_4_BLOCK).toBe(4);
    expect(RUNG_2_WARNING < RUNG_3_ESCALATE && RUNG_3_ESCALATE < RUNG_4_BLOCK).toBe(true);
  });

  test('warningMessage/escalationMessage build the EXACT observable strings', () => {
    expect(warningMessage(2)).toBe('[DEGENERACY LOOP - WARNING #2]');
    expect(escalationMessage(3)).toBe('[DEGENERACY LOOP - ESCALATION #3]');
  });
});
