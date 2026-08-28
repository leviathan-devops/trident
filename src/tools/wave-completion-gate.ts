/**
 * THE COMPLETION GATE (2026-08-26 — COMPLETION_GATE_SPEC §2, the operator's
 * "I SAID TO BUILD A PROPER FUCKING EVENT GATE"). The T.E.B. machine at the
 * markComplete boundary: interceptor (the cron's completion paths) → lexicon
 * (wave-verification-lexicon) → state machine (this module) → enforcer (the
 * HOLD — markComplete not called) → remediation (the named-fix steer).
 *
 * Pure decision logic — the cron wires the side effects (state flip, steer,
 * toast). Fail-state = HOLD, never a default pass.
 */
import {
  scanReturn,
  REQUIRED_EVIDENCE,
  type ArtifactClass,
} from './wave-verification-lexicon.ts';

export interface GateVerdict {
  decision: 'PASS' | 'HOLD' | 'FAILED';
  artifactClass: ArtifactClass;
  evidenceFound: string[];
  smokeFound: string[];
  remediation: string;
  triad: { pattern: string; state: string; evidence: string };
}

/** The remediation text per artifact class (spec §2.5 — copy-pasteable). */
function remediationFor(cls: ArtifactClass, smoke: string[]): string {
  const what = smoke.length > 0
    ? 'Your return carries TEXT-ONLY verification (greps/file checks/claims) — no execution evidence.'
    : 'Your return carries no recognizable verification evidence.';
  if (cls === 'TYPE_BATTERY') {
    return `[COMPLETION GATE — HOLD] ${what} Your artifact class is TYPE_BATTERY (code). REQUIRED: run tsc --noEmit AND the test battery (bun test <paths>) and PASTE both outputs in your return (exit codes + pass/fail counts). A grep proves a keyword exists; it does not prove the code compiles or the tests pass. Resubmit with the execution evidence.`;
  }
  if (cls === 'RUNTIME') {
    return `[COMPLETION GATE — HOLD] ${what} Your artifact class is RUNTIME (html/game/ui). REQUIRED: EXECUTE the artifact — extract the <script>, run it under node with DOM/canvas/rAF stubs (the stub-harness pattern: proxy getContext, stub localStorage, pump requestAnimationFrame ~120 frames, fire keydown listeners), and PASTE the run output including any errors. "Opens in a browser" is a claim, not evidence. Resubmit with the execution evidence.`;
  }
  if (cls === 'RUN') {
    return `[COMPLETION GATE — HOLD] ${what} Your artifact class is RUN (python). REQUIRED: execute it (python3 <artifact> [args]) and PASTE the output — including any traceback. Resubmit with the execution evidence.`;
  }
  return `[COMPLETION GATE — HOLD] ${what} Paste the actual verification command outputs in your return.`;
}

/** THE STATE MACHINE (COMPLETION_GATE_SPEC §2.3).
 *  @param evidenceText   the agent's final text + tool-result outputs (where
 *                        command OUTPUTS live — the evidence signatures scan
 *                        BOTH)
 *  @param declaredClass  the artifact class computed AT DISPATCH from the
 *                        spec's filepaths + template (the KNOWN targets —
 *                        never guessed from return text)
 *  @param priorHolds     how many times this agent has been HOLD'd already
 */
export function evaluateCompletion(
  evidenceText: string,
  declaredClass: ArtifactClass,
  priorHolds: number,
): GateVerdict {
  const { evidence, smoke } = scanReturn(evidenceText);

  // EXEMPT classes: DOC (greps fine) + REPORT (no writes — explore agents)
  if (REQUIRED_EVIDENCE[declaredClass] === null) {
    return {
      decision: 'PASS', artifactClass: declaredClass, evidenceFound: evidence, smokeFound: smoke,
      remediation: '',
      triad: { pattern: 'EXEMPT-CLASS', state: `class=${declaredClass}`, evidence: `declared at dispatch` },
    };
  }

  // The evidence check: does any EVIDENCE-* member satisfy the class?
  const required = REQUIRED_EVIDENCE[declaredClass]!;
  const satisfied = evidence.filter((e) => required.includes(e));
  const triadBase = { pattern: satisfied.length > 0 ? satisfied.join('+') : (smoke[0] ?? 'NONE'), state: `class=${declaredClass}`, evidence: `evidence=[${evidence}] smoke=[${smoke}]` };

  if (satisfied.length > 0) {
    return { decision: 'PASS', artifactClass: declaredClass, evidenceFound: evidence, smokeFound: smoke, remediation: '', triad: triadBase };
  }

  // HOLD (first) or FAILED (the resubmission is still smoke-only — spec §2.3)
  const decision = priorHolds >= 1 ? 'FAILED' : 'HOLD';
  return {
    decision, artifactClass: declaredClass, evidenceFound: evidence, smokeFound: smoke,
    remediation: decision === 'FAILED'
      ? `[COMPLETION GATE — FAILED] Second return without execution evidence (artifact class ${declaredClass}). The agent is marked FAILED — the orchestrator decides: re-steer with explicit harness instructions, or respawn.`
      : remediationFor(declaredClass, smoke),
    triad: triadBase,
  };
}
