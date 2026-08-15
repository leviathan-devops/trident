// ═══ SHADOW-HEALTH TESTS (2026-08-14 — the SHADOW-BRAIN 3-FIX PLAN, F1) ═══
// The measured stall window: the rolling first-event latency drives the
// adaptive window (avg × 3, bounded [45s, 5m]) — kills the 45s knife-edge
// that aborted healthy 35-50s generations under load.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import {
  SHADOW_HEALTH_FLOOR_MS,
  SHADOW_HEALTH_CEILING_MS,
  SHADOW_HEALTH_MULTIPLIER,
  measuredShadowWindowMs,
  recordShadowLatency,
  resetShadowHealth,
} from '../tools/shadow/shadow-health.ts';

afterEach(() => {
  resetShadowHealth('test-provider');
  resetShadowHealth('opencode-go');
});

describe('shadow-health — THE MEASURED STALL WINDOW (F1)', () => {
  test('NO measurement → the FLOOR (45s — the pre-fix default, a dead provider fails fast)', () => {
    resetShadowHealth('opencode-go');
    expect(measuredShadowWindowMs('opencode-go')).toBe(SHADOW_HEALTH_FLOOR_MS);
  });

  test('the documented 35-50s first-event → the window = avg × 3 (the slow-but-alive case)', () => {
    resetShadowHealth('test-provider');
    // the 384K wave prompts document a 35-50s first-event latency:
    recordShadowLatency(40000, 'test-provider');
    recordShadowLatency(45000, 'test-provider');
    const w = measuredShadowWindowMs('test-provider');
    // avg ≈ 42.5s × 3 ≈ 127.5s — well above the 45s knife-edge, under the 5m ceiling:
    expect(w).toBeGreaterThan(SHADOW_HEALTH_FLOOR_MS);
    expect(w).toBeLessThanOrEqual(SHADOW_HEALTH_CEILING_MS);
    expect(w).toBe(Math.round(42500 * SHADOW_HEALTH_MULTIPLIER)); // ≈ 127500
  });

  test('a genuinely-dead provider (the avg climbs) is CAPPED by the 5m ceiling', () => {
    resetShadowHealth('test-provider');
    for (let i = 0; i < 8; i++) recordShadowLatency(290000, 'test-provider'); // ~5m stalls
    expect(measuredShadowWindowMs('test-provider')).toBe(SHADOW_HEALTH_CEILING_MS);
  });

  test('a fast provider (the 1s probe) stays at/near the FLOOR (never below)', () => {
    resetShadowHealth('test-provider');
    recordShadowLatency(1000, 'test-provider');
    recordShadowLatency(1500, 'test-provider');
    // avg ≈ 1.2s × 3 ≈ 3.6s — clamped UP to the 45s floor (a real provider is
    // never given a sub-floor window):
    expect(measuredShadowWindowMs('test-provider')).toBe(SHADOW_HEALTH_FLOOR_MS);
  });

  test('the SUSTAINED 40-50s first-event (the real 384K reality) adapts the window UP', () => {
    resetShadowHealth('test-provider');
    // the 384K wave prompts document a 35-50s first-event latency — the
    // sustained case (NOT a single spike, which the floor correctly absorbs):
    for (let i = 0; i < 8; i++) recordShadowLatency(i % 2 === 0 ? 45000 : 40000, 'test-provider');
    // avg ≈ 42.5s × 3 ≈ 127.5s — the window climbs well above the 45s knife-edge:
    const w = measuredShadowWindowMs('test-provider');
    expect(w).toBeGreaterThan(SHADOW_HEALTH_FLOOR_MS * 2);   // > 90s — the knife-edge is dead
    expect(w).toBeLessThanOrEqual(SHADOW_HEALTH_CEILING_MS);
  });

  test('a SINGLE spike after fast history is ABSORBED by the floor (one slow call ≠ a slow provider)', () => {
    resetShadowHealth('test-provider');
    for (let i = 0; i < 8; i++) recordShadowLatency(1000, 'test-provider');
    recordShadowLatency(45000, 'test-provider');   // the one-off spike
    // the rolling average weights the recent N — one spike of 9 samples keeps
    // the avg low → the floor holds (the provider is still fast):
    expect(measuredShadowWindowMs('test-provider')).toBe(SHADOW_HEALTH_FLOOR_MS);
  });

  test('the F2 backoff math: the retry window = 2× the measured window', () => {
    resetShadowHealth('test-provider');
    recordShadowLatency(45000, 'test-provider');
    const retryWindow = measuredShadowWindowMs('test-provider') * 2;
    // the 2× window must stay under the total-call ceiling (15m = 900000ms):
    expect(retryWindow).toBeGreaterThan(SHADOW_HEALTH_FLOOR_MS);
    expect(retryWindow).toBeLessThanOrEqual(900000);
  });
});
