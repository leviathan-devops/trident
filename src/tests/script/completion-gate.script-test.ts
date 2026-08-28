// THE COMPLETION-GATE SCRIPT TEST (2026-08-26 — the script-test skill's
// first suite): REAL modules, the REAL incident replay (the Tetris false
// completion), the adversarial battery, the legit-pass proofs. Executed via
// `bun run` — the exit code is the verdict; the table prints to stdout.
//
// THE INCIDENT BEING PINNED: two B1 agents returned "complete" with grep-only
// verification; Tetris crashed on load. This script proves the gate HOLDS
// that return and names the harness remedy — and that real evidence passes.
import { evaluateCompletion } from '../../tools/wave-completion-gate.ts';
import { classifyArtifact, scanReturn, extractWriteSet } from '../../tools/wave-verification-lexicon.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

console.log('═══ THE COMPLETION-GATE SCRIPT TEST ═══\n');

// ── THE REAL INCIDENT REPLAYS (verbatim from the live agent returns) ──
console.log('1. THE TETRIS INCIDENT REPLAY (the false completion that motivated the gate)');
const tetrisReturn = `## DIFF SUMMARY
- tetris/index.html — CREATED (new file, 434 lines).
Anchors: index.html:12 rotate logic present, index.html:40 ghost piece present
## VERIFICATION OUTPUTS
1: test -f /tmp/game-build-test/tetris/index.html && echo "EXISTS" || echo "MISSING" — EXISTS
2: grep -ci "tetromino|piece" /tmp/game-build-test/tetris/index.html — 47
3: grep -n "rotate|rotation" /tmp/game-build-test/tetris/index.html — found
9: grep -n "pause|PAUSE" — found
12: sha256sum /tmp/game-build-test/tetris/index.html /tmp/game-build-test/tetris/README.md`;
// NOTE: the sha256 line above has no actual hash → not EVIDENCE-SHA. If a
// real hash lands in a return, EVIDENCE-SHA fires (additive) — tested below.
const tetrisTargets = ['/tmp/game-build-test/tetris/index.html', '/tmp/game-build-test/tetris/README.md'];
let v = evaluateCompletion(tetrisReturn, 'RUNTIME', 0);
check('the grep-only game return → HOLD (not complete)', v.decision === 'HOLD', `got ${v.decision}`);
check('the artifact class is RUNTIME', v.artifactClass === 'RUNTIME', `got ${v.artifactClass}`);
check('the remediation names the harness (execute, DOM stubs, paste output)', v.remediation.includes('EXECUTE') && v.remediation.includes('stub'), v.remediation.slice(0, 80));
check('the smoke patterns fired', v.smokeFound.length > 0, v.smokeFound.join(','));

console.log('\n2. THE SECOND RETURN (still smoke-only) → FAILED (the orchestrator decides, no loop)');
v = evaluateCompletion(tetrisReturn, 'RUNTIME', 1);
check('priorHolds=1 + smoke-only again → FAILED', v.decision === 'FAILED', `got ${v.decision}`);
check('the FAILED remediation names the escalation', v.remediation.includes('orchestrator decides'), v.remediation.slice(0, 80));

console.log('\n3. THE GOOD RESUBMISSION (real harness output pasted) → PASS');
const goodReturn = tetrisReturn + `
13: node /tmp/game-runtime-test.js /tmp/tetris-extracted.js
    LOAD: OK — no runtime errors on script evaluation
    FRAMES: OK — 120 frames pumped, no errors in the game loop
    INPUT: OK — keydown handlers fired without errors
    VERDICT: RUNS (all stubs survived; no exceptions)`;
v = evaluateCompletion(goodReturn, 'RUNTIME', 1);
check('harness run output → EVIDENCE-RUN fires', v.evidenceFound.includes('EVIDENCE-RUN'), v.evidenceFound.join(','));
check('RUNTIME + EVIDENCE-RUN → PASS', v.decision === 'PASS', `got ${v.decision}`);
check('greps + run evidence → PASS (greps additive, never fatal)', v.smokeFound.length > 0 && v.decision === 'PASS');

