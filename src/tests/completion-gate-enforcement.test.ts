// THE GATE ENFORCEMENT TESTS (COMPLETION_GATE_SPEC §2.4 — markComplete is
// gate-gated; the DECLARED class is authoritative; the re-evaluation loop).
// These prove MECHANICAL ENFORCEMENT: the tracker REFUSES completion for a
// pending/held gate — not a string, a THROW.
import './tracker-test-env.ts';
import * as path from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  WaveTracker,
  freshAgentTrack,
  computeDeclaredClass,
  setGatePassed,
  setGateHeld,
  setGateExempt,
} from '../tools/wave-tracker.ts';
import { evaluateCompletion } from '../tools/wave-completion-gate.ts';

describe('THE DECLARED-CLASS COMPUTATION (at dispatch, from the spec — never return text)', () => {
  test('B1 + .ts targets → TYPE_BATTERY; B1 + .html → RUNTIME; E1 → REPORT; B1 + .py → RUN', () => {
    expect(computeDeclaredClass(['/a/x.ts'], 'B1')).toBe('TYPE_BATTERY');
    expect(computeDeclaredClass(['/game/index.html'], 'B1')).toBe('RUNTIME');
    expect(computeDeclaredClass(['/a/x.ts'], 'E1')).toBe('REPORT');
    expect(computeDeclaredClass(['/a/main.py'], 'B1')).toBe('RUN');
  });
  test('THE INPUT-DOCS ESCAPE (the live bug): a B1 whose filepaths are .md specs but whose mission says implement .ts → TYPE_BATTERY (never DOC)', () => {
    // The exact shape from the live incident: b4-verify-update read the plan .md, built .ts
    expect(computeDeclaredClass(['MASTER_CONTEXT/PLAN_B_SPEC.md'], 'B1', 'Implement the verification module in src/v2/verify.ts with the update logic')).toBe('TYPE_BATTERY');
    expect(computeDeclaredClass(['docs/plan.md'], 'B1', 'Build the hunter rewire module — write the fix in the TypeScript source')).toBe('TYPE_BATTERY');
    expect(computeDeclaredClass([], 'B1', 'Implement the gate strategies and create the modules')).toBe('TYPE_BATTERY');
    expect(computeDeclaredClass([], 'B1')).toBe('TYPE_BATTERY');   // B + nothing → strictest
  });
  test('explicit docs-only B-agent → DOC (the narrow legitimate case)', () => {
    expect(computeDeclaredClass(['docs/README.md'], 'B1', 'Write the documentation file — markdown only, no code')).toBe('DOC');
  });
});

