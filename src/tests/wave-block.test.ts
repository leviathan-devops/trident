// ═══ WAVE-BLOCK TESTS — the castration (Part 3.4 + Part 19). THE ZERO-HINT
// discipline: the REAL assessTaskBlock + the REAL loadPromptFileForDispatch +
// the REAL TASK_BLOCK_MESSAGE. The adversarial cases: the promptFile outside
// the tmp folder refused, the empty file refused, the loader's DPL1 validation.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  assessTaskBlock, TASK_BLOCK_MESSAGE, loadPromptFileForDispatch, isInsideTmpDir,
} from '../tools/wave-dispatch.ts';

let sandbox = '';

afterEach(() => {
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { void e; }
});

function makeDpl1Prompt(): string {
  // A structurally-complete dispatch prompt (the DPL1 checks pass) — the 125+
  // floor with the structure complete (6/6 markers, paths, expansion, commands):
  const lines: string[] = [];
  lines.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.');
  lines.push('THE MISSION: the extraction.');
  lines.push('');
  lines.push('THE ACCEPTANCE CRITERIA:');
  lines.push('- the exports enumerated');
  lines.push('- the anchors cited');
  lines.push('');
  lines.push('THE READING ORDER:');
  lines.push('1. ' + __filename);
  lines.push('2. ' + path.join(path.dirname(__filename), '..', 'tools', 'wave-dispatch.ts'));
  lines.push('3. ' + path.join(path.dirname(__filename), '..', 'tools', 'wave-tracker.ts'));
  lines.push('');
  lines.push('THE KNOWN CONTEXT: the real modules.');
  lines.push('');
  lines.push('THE OPERATOR\'S DOCTRINE (VERBATIM): "THE FILES ARE THE ONLY GROUND TRUTH."');
  lines.push('');
  lines.push('THE KNOWN MEASUREMENTS TABLE:');
  lines.push('| measurement | target | pass bar |');
  lines.push('| modules | 10 | present |');
  lines.push('');
  lines.push('THE PER-TASK EXPANSIONS:');
  // The per-task expansion — each task with the 4-part block, enough volume
  // to clear the 125-line floor with the structure complete:
  const tasks = ['the extraction', 'the anchors', 'the failure modes', 'the verification', 'the return'];
  for (const task of tasks) {
    lines.push('Task A — ' + task + '.');
    lines.push('  WHAT: the ' + task + ' of the module, the role, the exported surface, the internal structure.');
    lines.push('  HOW: read the file fully (2500-line passes); list the exports; describe the logic; grep each cited symbol.');
    lines.push('  WHY: the orchestrator must know the surface before specifying changes; the surgical edits target these exact lines.');
    lines.push('  EXPECTED: the per-file block: path, role, exports, key functions, line anchors, the verification table.');
    lines.push('Task B — the ' + task + ' anchors + data contracts.');
    lines.push('  WHAT: the file:line anchors + the data contracts at the boundaries of the module under test.');
    lines.push('  HOW: trace the call chains to the consumers; read the error branches; note the empty catches and the silent fallbacks.');
    lines.push('  WHY: a wrong anchor derails the build; the audit gate flags silent failures; the extraction surfaces them.');
    lines.push('  EXPECTED: the verification table: spec claim → current line → verdict (FOUND/MOVED/ABSENT).');
    lines.push('Task C — the ' + task + ' failure modes.');
    lines.push('  WHAT: the error paths + the failure handling in the module, the boundary conditions, the concurrency edges.');
    lines.push('  HOW: read the error branches; test the empty inputs, the nulls, the boundary values; note the recover-or-propagate discipline.');
    lines.push('  WHY: the build\'s honesty requirements ban the empty catches and the always-passing tests; the errors must be loud.');
    lines.push('  EXPECTED: the failure-mode list per file: the error, the handling, the verdict, the adversarial scenario.');
    lines.push('');
  }
  lines.push('THE CONSTRAINTS:');
  lines.push('- the shadow backend unchanged');
  lines.push('- the canon docs untouched');
  lines.push('- every bash command a SINGLE command');
  lines.push('- the container test is the orchestrator\'s action');
  lines.push('- no bash output redirection; no pipe chains');
  lines.push('- the dist\'s sha256 recorded for the orchestrator\'s verification');
  lines.push('');
  lines.push('THE READING-ORDER CONTRACT (the files read BEFORE any execution):');
  lines.push('the ground-truth set is the files the mission names; the context args are BELIEF — verify against the files, never conform to them.');
  lines.push('');
  lines.push('THE KNOWN-CONTEXT CONTRACT (the measured state):');
  lines.push('the modules compile; the battery is green; the probes\' verdicts are recorded honestly; every claim carries the mechanical evidence.');
  lines.push('');
  lines.push('THE VERIFICATION (run ALL + return the outputs):');
  lines.push('bun test src/tests/wave-block.test.ts');
  lines.push('tsc --noEmit');
  lines.push('sha256sum dist/index.js');
  lines.push('');
  lines.push('THE RETURN FORMAT:');
  lines.push('1. THE MODULES — the 10 files\' paths + the key contracts (one line each)');
  lines.push('2. THE REWIRE — the rename + the alias + the execute path\'s summary');
  lines.push('3. THE HOOKS — the block + the tier-1 + the wipe + the registry + the cron (with the line anchors)');
  lines.push('4. THE BATTERY — the test counts (the pass/fail per file)');
  lines.push('5. THE PROBES — the verdicts (P1 V1-V6, P2 V1-V3, P3 V1-V3) + the evidence');
  lines.push('6. THE BUILD — the dist\'s sha256 + the build output\'s tail');
  lines.push('7. THE HONEST NOTES — the deviations, the blocked commands, the surprises');
  lines.push('EVERY claim carries the mechanical evidence. The files are the only ground truth.');
  return lines.join('\n');
}

