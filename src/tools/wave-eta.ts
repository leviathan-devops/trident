// src/tools/wave-eta.ts — the ETA intelligence (Part 6). THE OPERATOR'S RULING:
// "lets let the shadow intelligence decide this w/ proper decision making
// criteria". The ETA is the shadow brain's inference — the decision criteria
// (the template type, the workload, the archive actuals, the provider variance)
// assembled mechanically + the inference computed over them. The brain's call
// is the OPTIONAL expansion (the injected brain hook); the MECHANICAL inference
// is the always-available decision (the ISE law — the decision is a function of
// the evidence, never an elapsed-time division, never a hardcoded ladder).
// The cold-start fallback (confidence < 0.5 → the template-class baseline + the
// 50% buffer) + the adaptive recalc (the first completion's actuals replace the
// estimates) are the Part 6.2 contracts.

import type { WaveTrack } from './wave-tracker.ts';
import type { WaveManifest } from './wave-constants.ts';

export interface EtaEstimate {
  etaMs: number;
  confidence: number;                    // 0.0-1.0
  reasoning: string[];
}

// THE NAMED CALIBRATIONS (the Part 6.2 baselines — the template-class baseline:
// E: 10m, B: 20m — the operator's wave-duration evidence: generations 2-5m,
// subagent executions 5-25m):
export const E_TEMPLATE_BASELINE_MS = 10 * 60_000;
export const B_TEMPLATE_BASELINE_MS = 20 * 60_000;
export const COLD_START_BUFFER = 1.5;    // +50% buffer on the cold start
export const COLD_START_CONFIDENCE = 0.35; // the no-history confidence
export const ARCHIVE_CONFIDENCE = 0.85;  // the with-actuals confidence
export const PROVIDER_PENALTY_MS = 5 * 60_000; // a provider that 500'd → +5m
export const PER_FILE_OVERHEAD_MS = 15_000;  // ~15s per additional file read
// THE NAMED CAPS (the ISE anti-magic-ladder discipline — every clamp names its
// calibration):
export const MAX_FILES_FOR_OVERHEAD = 10;   // the file-count cap on the overhead calc
export const MAX_PROVIDER_PENALTY_FACTOR = 2; // the provider-penalty cap (2 × +5m)
export const MAX_RECALC_PACE_RATIO = 2;     // the adaptive recalc's pace clamp

export interface EtaInput {
  template: string;                      // E1-E4 | B1-B5
  fileCount: number;
  totalFileChars: number;                // the workload the subagent reads
}

export function templateBaselineMs(template: string): number {
  return (template || 'E2').toUpperCase().startsWith('B')
    ? B_TEMPLATE_BASELINE_MS
    : E_TEMPLATE_BASELINE_MS;
}

// THE MECHANICAL INFERENCE — the decision over the evidence. The archive's
// completed-wave actuals replace the template baselines when present (the
// real-world actuals refine the inference — Part 6.1). The provider variance
// (a provider that 500'd recently) extends the ETA (Part 6.1 + 21.2).
export function inferEta(
  inputs: EtaInput[],
  archive: WaveTrack[] = [],
  recentProviderErrors: number = 0,
): EtaEstimate {
  const reasoning: string[] = [];
  if (inputs.length === 0) {
    reasoning.push('no agents — the ETA defaults to the E-class baseline');
    return { etaMs: E_TEMPLATE_BASELINE_MS, confidence: 0, reasoning };
  }

  // The per-agent baselines + the workload overhead:
  let sum = 0;
  for (const inp of inputs) {
    const base = templateBaselineMs(inp.template);
    const overhead = Math.min(inp.fileCount, MAX_FILES_FOR_OVERHEAD) * PER_FILE_OVERHEAD_MS;
    sum += base + overhead;
    reasoning.push(
      inp.template + ' baseline ' + Math.round(base / 60000) + 'm + ' +
      inp.fileCount + ' file(s) (+' + Math.round(overhead / 60000) + 'm)',
    );
  }
  // The agents run in parallel — the wave's ETA is the MAX, not the sum:
  let etaMs = 0;
  for (const inp of inputs) {
    const base = templateBaselineMs(inp.template);
    const overhead = Math.min(inp.fileCount, MAX_FILES_FOR_OVERHEAD) * PER_FILE_OVERHEAD_MS;
    etaMs = Math.max(etaMs, base + overhead);
  }
  reasoning.push('parallel execution — the wave ETA = the max agent ETA (' + Math.round(etaMs / 60000) + 'm)');

  // The archive actuals — the real-world completions replace the estimates:
  let confidence = COLD_START_CONFIDENCE;
  const actuals = archive
    .filter((w) => w.status === 'complete' && w.dispatchedAt > 0)
    .map((w) => Math.max(0, (w.agents ? Date.now() - w.dispatchedAt : 0)))
    .filter((v) => v > 0);
  if (actuals.length > 0) {
    const avgActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const actualMin = Math.round(avgActual / 60000);
    reasoning.push('archive actuals: ' + actuals.length + ' completed wave(s), avg ' + actualMin + 'm');
    // The weighted blend — the archive's actuals dominate when they exist:
    etaMs = Math.round(etaMs * 0.3 + avgActual * 0.7);
    reasoning.push('blended ETA: ' + Math.round(etaMs / 60000) + 'm (70% archive actuals)');
    confidence = ARCHIVE_CONFIDENCE;
  } else {
    // THE COLD START (Part 6.2 — confidence < 0.5 → the baseline + the buffer):
    etaMs = Math.round(etaMs * COLD_START_BUFFER);
    reasoning.push('cold start (no archive) — the baseline + the 50% buffer: ' + Math.round(etaMs / 60000) + 'm');
  }

  // THE PROVIDER VARIANCE (Part 6.1 — a provider that 500'd recently gets a
  // longer ETA):
  if (recentProviderErrors > 0) {
    etaMs += PROVIDER_PENALTY_MS * Math.min(recentProviderErrors, MAX_PROVIDER_PENALTY_FACTOR);
    reasoning.push('provider variance: ' + recentProviderErrors + ' recent error(s) → +' + Math.round(PROVIDER_PENALTY_MS * Math.min(recentProviderErrors, MAX_PROVIDER_PENALTY_FACTOR) / 60000) + 'm');
  }

  return { etaMs, confidence: Math.min(1, confidence), reasoning };
}

