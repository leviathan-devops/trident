// ═══ DOC-DENSITY-STATE TESTS (2026-08-14 — the v4 stateful gate's pins) ═══
// The per-file state machine + the filter registry + the accumulated-state
// enforcement. The pins: the ordered resolution (path → name → content), the
// draft/build allow (the chunked protocol unbroken), the accumulated-floor
// completion (the operator's directive), the marker/structural completion, the
// thin-write throw, the INCONCLUSIVE warn-skip, the store's isolation.
// THE ZERO-HINT discipline: the REAL module — no mocks.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DOC_FILTER_REGISTRY, resolveDocFilter, computeAccumulation, detectCompletion,
  evaluateDocWrite, runDocDensityGate, loadDocRow, __resetDocStore,
} from '../tools/doc-density-state.ts';

const SANDBOX = path.join(os.tmpdir(), 'dd-state-' + Date.now());
fs.mkdirSync(SANDBOX, { recursive: true });

afterEach(() => {
  __resetDocStore();
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* cleanup */ }
  fs.mkdirSync(SANDBOX, { recursive: true });
});

const N_LINES = (n: number, seed = 'line'): string =>
  Array.from({ length: n }, (_, i) => seed + ' ' + (i + 1) + ' — the accumulated content line').join('\n');

describe('doc-density-state — THE ORDERED RESOLUTION (path → name → content)', () => {
  test('L1 PATH: the TMP domain is exempt (the tool-generated)', () => {
    const f = resolveDocFilter('/home/u/OPENCODE_WORKSPACE/trident-tmp/wave-a1.md', 'x');
    expect(f.id).toBe('TMP');
    expect(f.exempt).toBe(true);
  });
  test('L1 PATH: the wave-audit domain → AUDIT (100 + VERDICT/coverage)', () => {
    const f = resolveDocFilter('/home/u/proj/.trident/wave-audit/wave-1.md', 'x');
    expect(f.id).toBe('AUDIT');
    expect(f.floor).toBe(100);
  });
  test('L1 PATH: the canon domain → CANON (the context_management docs)', () => {
    const f = resolveDocFilter('/home/u/proj/context_management/BUILD_STATE.md', 'x');
    expect(f.id).toBe('CANON');
  });
  test('L1 PATH: the POST-COMPACTION canon override → SPEC 3000', () => {
    const f = resolveDocFilter('/home/u/proj/context_management/POST-COMPACTION_PROMPT.md', 'x');
    expect(f.id).toBe('SPEC');
    expect(f.floor).toBe(3000);
  });
  test('L1 PATH: the ship package → SHIP + the BUILD_REPORT override → COMPLETION 2000', () => {
    const f = resolveDocFilter('/home/u/Ship_Packages/PKG/BUILD_REPORT.md', 'x');
    expect(f.id).toBe('COMPLETION');
    expect(f.floor).toBe(2000);
  });
  test('L2 NAME: the SPEC/PLAN names → SPEC 3000', () => {
    expect(resolveDocFilter('/proj/OVERHAUL_SPEC.md', 'x').floor).toBe(3000);
    expect(resolveDocFilter('/proj/THE_PLAN.md', 'x').floor).toBe(3000);
  });
  test('L2 NAME: the DEBUG_LOG → LOG 100', () => {
    expect(resolveDocFilter('/proj/DEBUG_LOG_V3.md', 'x').id).toBe('LOG');
  });
  test('L3 CONTENT: the silent-name fallback → the weighted lexicon', () => {
    const content = '# THE DOC\nFR-1 the requirement\nacceptance criteria\npass criteria\nverification protocol';
    const f = resolveDocFilter('/proj/untitled.md', content);
    expect(f.id).toBe('SPEC');
  });
  test('L3 GENERIC: no markers, no hints → the 200 floor', () => {
    const f = resolveDocFilter('/proj/untitled.md', 'plain text only');
    expect(f.id).toBe('GENERIC');
    expect(f.floor).toBe(200);
  });
});

describe('doc-density-state — THE ACCUMULATED STATE (the operator\'s directive)', () => {
  test('the new write: the accumulated content = the written content', () => {
    const acc = computeAccumulation({ filePath: path.join(SANDBOX, 'a.md'), content: N_LINES(30), isEdit: false });
    expect(acc.accumulatedLines).toBe(30);
    expect(acc.ambiguous).toBe(false);
  });
  test('the edit: the accumulated content = the file + the replace', () => {
    const fp = path.join(SANDBOX, 'b.md');
    fs.writeFileSync(fp, N_LINES(40), 'utf-8');
    const acc = computeAccumulation({ filePath: fp, content: 'the appended conclusion', isEdit: true, oldString: 'line 40 — the accumulated content line' });
    expect(acc.accumulatedLines).toBe(40); // the replace keeps the line count
    expect(acc.ambiguous).toBe(false);
  });
  test('the multi-occurrence edit → the ambiguous flag (the INCONCLUSIVE candidate)', () => {
    const fp = path.join(SANDBOX, 'c.md');
    fs.writeFileSync(fp, 'repeat\nrepeat\nrepeat\n', 'utf-8');
    const acc = computeAccumulation({ filePath: fp, content: 'replacement', isEdit: true, oldString: 'repeat' });
    expect(acc.ambiguous).toBe(true);
    expect(acc.accumulatedLines).toBeGreaterThanOrEqual(3); // the estimate
  });
});

