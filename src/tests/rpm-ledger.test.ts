// ═══ RPM LEDGER TESTS — the wave-aware rate budget (2026-08-21 — the
// operator's hybrid: shared token bucket + TTL exile + observation rings).
// ADVERSARIAL-FIRST: every test attacks a failure mode (bucket exhaustion,
// exile propagation, refill timing, unlimited passthrough, abort, wiring) —
// deterministic via the injected clock/sleepFn, zero network. ═══

import { describe, expect, test } from 'bun:test';
import { EXILE_MS, RpmLedger, RPM_PROFILES } from '../tools/shadow/rpm-ledger.ts';
import { ShadowAgent } from '../tools/shadow/shadow-agent.ts';

/** THE FAKE CLOCK — deterministic time travel: tests move `now` manually; the
 *  injected sleepFn advances the clock instead of really waiting. */
function fakeClock() {
  let now = 1_000_000;
  return {
    now: () => now,
    advance: (ms: number) => { now += ms; },
    sleep: async (ms: number) => { now += ms; },
  };
}

describe('rpm-ledger — the token bucket', () => {
  test('BUCKET: nvidia admits exactly capacity requests in one burst, then goes dry', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-bucket', { clock: fc.now, sleepFn: fc.sleep });
    for (let i = 0; i < RPM_PROFILES.nvidia.capacity; i++) {
      expect(await l.acquire('nvidia')).toBe(true);
    }
    // THE 41st request: dry → waits maxWaitMs (the fake sleep advances the
    // clock but 6s of refill at 40/60s = only +4 tokens... wait: 6000ms ×
    // 40/60/1000 = 4 tokens — so it REFILLS and admits! Use maxWaitMs=0 to
    // prove the denial itself.)
    expect(await l.acquire('nvidia', { maxWaitMs: 0 })).toBe(false);
  });

  test('REFILL: the continuous refill re-admits after the window rolls', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-refill', { clock: fc.now, sleepFn: fc.sleep });
    for (let i = 0; i < RPM_PROFILES.nvidia.capacity; i++) {
      await l.acquire('nvidia');
    }
    expect(l.admission('nvidia')).toBe('dry');
    // ONE full reset window (60s × 40/60 = 40 tokens) → full bucket again
    fc.advance(60_000);
    expect(l.admission('nvidia')).toBe('ok');
    expect(await l.acquire('nvidia', { maxWaitMs: 0 })).toBe(true);
  });

  test('PARTIAL-REFILL: acquire WAITS for tokens when the window is mid-roll', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-partial', { clock: fc.now, sleepFn: fc.sleep });
    for (let i = 0; i < RPM_PROFILES.nvidia.capacity; i++) {
      await l.acquire('nvidia');
    }
    // dry NOW, but 7.5s of refill = +5 tokens → the bounded wait RIDES the
    // refill instead of fleeing to the fallback rung.
    expect(await l.acquire('nvidia', { maxWaitMs: 7500 })).toBe(true);
  });
});

describe('rpm-ledger — the shared TTL exile (the option-2 half-open breaker)', () => {
  test('EXILE: ONE observed 429 exiles the provider instantly', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-exile', { clock: fc.now, sleepFn: fc.sleep });
    expect(l.admission('nvidia')).toBe('ok');
    l.record429('nvidia');
    expect(l.admission('nvidia')).toBe('exiled');
    // acquire NEVER waits out an exile (even a 60s budget returns instantly)
    expect(await l.acquire('nvidia', { maxWaitMs: 60_000 })).toBe(false);
  });

  test('SHARED: the exile is visible to EVERY reader of the ledger (wave awareness)', () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-shared', { clock: fc.now, sleepFn: fc.sleep });
    // agent A observes the 429…
    l.record429('nvidia');
    // …agent B (a DIFFERENT ShadowAgent sharing THIS ledger) sees it with zero
    // observations of its own — no blind re-burn.
    expect(l.admission('nvidia')).toBe('exiled');
  });

  test('HALF-OPEN: the exile expires after EXILE_MS — the rung slots back in', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-halfopen', { clock: fc.now, sleepFn: fc.sleep });
    l.record429('nvidia');
    fc.advance(EXILE_MS - 1000);
    expect(l.admission('nvidia')).toBe('exiled');
    fc.advance(2000);   // past the TTL
    expect(l.admission('nvidia')).toBe('ok');   // bucket refilled during exile too
  });

  test('RE-EXILE: a second observed 429 extends the window from NOW (no stacking drift)', () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-reexile', { clock: fc.now, sleepFn: fc.sleep });
    l.record429('nvidia');
    fc.advance(40_000);
    l.record429('nvidia');   // re-observed before expiry
    fc.advance(10_000);      // 50s after the FIRST, 10s after the SECOND
    expect(l.admission('nvidia')).toBe('exiled');   // the second window governs
    fc.advance(EXILE_MS);
    expect(l.admission('nvidia')).toBe('ok');
  });
});

describe('rpm-ledger — the unlimited passthrough + observability', () => {
  test('UNLIMITED: unprofiled providers admit forever, consume nothing', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-unlimited', { clock: fc.now, sleepFn: fc.sleep });
    for (let i = 0; i < 500; i++) {
      expect(await l.acquire('some-future-provider')).toBe(true);
    }
    const snap = l.snapshot();
    const or = snap.providers.find((p) => p.provider === 'some-future-provider');
    expect(or?.capacity).toBeNull();
    expect(or?.tokensLeft).toBe(Infinity);
  });

  test('SNAPSHOT: the observability feed carries counts + exile state', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-snap', { clock: fc.now, sleepFn: fc.sleep });
    await l.acquire('nvidia');
    l.recordSuccess('nvidia');
    l.recordSuccess('nvidia');
    l.record429('inferx');
    const snap = l.snapshot();
    const nv = snap.providers.find((p) => p.provider === 'nvidia');
    const ix = snap.providers.find((p) => p.provider === 'inferx');
    expect(nv?.successCount120s).toBe(2);
    expect(ix?.admission).toBe('exiled');
    expect(ix?.exiledForMs).toBeGreaterThan(0);
  });

  test('ABORT: the signal kills a dry-wait immediately', async () => {
    const fc = fakeClock();
    const l = new RpmLedger('t-abort', { clock: fc.now, sleepFn: fc.sleep });
    for (let i = 0; i < RPM_PROFILES.nvidia.capacity; i++) await l.acquire('nvidia');
    const ac = new AbortController();
    ac.abort();
    expect(await l.acquire('nvidia', { maxWaitMs: 60_000, signal: ac.signal })).toBe(false);
  });
});

describe('rpm-ledger — the ShadowAgent wiring', () => {
  test('INJECTED: a wave ledger is shared verbatim into the agent', () => {
    const l = new RpmLedger('wave-test-shared');
    const a = new ShadowAgent(undefined, { ledger: l });
    expect(a.ledger).toBe(l);
  });

  test('SOLO DEFAULT: no injection → a private ledger (identical code path)', () => {
    const a = new ShadowAgent();
    const b = new ShadowAgent();
    expect(a.ledger).toBeDefined();
    expect(a.ledger).not.toBe(b.ledger);
  });
});