// ── THE ZERO-MISFIRE BATTERY (legit evidence passes in every class) ──
console.log('\n4. THE ZERO-MISFIRE BATTERY (every legit evidence class passes)');
const batteryReturn = `## VERIFICATION
$ bun test ./src/
   650 pass / 0 fail / 2631 expect() calls
$ tsc --noEmit — exit 0, no errors`;
v = evaluateCompletion(batteryReturn, 'TYPE_BATTERY', 0);
check('TS artifact + battery → PASS', v.decision === 'PASS' && v.artifactClass === 'TYPE_BATTERY', `${v.decision}/${v.artifactClass}`);

const containerReturn = `## RESULTS
Scenario S1 PASS — passToken matched in tool-result context (container-test-results.json written)`;
v = evaluateCompletion(containerReturn, 'TYPE_BATTERY', 0);
check('TS artifact + container evidence → PASS', v.decision === 'PASS', v.decision);

const buildReturn = `$ bun build src/index.ts --outdir dist — Bundled 1548 modules, 18.6 MB, exit 0`;
v = evaluateCompletion(buildReturn, 'TYPE_BATTERY', 0);
check('TS artifact + build output → PASS', v.decision === 'PASS', v.decision);

const pyReturn = `$ python3 /tmp/game-build-test/main.py --verify
   VERDICT: OK — 42 checks passed, 0 errors`;
v = evaluateCompletion(pyReturn, 'RUN', 0);
check('py artifact + executed output → PASS', v.decision === 'PASS' && v.artifactClass === 'RUN', `${v.decision}/${v.artifactClass}`);

// ── THE EXEMPTIONS ──
console.log('\n5. THE EXEMPTIONS (explore agents + docs never demand runtime)');
const exploreReturn = `## THE REGION MAP — the per-file extraction blocks with anchors...
(6 files mapped; no writes performed — read-only extraction)`;
v = evaluateCompletion(exploreReturn, 'REPORT', 0);
check('no writes → REPORT → exempt PASS', v.decision === 'PASS' && v.artifactClass === 'REPORT', `${v.decision}/${v.artifactClass}`);

const docReturn = `## THE README
Wrote /tmp/game-build-test/README.md documenting controls + scoring.
grep -c "controls" README.md → 5`;
v = evaluateCompletion(docReturn, 'DOC', 0);
check('DOC artifact + greps → PASS (no runtime demanded)', v.decision === 'PASS' && v.artifactClass === 'DOC', `${v.decision}/${v.artifactClass}`);

// ── THE FAIL-STATE LAW ──
console.log('\n6. THE FAIL-STATE LAW (INCONCLUSIVE never defaults to pass)');
v = evaluateCompletion('', 'TYPE_BATTERY', 0);
check('EMPTY return on a code artifact → HOLD (never pass)', v.decision === 'HOLD', v.decision);
v = evaluateCompletion('done', 'TYPE_BATTERY', 0);
check('bare "done" + code artifact → HOLD', v.decision === 'HOLD', v.decision);

// ── THE LEXICON MEMBERS (the typed shapes) ──
console.log('\n7. THE LEXICON (detection sanity)');
const s = scanReturn('bun test → 10 pass / 0 fail');
check('battery detector fires', s.evidence.includes('EVIDENCE-BATTERY'));
const s2 = scanReturn('tsc --noEmit — exit 0, no errors');
check('tsc detector fires', s2.evidence.includes('EVIDENCE-TSC'));
const s3 = classifyArtifact(['/a/x.ts', '/a/y.test.ts']);
check('classifyArtifact ts → TYPE_BATTERY', s3 === 'TYPE_BATTERY');
const s4 = classifyArtifact(['/a/game.html']);
check('classifyArtifact html → RUNTIME', s4 === 'RUNTIME');
const s5 = classifyArtifact([]);
check('classifyArtifact empty → REPORT (exempt)', s5 === 'REPORT');
const ws = extractWriteSet('wrote /tmp/x/game.html and /tmp/x/README.md', []);
check('extractWriteSet finds the html + md', ws.some((f: string) => f.endsWith('.html')) && ws.some((f: string) => f.endsWith('.md')), ws.join(','));

console.log(`\n═══ RESULT: ${pass} pass / ${fail} fail ═══`);
process.exit(fail > 0 ? 1 : 0);
