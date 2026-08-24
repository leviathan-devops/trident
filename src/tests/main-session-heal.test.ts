// ═══ THE MAIN-SESSION SELF-HEAL — THE MODEL-CLASSIFIER BATTERY ═══
// (2026-08-13 the operator's design; 2026-08-16 the operator's OVERRIDE — the
// REGEX LADDER IS DEAD. The dropped-generation decision is the SHADOW MODEL's
// binary judgment: the last ~5 lines of prose → "dropped" or "complete".
// THE BATTERY: the FINALIZED discriminator (the slow-vs-frozen guard — the
// only mechanical pre-check left), the model-decision path (the injected
// judge — no network), the fail-safes (a failed judge NEVER kicks), and the
// kick + cooldown.)

import { describe, expect, test } from 'bun:test';
import {
  detectDroppedMainGeneration, classifyDroppedTail, kickMainSession, __resetHealState,
  type HealStreamReader, type HealClient, type DroppedJudge,
} from '../tools/main-session-heal.ts';

function fakePage(parts: Array<{ type: string; text?: string; completed?: boolean }>) {
  return {
    ok: true,
    sessionId: 'main-sess',
    totalParts: parts.length,
    returnedParts: parts.length,
    moreAvailable: false,
    beforeId: null,
    parts: parts.map((p) => ({ type: p.type, text: p.text ?? '', completed: p.completed ?? false })),
    lastTools: [],
    byteGrowth: 0,
  };
}

function makeReader(page: ReturnType<typeof fakePage>): HealStreamReader {
  return () => page;
}

// THE FAKE JUDGE — the model decision injected (no network in the tests):
function makeJudge(dropped: boolean): DroppedJudge {
  return async () => ({ dropped });
}

describe('THE FINALIZED DISCRIMINATOR — the slow-vs-frozen guard (the ONLY mechanical pre-check)', () => {
  test('a PENDING step-start (a generation in flight) is NEVER dropped — the slow-healthy case', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'reasoning', text: 'thinking...' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('in-flight');
  });

  test('a pending TOOL call (the agent is processing) is NEVER dropped', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'Let me check the registry file' },
      { type: 'tool' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('in-flight');
  });

  test('a STREAMING text part (no time.end) is NEVER dropped — the live generation', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The fix is being generated...', completed: false },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('in-flight');
  });

  test('a FINALIZED message (the step-finish present) → the pending-model state (the model decides)', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The wave registry fix is complete and verified.', completed: true },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('pending-model');   // the pre-check passed — the model decides
    expect(d.tail.length).toBeGreaterThan(0); // the EVIDENCE rides the pre-check
  });

  test('a FINALIZED message with NO text → no-text (never a model call)', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('no-text');
  });
});

describe('THE MODEL DECISION — the shadow-model binary classifier (the operator\'s override)', () => {
  test('the model says DROPPED → dropped:true (the kick fires)', async () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'So the detector looks for obvious incompletions in the generated...', completed: true },
      { type: 'step-finish' },
    ]));
    const d = await classifyDroppedTail('main-sess', { stream: r, judge: makeJudge(true) });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('model-dropped');
    expect(d.tail).toContain('generated...');   // the EVIDENCE — the tail analyzed
  });

  test('the model says COMPLETE → dropped:false (no kick — the misfire kill)', async () => {
    // THE MISFIRE CASE: a legit report ending with a plain word (the operator's
    // "this is not this retarded" — the old regex flagged it as a cut). The
    // MODEL sees the natural ending → complete → NO kick.
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The full build is production-ready', completed: true },
      { type: 'step-finish' },
    ]));
    const d = await classifyDroppedTail('main-sess', { stream: r, judge: makeJudge(false) });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('model-complete');
  });

  test('the model call FAILS → fail-safe (never a false kick)', async () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The message is...', completed: true },
      { type: 'step-finish' },
    ]));
    const failingJudge: DroppedJudge = async () => { throw new Error('provider dead'); };
    const d = await classifyDroppedTail('main-sess', { stream: r, judge: failingJudge });
    expect(d.dropped).toBe(false);   // the fail-safe — a dead judge NEVER kicks
  });

  test('the model returns an empty answer → fail-safe (never a false kick)', async () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The message is...', completed: true },
      { type: 'step-finish' },
    ]));
    const emptyJudge: DroppedJudge = async () => ({ dropped: false });
    const d = await classifyDroppedTail('main-sess', { stream: r, judge: emptyJudge });
    expect(d.dropped).toBe(false);
  });
});

describe('THE FAIL-SAFES', () => {
  test('a broken stream read → NOT dropped (never a false kick)', () => {
    const r: HealStreamReader = () => ({ ok: false, sessionId: 'main-sess', totalParts: 0, returnedParts: 0, moreAvailable: false, beforeId: null, parts: [], lastTools: [], byteGrowth: 0, error: 'db absent' });
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBeNull();
  });

  test('an in-flight message NEVER reaches the model (the pre-check short-circuits)', async () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'reasoning', text: 'thinking...' },
    ]));
    let judgeCalled = false;
    const spyJudge: DroppedJudge = async () => { judgeCalled = true; return { dropped: true }; };
    const d = await classifyDroppedTail('main-sess', { stream: r, judge: spyJudge });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('in-flight');
    expect(judgeCalled).toBe(false);   // the model was NEVER called
  });
});

describe('THE KICK — the minimal "continue" chat message', () => {
  test('appendPrompt("continue") + submitPrompt — the reactivation', async () => {
    __resetHealState();
    const calls: string[] = [];
    const client: HealClient = {
      tui: {
        appendPrompt: async (opts) => { calls.push('append:' + opts.body.text); return { data: true }; },
        submitPrompt: async () => { calls.push('submit'); return { data: true }; },
      },
    };
    const kr = await kickMainSession(client, 'main-sess');
    expect(kr.kicked).toBe(true);
    expect(calls).toEqual(['append:continue', 'submit']);
  });

  test('the COOLDOWN — at most one kick per 10m (the anti-kick-storm)', async () => {
    __resetHealState();
    let appends = 0;
    const client: HealClient = {
      tui: {
        appendPrompt: async () => { appends++; return { data: true }; },
        submitPrompt: async () => ({ data: true }),
      },
    };
    const k1 = await kickMainSession(client, 'main-sess');
    expect(k1.kicked).toBe(true);
    const k2 = await kickMainSession(client, 'main-sess');
    expect(k2.kicked).toBe(false);
    expect(k2.error).toBe('cooldown');
    expect(appends).toBe(1);
  });

  test('a failed append → NOT kicked + the error named (the loud-fail)', async () => {
    __resetHealState();
    const client: HealClient = {
      tui: {
        appendPrompt: async () => { throw new Error('tui dead'); },
        submitPrompt: async () => ({ data: true }),
      },
    };
    const kr = await kickMainSession(client, 'main-sess');
    expect(kr.kicked).toBe(false);
    expect(kr.error).toContain('tui dead');
  });
});