describe('doc-density-state — THE COMPLETION DETECTION', () => {
  test('the marker → completed (the explicit override)', () => {
    const acc = computeAccumulation({ filePath: 'x.md', content: '<!-- DOC-COMPLETE -->', isEdit: false });
    const c = detectCompletion(acc, { id: 'GENERIC', floor: 200, structural: [] });
    expect(c.completed).toBe(true);
    expect(c.signal).toBe('marker');
  });
  test('the accumulated state at/over the floor → completed (the operator\'s directive)', () => {
    const acc = computeAccumulation({ filePath: 'x.md', content: N_LINES(210), isEdit: false });
    const c = detectCompletion(acc, { id: 'GENERIC', floor: 200, structural: [] });
    expect(c.completed).toBe(true);
    expect(c.signal).toBe('accumulated-floor');
  });
  test('under the floor + no marker + no closing structure → NOT completed (the draft)', () => {
    const acc = computeAccumulation({ filePath: 'x.md', content: N_LINES(50), isEdit: false });
    const c = detectCompletion(acc, { id: 'GENERIC', floor: 200, structural: [] });
    expect(c.completed).toBe(false);
  });
});

describe('doc-density-state — THE GATE DECISIONS (the enforcement)', () => {
  test('the thin write (15 lines) → the draft-min THROW (the v2/v3 behavior kept)', () => {
    const e = evaluateDocWrite({ filePath: path.join(SANDBOX, 'thin.md'), content: N_LINES(15), isEdit: false });
    expect(e.verdict).toBe('throw');
    expect(e.message).toContain('[DOC DENSITY GATE]');
    expect(e.message).toContain('min 20');
  });
  test('the 100-line unmarked draft → ALLOW (the chunked protocol unbroken)', () => {
    const e = evaluateDocWrite({ filePath: path.join(SANDBOX, 'draft.md'), content: N_LINES(100), isEdit: false });
    expect(e.verdict).toBe('allow');
    expect(e.state).toBe('DRAFTING');
  });
  test('the 210-line GENERIC (accumulated >= the 200 floor) → COMPLETE → VERIFIED allow', () => {
    const e = evaluateDocWrite({ filePath: path.join(SANDBOX, 'done.md'), content: N_LINES(210), isEdit: false });
    expect(e.verdict).toBe('allow');
    expect(e.state).toBe('VERIFIED');
  });
  test('the marker-finalized SPEC under 3000 → the floor THROW', () => {
    const e = evaluateDocWrite({ filePath: path.join(SANDBOX, 'spec.md'), content: N_LINES(150) + '\n<!-- DOC-COMPLETE -->', isEdit: false });
    expect(e.verdict).toBe('throw');
    expect(e.message).toContain('SPEC document under-specified');
    expect(e.message).toContain('min 3000');
  });
  test('the AUDIT-path doc (VERDICT + coverage, 90 lines) → the AUDIT floor (100) → the THROW', () => {
    const e = evaluateDocWrite({ filePath: '/proj/.trident/wave-audit/wave-x.md', content: N_LINES(90) + '\nVERDICT: PASS\ncoverage: 100', isEdit: false });
    expect(e.verdict).toBe('throw');
    expect(e.message).toContain('AUDIT document under-specified');
  });
  test('the TMP path → the exempt allow (the tool-generated never gated)', () => {
    const e = evaluateDocWrite({ filePath: '/home/u/OPENCODE_WORKSPACE/trident-tmp/wave-a1.md', content: 'x', isEdit: false });
    expect(e.verdict).toBe('allow');
  });
  test('the multi-occurrence edit → the INCONCLUSIVE warn-skip (never a wrong throw)', () => {
    const fp = path.join(SANDBOX, 'multi.md');
    fs.writeFileSync(fp, N_LINES(30) + '\nrepeat\nrepeat\n', 'utf-8');
    const e = evaluateDocWrite({ filePath: fp, content: 'new', isEdit: true, oldString: 'repeat' });
    expect(e.verdict).toBe('warn-skip');
    expect(e.state).toBe('INCONCLUSIVE');
  });
  test('the runDocDensityGate persist: the row keyed by the absolute path (the isolation)', () => {
    const fp = path.join(SANDBOX, 'row.md');
    runDocDensityGate({ filePath: fp, content: N_LINES(210), isEdit: false });
    const row = loadDocRow(fp);
    expect(row).not.toBeNull();
    expect(row!.state).toBe('VERIFIED');
    expect(row!.accumulated_lines).toBe(210);
    expect(loadDocRow('/other/path.md')).toBeNull(); // the isolation
  });
});
