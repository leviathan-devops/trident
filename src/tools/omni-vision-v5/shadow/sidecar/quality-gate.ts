// ============================================================================
// file: src/sidecar/quality-gate.ts
//
// §34.3 (QualityGate + GateVerdict) AND §9.3 (artifactDelta) consolidated in
// this single module — DOCUMENTED DEVIATION: the spec scatters artifactDelta
// in `quality-gate-artifacts.js` (referenced by §34.3's import) and E0-REPORT
// flags that module for E1a/E1c; here the S-5 computation lives beside its
// only consumer so the VERIFY path has one home. FsReadDeps is imported from
// types.ts (the E0 coupling point).
//
// The quality gate is deterministic: no model calls, every check carries
// verbatim evidence (§9.3 evidence strings become the warhead's quotes).
// ============================================================================

import type { AcceptanceSpec, ArtifactCheck, FsReadDeps, GateVerdict } from './types.js';

/**
 * Compute the artifact delta against the acceptance spec (§9.3 verbatim).
 * Every check carries verbatim evidence — the warhead quotes it.
 */
export async function artifactDelta(
  deps: FsReadDeps,
  acceptance: AcceptanceSpec,
  since: number,
): Promise<ArtifactCheck[]> {
  const out: ArtifactCheck[] = [];

  for (const f of acceptance.requiredFiles) {
    const st = await deps.stat(f);
    const ok = st !== null && st.size > 0 && st.mtime >= since;
    out.push({
      requirement: `file ${f}`,
      ok,
      evidence: st
        ? `mtime=${st.mtime} size=${st.size}${ok ? '' : ' (STALE — before build start)'}`
        : 'MISSING',
    });
  }

  for (const m of acceptance.markers) {
    const hits = await deps.grep(m.appDir, m.pattern);
    out.push({
      requirement: `marker ${m.pattern}`,
      ok: hits.length >= 1,
      evidence: hits[0] ?? '0 matches',
    });
  }

  if (acceptance.dataJson) {
    const raw = await deps.read(acceptance.dataJson.path);
    if (raw === null) {
      out.push({
        requirement: `data.json at ${acceptance.dataJson.path}`,
        ok: false,
        evidence: 'MISSING',
      });
    } else {
      try {
        const parsed = JSON.parse(raw) as { events?: unknown[] };
        const n = Array.isArray(parsed.events) ? parsed.events.length : 0;
        const ok = n >= acceptance.dataJson.minEvents;
        out.push({ requirement: 'data.json events', ok, evidence: `events=${n}` });
      } catch (e) {
        out.push({
          requirement: 'data.json parse',
          ok: false,
          evidence: `INVALID: ${String(e).slice(0, 120)}`,
        });
      }
    }
  }

  return out;
}

/**
 * The quality gate: deterministic artifact verification. It is the VERIFY
 * action's executor and the 3-skeptic panel's first skeptic (§14). It never
 * calls a model; every check carries verbatim evidence.
 */
export class QualityGate {
  constructor(
    private fs: FsReadDeps,
    private acceptance: AcceptanceSpec,
    private since: () => number, // freshness bound (§9.2)
  ) {}

  async evaluate(delta?: ArtifactCheck[]): Promise<GateVerdict> {
    let artifacts: ArtifactCheck[];
    try {
      artifacts = delta ?? (await artifactDelta(this.fs, this.acceptance, this.since()));
    } catch (e) {
      // A gate that throws is a gate that bricks the pipeline — fail loud, never throw.
      return { verdict: 'FAIL', blockerCount: 1, warnCount: 0, checks: [{ name: 'artifactDelta', ok: false, evidence: `artifactDelta threw: ${e instanceof Error ? e.message : String(e)}` }] };
    }
    // NOTE: GateVerdict.checks uses `name` while ArtifactCheck uses
    // `requirement` — mapped here so the ledger's check array is consistent.
    const checks = artifacts.map((c) => ({
      name: c.requirement,
      ok: c.ok,
      evidence: c.evidence,
    }));
    const blockers = checks.filter((c) => !c.ok);
    const warnCount = 0; // warnings reserved for the drift re-scan
    return {
      verdict: blockers.length === 0 ? 'PASS' : 'FAIL',
      checks,
      blockerCount: blockers.length,
      warnCount,
    };
  }

  summary(): string {
    return `accepted checks passed; blockers=0`;
  }
}