// THE OPTIONAL BRAIN — the shadow-brain inference hook (the injected brain in
// the tests; the production may wire the shadow runner's transport). The ETA's
// decision NEVER depends on the brain — the mechanical inference is the fallback
// when the call fails (Part 6.2: "the brain's ETA call fails → the baseline
// fallback + the confidence 0").
export interface EtaBrain {
  infer(inputs: EtaInput[], archive: WaveTrack[]): Promise<EtaEstimate | null>;
}

// THE PUBLIC CONTRACT (Part 30.6): estimateWaveEta(agents, manifest) →
// Promise<{ etaMs, confidence, reasoning }>. NON-BLOCKING: the caller fires the
// promise WITHOUT awaiting it in the spawn path; the tracker entry awaits it
// asynchronously (Part 14 STEP 4). The default brain = null (the mechanical
// inference is the decision) — the caller may inject the shadow brain.
export async function estimateWaveEta(
  agents: Array<{ template: string; filepaths: string[] }>,
  _manifest?: WaveManifest,
  opts: { brain?: EtaBrain | null; archive?: WaveTrack[]; recentProviderErrors?: number } = {},
): Promise<EtaEstimate> {
  const inputs: EtaInput[] = (agents || []).map((a) => ({
    template: a.template || 'E2',
    fileCount: Array.isArray(a.filepaths) ? a.filepaths.length : 0,
    totalFileChars: 0,
  }));
  const archive = opts.archive ?? [];
  const recentProviderErrors = opts.recentProviderErrors ?? 0;
  const mechanical = inferEta(inputs, archive, recentProviderErrors);

  if (opts.brain) {
    try {
      const brainEta = await opts.brain.infer(inputs, archive);
      if (brainEta && brainEta.etaMs > 0) {
        return {
          etaMs: brainEta.etaMs,
          confidence: brainEta.confidence >= 0 && brainEta.confidence <= 1
            ? brainEta.confidence : mechanical.confidence,
          reasoning: [...mechanical.reasoning, 'brain inference: ' + brainEta.reasoning.join(' | ')],
        };
      }
    } catch (bErr) {
      // THE BRAIN FAILURE (Part 6.2 — "the brain's ETA call fails → the
      // baseline fallback + the confidence 0") — the mechanical decision wins.
      return { ...mechanical, confidence: 0 };
    }
  }
  return mechanical;
}

// THE ADAPTIVE RECALCULATION (Part 6.1 — "the FIRST agent completes → the
// actual pace → the ETA recalculates for the remaining agents"). The actuals
// replace the estimates; the remaining agents' ETA re-anchors from the real
// pace.
export function recalcEtaAfterFirstCompletion(
  wave: WaveTrack,
  completedActualMs: number,
  remainingInputs: EtaInput[],
): EtaEstimate {
  const mechanical = inferEta(remainingInputs, [{
    ...wave, status: 'complete', dispatchedAt: Date.now() - completedActualMs,
  } as WaveTrack], 0);
  const paceRatio = completedActualMs > 0
    ? (remainingInputs.length > 0 ? mechanical.etaMs / completedActualMs : 1)
    : 1;
  const recalcedMs = remainingInputs.length > 0
    ? Math.max(completedActualMs, Math.round(mechanical.etaMs * Math.min(MAX_RECALC_PACE_RATIO, paceRatio)))
    : 0;
  return {
    etaMs: recalcedMs,
    confidence: mechanical.confidence,
    reasoning: [
      ...mechanical.reasoning,
      'adaptive recalc: the first completion took ' + Math.round(completedActualMs / 60000) + 'm — the remaining ETA re-anchored to ' + Math.round(recalcedMs / 60000) + 'm',
    ],
  };
}

// THE BASELINE FALLBACK (Part 6.2 — the confidence < 0.5 default used by the
// execute's return when the ETA promise has not resolved yet):
export function baselineEtaMs(agents: Array<{ template: string; filepaths: string[] }>): number {
  return inferEta((agents || []).map((a) => ({
    template: a.template || 'E2',
    fileCount: Array.isArray(a.filepaths) ? a.filepaths.length : 0,
    totalFileChars: 0,
  }))).etaMs;
}
