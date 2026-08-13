// ═══ THE MAIN-SESSION SELF-HEAL — THE RED-TEAM BATTERY ═══
// (2026-08-13 — the operator's design: the main agent's generation can DROP
// mid-sentence — the runtime finalizes the partial (the ▣ timestamp renders)
// and the agent idles. The detector: the LAST assistant text is OBVIOUSLY
// incomplete + the message is FINALIZED. The kick: the minimal 'continue'.)
// THE BATTERY: the incompletion lexicon (the operator's mid-sentence example,
// the trailing '...', the dangling connective, the unclosed fence, the
// unbalanced brackets), the FINALIZED discriminator (a pending step-start is
// NEVER kicked — the slow-healthy case), the fail-safes, and the kick +
// cooldown.

import { describe, expect, test } from 'bun:test';
import {
  detectDroppedMainGeneration, kickMainSession, __resetHealState,
  type HealStreamReader, type HealClient,
} from '../tools/main-session-heal.ts';

function fakePage(parts: Array<{ type: string; text?: string }>) {
  return {
    ok: true,
    sessionId: 'main-sess',
    totalParts: parts.length,
    returnedParts: parts.length,
    moreAvailable: false,
    beforeId: null,
    parts: parts.map((p) => ({ type: p.type, text: p.text ?? '' })),
    lastTools: [],
    byteGrowth: 0,
  };
}

function makeReader(page: ReturnType<typeof fakePage>): HealStreamReader {
  return () => page;
}

describe('THE INCOMPLETION DETECTOR — the dropped-generation signature', () => {
  test('a COMPLETE message (terminal punctuation) is NOT dropped', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The wave registry fix is complete and verified. All 8 scenarios passed.' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('complete');
  });

  test('THE OPERATOR\'S EXAMPLE — a sentence cut mid-way is DROPPED', () => {
    // "look for obvious incompletions in the generated\n.\n.\n.\n" — the
    // sentence stops halfway, the tail is a word fragment with no terminal:
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'So the detector looks for obvious incompletions in the generated' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('mid-sentence-cut');
    expect(d.tail.length).toBeGreaterThan(0);   // the EVIDENCE rides the detection
  });

  test('a trailing ellipsis ("...") is DROPPED', () => {
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The provider cut the stream and the message just...' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('trailing-ellipsis');
  });

  test('a dangling connective ("...because") is DROPPED', () => {
    const r = makeReader(fakePage([
      { type: 'text', text: 'The re-fire was sanctioned because' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('dangling-connective');
  });

  test('an unclosed code fence is DROPPED', () => {
    const r = makeReader(fakePage([
      { type: 'text', text: 'The fix:\n```ts\nconst reg = {' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('unclosed-code-fence');
  });

  test('an unbalanced open bracket is DROPPED', () => {
    const r = makeReader(fakePage([
      { type: 'text', text: 'The registry shows the calls array with [accepted, failed' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('unbalanced-brackets');
  });
});

describe('THE FINALIZED DISCRIMINATOR — the slow-vs-frozen guard', () => {
  test('a PENDING step-start (a generation in flight) is NEVER dropped — the slow-healthy case', () => {
    // The 361s-success generation: the stream is ACTIVE (a step-start is the
    // newest part) — the detector must NOT kick it.
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

  test('an incomplete text WITH a step-finish (finalized + partial) IS dropped', () => {
    // THE DROPPED SIGNATURE: the newest part is the step-finish (the runtime
    // finalized the partial — the ▣ timestamp rendered) + the text is cut:
    const r = makeReader(fakePage([
      { type: 'step-start' },
      { type: 'text', text: 'The wave was dispatched and the registry shows' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(true);
    expect(d.reason).toBe('mid-sentence-cut');
  });
});

describe('THE FAIL-SAFES', () => {
  test('a broken stream read → NOT dropped (never a false kick)', () => {
    const r: HealStreamReader = () => ({ ok: false, sessionId: 'main-sess', totalParts: 0, returnedParts: 0, moreAvailable: false, beforeId: null, parts: [], lastTools: [], byteGrowth: 0, error: 'db absent' });
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBeNull();
  });

  test('no text part → NOT dropped', () => {
    const r = makeReader(fakePage([{ type: 'step-start' }, { type: 'step-finish' }]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('no-text');
  });

  test('a complete sentence ending with a colon (a deliberate intro) is NOT dropped', () => {
    const r = makeReader(fakePage([
      { type: 'text', text: 'The verification steps are:' },
      { type: 'step-finish' },
    ]));
    const d = detectDroppedMainGeneration('main-sess', { stream: r });
    expect(d.dropped).toBe(false);
    expect(d.reason).toBe('complete');
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
