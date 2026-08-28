// THE MISFIRE REGRESSION PIN: the calc-builder's REAL harness output (verbatim
// from the live session DB) MUST match EVIDENCE-RUN — the exact false-FAILED
// the operator caught. If this test fails, the gate misfires again.
import { scanReturn } from '../tools/wave-verification-lexicon.ts';
import { evaluateCompletion } from '../tools/wave-completion-gate.ts';
import { describe, expect, test } from 'bun:test';

const REAL_HARNESS_OUTPUT = `HTML bytes: 587
SCRIPT EXTRACTED bytes: 341
EVAL: success, typeof add = function
Pumping rAF 120 frames...
rAF pumped, total callbacks registered: 0
No keydown listeners registered
TEST 1: 2+3=5: a="2" b="3" => result="5" expected="5" PASS
TEST 2: empty a -> error: a="" b="3" => result="error" expected="error" PASS
TEST 9: boundary 0+0: a="0" b="0" => result="0" expected="0" PASS
--- FINAL ---
ALL TESTS PASS`;

const REAL_FINAL_TEXT = `EXECUTION EVIDENCE — RUNTIME VERIFICATION (gate-required):
Artifact: /tmp/gate-test-2/calc.html (587 bytes, sha256 e78b0b5cede9886ccc88be628523e9c3d154c1c72111131f20240ff7556a3e28)
Extracted <script> and executed under node with DOM/canvas/rAF stubs.
${REAL_HARNESS_OUTPUT}
Verdict: add() computes correctly, error paths handle empty/null, boundary cases pass.`;

describe('THE MISFIRE REGRESSION (the calc-builder false-FAILED)', () => {
  test('the REAL harness output → EVIDENCE-RUN fires (the tool-result evidence)', () => {
    const r = scanReturn(REAL_HARNESS_OUTPUT);
    expect(r.evidence).toContain('EVIDENCE-RUN');
  });
  test('the REAL final text (with sha) → EVIDENCE-SHA fires', () => {
    const r = scanReturn(REAL_FINAL_TEXT);
    expect(r.evidence).toContain('EVIDENCE-SHA');
  });
  test('the combined evidence → the gate PASSES (declared RUNTIME, holds=1 — the resubmission)', () => {
    const combined = REAL_FINAL_TEXT + '\n' + REAL_HARNESS_OUTPUT;
    const v = evaluateCompletion(combined, 'RUNTIME', 1);
    expect(v.decision).toBe('PASS');
    expect(v.evidenceFound).toContain('EVIDENCE-RUN');
  });
  test('the DB part shape: state.output is where tool outputs live — the read probes it', () => {
    // The exact part shape from the live DB: { type:'tool', state: { output: '...' } }
    // The cron's evidence read maps tool parts via state.output ?? state.metadata.output
    // This test pins the LEXICON against that real shape.
    const dbShapeToolOutput = `node <<'NODE'\n...stub harness...\nNODE`;
    const r = scanReturn(dbShapeToolOutput + '\n' + REAL_HARNESS_OUTPUT);
    expect(r.evidence).toContain('EVIDENCE-RUN');
  });
});