describe('wave-block — the castration (Part 3.4)', () => {
  test('a task call with a hand-written prompt throws the exact block message', () => {
    const msg = assessTaskBlock({ subagent_type: 'trident_explore', prompt: 'EXECUTE THE FOLLOWING: read the files.' });
    expect(msg).toBe(TASK_BLOCK_MESSAGE);
    expect(msg).toBe('[TRIDENT TOOL BLOCK] use trident-wave-manager for any and all subagent dispatches');
  });

  test('a task call with a text arg (the other prompt key) also blocks', () => {
    const msg = assessTaskBlock({ text: 'a hand-written dispatch' });
    expect(msg).toBe(TASK_BLOCK_MESSAGE);
  });

  test('a task call WITHOUT a prompt (the promptFile form) passes to the loader', () => {
    const msg = assessTaskBlock({ subagent_type: 'trident_explore', promptFile: path.join(os.tmpdir(), 'x.md') });
    expect(msg).toBeNull();               // the loader's channel — never blocked
  });

  test('a task call with NEITHER prompt nor promptFile passes (the empty form hits the other gates)', () => {
    const msg = assessTaskBlock({ subagent_type: 'trident_explore' });
    expect(msg).toBeNull();
    expect(assessTaskBlock({})).toBeNull();
    expect(assessTaskBlock(null as unknown as Record<string, unknown>)).toBeNull();
  });

  test('the promptFile loader validates the loaded content (the DPL1 checks) before the injection', () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-block-'));
    const file = path.join(sandbox, 'good.md');
    fs.writeFileSync(file, makeDpl1Prompt(), 'utf-8');
    const loaded = loadPromptFileForDispatch(file, sandbox);
    expect(loaded).toContain('EXECUTE THE FOLLOWING');
    expect(loaded.split('\n').length).toBeGreaterThan(40);
  });

  test('ADVERSARIAL: the promptFile pointing outside the tmp folder is refused', () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-block-'));
    const outside = path.join(os.tmpdir(), 'outside-prompt-' + Date.now() + '.md');
    fs.writeFileSync(outside, makeDpl1Prompt(), 'utf-8');
    let threw = false;
    let errMsg = '';
    try {
      loadPromptFileForDispatch(outside, sandbox);
    } catch (e) {
      threw = true;
      errMsg = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toBe(true);
    expect(errMsg).toContain('must live inside');
    try { fs.rmSync(outside, { force: true }); } catch (e) { void e; }
  });

  test('ADVERSARIAL: the empty promptFile is refused', () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-block-'));
    const file = path.join(sandbox, 'empty.md');
    fs.writeFileSync(file, '   \n', 'utf-8');
    let threw = false;
    try {
      loadPromptFileForDispatch(file, sandbox);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('ADVERSARIAL: a DPL1-thin loaded file is refused by the loader', () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-block-'));
    const file = path.join(sandbox, 'thin.md');
    fs.writeFileSync(file, 'EXECUTE THE FOLLOWING: read the files.', 'utf-8');
    let threw = false;
    let errMsg = '';
    try {
      loadPromptFileForDispatch(file, sandbox);
    } catch (e) {
      threw = true;
      errMsg = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toBe(true);
    expect(errMsg).toContain('DPL1');
  });

  test('isInsideTmpDir confines the loader to the closed loop', () => {
    const base = path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp');
    expect(isInsideTmpDir(path.join(base, 'agent-a.md'))).toBe(true);
    expect(isInsideTmpDir(base)).toBe(true);
    expect(isInsideTmpDir('/etc/passwd')).toBe(false);
    expect(isInsideTmpDir(base + 'x' + path.sep + 'evil.md')).toBe(false);  // a prefix is NOT the dir
  });
});
