// ═══ WAVE-ETA TESTS — the shadow-brain ETA (Part 6 + Part 19). THE ZERO-HINT
// discipline: the REAL inferEta + the REAL estimateWaveEta + the REAL adaptive
// recalc in-process with runtime-built evidence. The adversarial case: the
// brain's ETA call fails → the baseline fallback + the confidence 0.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import {
  inferEta, estimateWaveEta, recalcEtaAfterFirstCompletion,
  E_TEMPLATE_BASELINE_MS, B_TEMPLATE_BASELINE_MS, COLD_START_CONFIDENCE,
  templateBaselineMs, baselineEtaMs,
} from '../tools/wave-eta.ts';
import { WaveTracker, freshAgentTrack, type WaveTrack } from '../tools/wave-tracker.ts';

function archiveWaveWithActuals(durationMs: number, wave = 'wave-arch-1'): WaveTrack {
  const agents: Record<string, ReturnType<typeof freshAgentTrack>> = {};
  const sid = 'sess-arch';
  agents['a'] = freshAgentTrack(sid);
  return {
    wave, names: ['a'], sessionIds: [sid],
    dispatchedAt: Date.now() - durationMs,
    etaMs: durationMs, etaConfidence: 0.85, status: 'complete',
    agents, checkIns: { count: 0, lastAt: null, nextDue: null }, todoRowId: null,
  };
}

describe('wave-eta — the shadow-brain ETA (Part 6)', () => {
  test('the inference inputs assemble: the template type + the file counts + the archive actuals + the provider variance', () => {
    const inputs = [
      { template: 'E1', fileCount: 2, totalFileChars: 5000 },
      { template: 'B3', fileCount: 5, totalFileChars: 12000 },
    ];
    const est = inferEta(inputs, [archiveWaveWithActuals(18 * 60_000)], 1);
    expect(est.etaMs).toBeGreaterThan(0);
    expect(est.confidence).toBeGreaterThanOrEqual(COLD_START_CONFIDENCE);
    expect(est.reasoning.length).toBeGreaterThan(1);
    // The reasoning names the classes:
    expect(est.reasoning.join(' ')).toContain('B3');
    expect(est.reasoning.join(' ')).toContain('archive');
    expect(est.reasoning.join(' ')).toContain('provider');
  });

  test('the B-template baseline exceeds the E-template baseline', () => {
    expect(templateBaselineMs('B1')).toBe(B_TEMPLATE_BASELINE_MS);
    expect(templateBaselineMs('E1')).toBe(E_TEMPLATE_BASELINE_MS);
    expect(B_TEMPLATE_BASELINE_MS).toBeGreaterThan(E_TEMPLATE_BASELINE_MS);
  });

  test('the cold-start fallback: confidence < 0.5 → the template-class baseline (E 10m / B 20m) + the 50% buffer', () => {
    // No archive → the cold start:
    const est = inferEta([{ template: 'E1', fileCount: 0, totalFileChars: 0 }], [], 0);
    expect(est.confidence).toBeLessThan(0.5);
    // The buffer: the E baseline (10m) × 1.5 = 15m:
    expect(est.etaMs).toBeGreaterThanOrEqual(Math.round(E_TEMPLATE_BASELINE_MS * 1.5));
    // The B-class cold start is bigger:
    const bEst = inferEta([{ template: 'B1', fileCount: 0, totalFileChars: 0 }], [], 0);
    expect(bEst.etaMs).toBeGreaterThan(est.etaMs);
  });

  test('the adaptive recalc: the first completion\'s actuals replace the estimates for the remaining agents', () => {
    const wave = archiveWaveWithActuals(0, 'wave-recalc');
    const remaining = [
      { template: 'B3', fileCount: 3, totalFileChars: 6000 },
    ];
    const recalced = recalcEtaAfterFirstCompletion(wave, 22 * 60_000, remaining);
    expect(recalced.etaMs).toBeGreaterThan(0);
    expect(recalced.reasoning.join(' ')).toContain('adaptive recalc');
    expect(recalced.reasoning.join(' ')).toContain('22m');
  });

  test('the non-blocking contract: the eta promise resolves independently of the spawn path', async () => {
    const promise = estimateWaveEta(
      [{ template: 'E2', filepaths: ['/x/a.ts'] }, { template: 'B1', filepaths: ['/x/b.ts'] }],
      undefined, { archive: [] },
    );
    // The promise resolves WITHOUT the caller awaiting the spawn path — it
    // settles on its own:
    const est = await Promise.race([
      promise,
      new Promise<never>((_r, reject) => setTimeout(() => reject(new Error('the ETA promise hung — the non-blocking contract broken')), 5000)),
    ]);
    expect(est.etaMs).toBeGreaterThan(0);
    expect(est.confidence).toBeGreaterThanOrEqual(0);
  });

  test('the tracker archive\'s actuals refine the cold-start baseline', () => {
    // Cold start (no archive): 10m × 1.5 = 15m for E1:
    const cold = inferEta([{ template: 'E1', fileCount: 0, totalFileChars: 0 }], [], 0);
    // With a 25m actual in the archive, the ETA blends toward the reality:
    const warm = inferEta([{ template: 'E1', fileCount: 0, totalFileChars: 0 }], [archiveWaveWithActuals(25 * 60_000)], 0);
    expect(warm.confidence).toBeGreaterThan(cold.confidence);
    expect(warm.etaMs).toBeGreaterThanOrEqual(cold.etaMs);   // the 25m actual dominates
  });

  test('ADVERSARIAL: the brain\'s ETA call fails → the baseline fallback + the confidence 0', async () => {
    const failingBrain = {
      infer: async () => { throw new Error('SHADOW_BRAIN_HTTP_500'); },
    };
    const est = await estimateWaveEta(
      [{ template: 'B2', filepaths: ['/x/b.ts'] }],
      undefined, { brain: failingBrain, archive: [] },
    );
    // The brain failure → the mechanical baseline carries + confidence 0:
    expect(est.etaMs).toBeGreaterThan(0);
    expect(est.confidence).toBe(0);
  });

  test('ADVERSARIAL: a brain returning a malformed ETA falls back to the mechanical decision', async () => {
    const badBrain = {
      infer: async () => ({ etaMs: -5, confidence: 2, reasoning: ['junk'] }),
    };
    const est = await estimateWaveEta(
      [{ template: 'E1', filepaths: ['/x/a.ts'] }],
      undefined, { brain: badBrain, archive: [] },
    );
    expect(est.etaMs).toBeGreaterThan(0);   // the negative brain output ignored
    expect(est.confidence).toBeGreaterThanOrEqual(0);
  });

  test('baselineEtaMs matches the execute\'s placeholder contract', () => {
    const placeholder = baselineEtaMs([{ template: 'E1', filepaths: ['/x/a.ts'] }]);
    expect(placeholder).toBeGreaterThan(0);
    const direct = inferEta([{ template: 'E1', fileCount: 1, totalFileChars: 0 }], [], 0);
    expect(placeholder).toBe(direct.etaMs);
  });

  test('the tracker integration: the wave entry carries the eta + confidence', () => {
    WaveTracker.clear();
    const waveId = WaveTracker.registerWave({
      wave: 'wave-eta-track', names: ['a'], sessionIds: ['s'],
      dispatchedAt: Date.now(), etaMs: 15 * 60_000, etaConfidence: 0.85,
      agents: { a: freshAgentTrack('s') },
    });
    const w = WaveTracker.getWave(waveId)!;
    expect(w.etaMs).toBe(15 * 60_000);
    expect(w.etaConfidence).toBe(0.85);
    WaveTracker.clear();
  });
});