describe('markComplete IS MECHANICALLY GATE-GATED (the throw, not a string)', () => {
  test('a PENDING gate on a code-class agent → markComplete THROWS', () => {
    const wave = 'gate-enforce-' + Date.now();
    WaveTracker.registerWave({
      wave, names: ['builder-a'], sessionIds: ['ses-x'], dispatchedAt: Date.now(),
      etaMs: 60000, etaConfidence: 0,
      agents: { 'builder-a': { ...freshAgentTrack('ses-x'), declaredClass: 'TYPE_BATTERY', gateState: 'pending', gateHolds: 0 } },
    } as never);
    let threw = '';
    try { WaveTracker.markComplete(wave, 'builder-a'); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('[COMPLETION GATE] markComplete REFUSED');
    expect(threw).toContain('gateState=pending');
    // the agent was NOT completed by the refused call
    expect(WaveTracker.getWave(wave)?.agents['builder-a'].state).not.toBe('complete');
  });

  test('a HELD gate → markComplete THROWS (the hold is real)', () => {
    const wave = 'gate-hold-' + Date.now();
    WaveTracker.registerWave({
      wave, names: ['builder-b'], sessionIds: ['ses-y'], dispatchedAt: Date.now(),
      etaMs: 60000, etaConfidence: 0,
      agents: { 'builder-b': { ...freshAgentTrack('ses-y'), declaredClass: 'RUNTIME', gateState: 'pending', gateHolds: 0 } },
    } as never);
    const holds = setGateHeld(wave, 'builder-b');
    expect(holds).toBe(1);
    let threw = '';
    try { WaveTracker.markComplete(wave, 'builder-b'); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('markComplete REFUSED');
    expect(threw).toContain('gateState=held');
    // THE AGENT WAS NOT COMPLETED by the refused call (the re-evaluation loop — no stranding)
    expect(WaveTracker.getWave(wave)?.agents['builder-b'].state).not.toBe('complete');
  });

  test('gate PASSED → markComplete succeeds (the only sanctioned completion)', () => {
    const wave = 'gate-pass-' + Date.now();
    WaveTracker.registerWave({
      wave, names: ['builder-c'], sessionIds: ['ses-z'], dispatchedAt: Date.now(),
      etaMs: 60000, etaConfidence: 0,
      agents: { 'builder-c': { ...freshAgentTrack('ses-z'), declaredClass: 'TYPE_BATTERY', gateState: 'pending', gateHolds: 0 } },
    } as never);
    setGatePassed(wave, 'builder-c');
    let threwPass = '';
    try { WaveTracker.markComplete(wave, 'builder-c'); } catch (e) { threwPass = e instanceof Error ? e.message : String(e); }
    expect(threwPass).toBe('');
    expect(WaveTracker.getWave(wave)?.agents['builder-c'].state).toBe('complete');
  });

  test('EXEMPT/DOC/REPORT → markComplete succeeds (the misfire guards)', () => {
    const wave = 'gate-exempt-' + Date.now();
    WaveTracker.registerWave({
      wave, names: ['explorer-d', 'doc-e'], sessionIds: ['ses-e', 'ses-f'], dispatchedAt: Date.now(),
      etaMs: 60000, etaConfidence: 0,
      agents: {
        'explorer-d': { ...freshAgentTrack('ses-e'), declaredClass: 'REPORT', gateState: 'pending', gateHolds: 0 },
        'doc-e': { ...freshAgentTrack('ses-f'), declaredClass: 'DOC', gateState: 'pending', gateHolds: 0 },
      },
    } as never);
    let threw1 = ''; let threw2 = '';
    try { WaveTracker.markComplete(wave, 'explorer-d'); } catch (e) { threw1 = String(e); }
    try { WaveTracker.markComplete(wave, 'doc-e'); } catch (e) { threw2 = String(e); }
    expect(threw1).toBe('');
    expect(threw2).toBe('');
  });

  test('legacy agents (no gate fields) complete freely — zero regression on old waves', () => {
    const wave = 'gate-legacy-' + Date.now();
    WaveTracker.registerWave({
      wave, names: ['old-agent'], sessionIds: ['ses-old'], dispatchedAt: Date.now(),
      etaMs: 60000, etaConfidence: 0,
      agents: { 'old-agent': freshAgentTrack('ses-old') },  // no declaredClass/gateState
    } as never);
    let threw = '';
    try { WaveTracker.markComplete(wave, 'old-agent'); } catch (e) { threw = String(e); }
    expect(threw).toBe('');
  });
});

describe('THE GATE STATE MACHINE (declared class is authoritative)', () => {
  test('the Tetris incident: RUNTIME declared + grep-only return → HOLD → resubmission with run → PASS', () => {
    const grepOnly = `## VERIFICATION\n1: grep -ci "tetromino" index.html — 47\n2: test -f index.html && echo EXISTS\nverified — all keywords found`;
    let v = evaluateCompletion(grepOnly, 'RUNTIME', 0);
    expect(v.decision).toBe('HOLD');
    expect(v.remediation).toContain('EXECUTE');
    // the resubmission with harness evidence
    const resub = grepOnly + `\nnode harness.js\nVERDICT: RUNS — 120 frames pumped, LOAD: OK`;
    v = evaluateCompletion(resub, 'RUNTIME', 1);
    expect(v.decision).toBe('PASS');
  });

  test('the D1 kill: declared RUNTIME is authoritative — return text can NEVER flip it to exempt', () => {
    // a B-agent that built a game (declared RUNTIME at dispatch) — even if
    // the return text mentions nothing, the declared class rules
    const v = evaluateCompletion('done, see files', 'RUNTIME', 0);
    expect(v.decision).toBe('HOLD');
    expect(v.artifactClass).toBe('RUNTIME');
  });

  test('second insufficient hold → FAILED (the no-loop cap)', () => {
    const v = evaluateCompletion('done, see files', 'TYPE_BATTERY', 1);
    expect(v.decision).toBe('FAILED');
    expect(v.remediation).toContain('orchestrator decides');
  });

  test('battery evidence in TOOL RESULTS (not just text) → the evidence scan catches it', () => {
    const toolOutput = `tool result: bun test ./src/\n650 pass / 0 fail / 2632 expect`;
    const v = evaluateCompletion(toolOutput, 'TYPE_BATTERY', 0);
    expect(v.decision).toBe('PASS');
    expect(v.evidenceFound).toContain('EVIDENCE-BATTERY');
  });
});

describe('§3.3 THE SPEC-VALIDATOR REFUSAL (smoke plans die at generate)', () => {
  test('a B-agent with grep-only taskTargets → the error diagnostic', async () => {
    const { validateSpecFile } = await import('../tools/wave-spec.ts');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-verify-'));
    const specPath = path.join(box, '.trident', 'wave-spec.json');
    fs.mkdirSync(path.join(box, '.trident'), { recursive: true });
    // A B-agent with NO verification signal in targets/acceptance
    fs.writeFileSync(specPath, JSON.stringify({
      expectedCount: 1,
      agents: [{
        name: 'smoke-builder', template: 'B1',
        filepaths: ['/tmp/game/index.html'],
        mission: 'Build the game. '.repeat(8),
        knownContext: 'The context. '.repeat(8),
        doctrine: 'The doctrine. '.repeat(8),
        measurements: 'The numbers. '.repeat(8),
        acceptance: 'The game works. Files exist. Keywords present.',
        taskTargets: 'Task 1: create the file. Task 2: grep for keywords.',
        position: 'A builder in the wave. '.repeat(3),
      }],
    }), 'utf-8');
    const diags = validateSpecFile(specPath);
    const smoke = diags.find((d) => d.message.includes('smoke-verification'));
    expect(smoke).toBeDefined();
    expect(smoke?.severity).toBe('error');
    expect(smoke?.fix).toContain('tsc --noEmit');
  });

  test('a B-agent WITH battery/harness verification → no smoke diagnostic', async () => {
    const { validateSpecFile } = await import('../tools/wave-spec.ts');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-ok-'));
    const specPath = path.join(box, '.trident', 'wave-spec.json');
    fs.mkdirSync(path.join(box, '.trident'), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify({
      expectedCount: 1,
      agents: [{
        name: 'real-builder', template: 'B1',
        filepaths: ['/tmp/game/index.html'],
        mission: 'Build the game. '.repeat(8),
        knownContext: 'The context. '.repeat(8),
        doctrine: 'The doctrine. '.repeat(8),
        measurements: 'The numbers. '.repeat(8),
        acceptance: 'The harness run output pasted; the game executes.',
        taskTargets: 'Task 1: create. Task 2: execute under the harness and paste the run output.',
        position: 'A builder in the wave. '.repeat(3),
      }],
    }), 'utf-8');
    const diags = validateSpecFile(specPath);
    expect(diags.find((d) => d.message.includes('smoke-verification'))).toBeUndefined();
  });

  test('an E-agent with read-only targets → no smoke diagnostic (exempt)', async () => {
    const { validateSpecFile } = await import('../tools/wave-spec.ts');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-e-'));
    const specPath = path.join(box, '.trident', 'wave-spec.json');
    fs.mkdirSync(path.join(box, '.trident'), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify({
      expectedCount: 1,
      agents: [{
        name: 'explorer', template: 'E1',
        filepaths: ['/tmp/some/file.ts'],
        mission: 'Read the file. '.repeat(8),
        knownContext: 'The context. '.repeat(8),
        doctrine: 'The doctrine. '.repeat(8),
        measurements: 'The numbers. '.repeat(8),
        acceptance: 'The extraction report.',
        taskTargets: 'Task 1: read the file.',
        position: 'An explorer. '.repeat(3),
      }],
    }), 'utf-8');
    const diags = validateSpecFile(specPath);
    expect(diags.find((d) => d.message.includes('smoke-verification'))).toBeUndefined();
  });
});

describe('§3.1 THE CLASS-AWARE WEAVE (the verification commands in the prompt)', () => {
  test('the markers exist in the runner source (the class-aware commands shipped)', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'shadow', 'shadow-runner.ts'), 'utf-8');
    expect(src).toContain('THE CLASS-AWARE VERIFICATION COMMANDS');
    expect(src).toContain('completion gate REQUIRES it for code artifacts');
    expect(src).toContain('"Opens in a browser" is NOT evidence');
    expect(src).toContain('greps alone are refused');
  });

  test('the t1 identity carries the contract (§3.2)', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'subagents', 'trident-build', 'identity', 't1-prompt.ts'), 'utf-8');
    expect(src).toContain('GREPS ARE NOT VERIFICATION');
    expect(src).toContain('completion gate classifies your artifact');
  });
});
