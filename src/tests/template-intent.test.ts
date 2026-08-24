// ═══ TEMPLATE-INTENT + FLOOR-FIX TESTS (2026-08-23) ═══
//
// KILLS THREE LIVE FAILURE CLASSES FROM wave-1787506367557:
// 1. TEMPLATE MISMATCH (E3 research weave on a code job → ~15min wasted):
//    the input-file filter classifies intent from the spec's OWN fields and
//    refuses cross-kin mismatches BEFORE any generation.
// 2. THE CONDITIONAL-150 TRAP (structureOk ? 96 : 150): one structural nit
//    silently doubled the line floor and killed a complete 129-line prompt.
//    Enforcement floor is now UNCONDITIONAL 96.
// 3. THE CODE-BIASED COMMAND LEXICON: webfetch/curl/wget are legitimate
//    verification forms for research prompts — now first-class lexicon members.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import {
  classifySpecIntent, validateTemplateMatch, templateToFamily,
  type SpecIntentEvidence,
} from '../tools/template-intent.ts';
import { validateTaskPromptLines } from '../tools/trident-preflight.ts';
import { validateSpecFile } from '../tools/wave-spec.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CODE_SPEC = (template: string): SpecIntentEvidence => ({
  name: 'probe',
  template,
  filepaths: ['/home/leviathan/proj/src/tools/wave-dispatch.ts'],
  mission: 'Extract the enforcement mechanics from the target module and report every check with file:line anchors. Inventory the exports.',
});
const RESEARCH_SPEC = (template: string): SpecIntentEvidence => ({
  name: 'probe',
  template,
  filepaths: ['https://example.com/spec', 'https://other.dev/docs'],
  mission: 'Research the state of the art across sources; fetch and compare approaches; cite sources for each claim.',
});

describe('template-intent — the state machine verdicts', () => {

  test('code signals classify to code-extract with triads', () => {
    const v = classifySpecIntent(CODE_SPEC('E1'));
    expect(v.state).toBe('CLASSIFIED');
    if (v.state === 'CLASSIFIED') {
      expect(v.family).toBe('code-extract');
      expect(v.triads.length).toBeGreaterThanOrEqual(2);   // path-shape + verb
      expect(v.triads[0].field).toBe('filepaths');          // the evidence triad names WHERE
    }
  });

  test('web targets + research verbs classify to research', () => {
    const v = classifySpecIntent(RESEARCH_SPEC('E3'));
    expect(v.state).toBe('CLASSIFIED');
    if (v.state === 'CLASSIFIED') expect(v.family).toBe('research');
  });

  test('failure verbs classify to failure-evidence', () => {
    const v = classifySpecIntent({
      name: 'x', template: 'E4',
      filepaths: ['/tmp/anything.log'],
      mission: 'Perform the postmortem: root cause of the regression, the incident timeline.',
    });
    expect(v.state).toBe('CLASSIFIED');
    if (v.state === 'CLASSIFIED') expect(v.family).toBe('failure-evidence');
  });

  test('build verbs classify to build', () => {
    const v = classifySpecIntent({
      name: 'x', template: 'B2',
      filepaths: ['/home/leviathan/proj/src/new-module.ts'],
      mission: 'Implement the feature: write the code for the new parser module and ship it behind tests.',
    });
    expect(v.state).toBe('CLASSIFIED');
    if (v.state === 'CLASSIFIED') expect(v.family).toBe('build');
  });

  test('INCONCLUSIVE on signal-less specs — never a default-pass classification', () => {
    const v = classifySpecIntent({ name: 'x', template: 'E1', filepaths: [], mission: '' });
    expect(v.state).toBe('INCONCLUSIVE');
  });
});

describe('validateTemplateMatch — the impossible-mismatch gate', () => {

  test('THE LIVE REGRESSION PINNED: E3 declared + code signals → ERROR naming both sides', () => {
    const d = validateTemplateMatch(CODE_SPEC('E3'));
    expect(d).not.toBeNull();
    expect(d!.severity).toBe('error');
    expect(d!.message).toContain('TEMPLATE MISMATCH');
    expect(d!.message).toContain('E3');
    expect(d!.message).toContain('CODE-EXTRACT');
    expect(d!.fix).toContain('set template=E1');
  });

  test('mirror mismatch: E1 declared + web/research signals → ERROR suggesting E3', () => {
    const d = validateTemplateMatch(RESEARCH_SPEC('E1'));
    expect(d?.severity).toBe('error');
    expect(d?.fix).toContain('set template=E3');
  });

  test('build declared + pure-research mission → ERROR (cross-kin)', () => {
    const d = validateTemplateMatch(RESEARCH_SPEC('B3'));
    expect(d?.severity).toBe('error');
  });

  test('matching combos pass clean: E1+code, E3+research, B2+build, E4+failure', () => {
    expect(validateTemplateMatch(CODE_SPEC('E1'))).toBeNull();
    expect(validateTemplateMatch(RESEARCH_SPEC('E3'))).toBeNull();
    expect(validateTemplateMatch({
      name: 'x', template: 'B2',
      filepaths: ['/home/leviathan/proj/src/mod.ts'],
      mission: 'Implement the handler: write the code, refactor the caller, ship with tests.',
    })).toBeNull();
    expect(validateTemplateMatch({
      name: 'x', template: 'E4',
      filepaths: ['/tmp/x.log'],
      mission: 'Postmortem the incident: root cause and regression window.',
    })).toBeNull();
  });

  test('KIN-ADJACENT confusion is harmless: E2 docs-deep passes on code signals', () => {
    // E1↔E2 share runtime behavior — the filter must NOT block kin pairs:
    expect(validateTemplateMatch(CODE_SPEC('E2'))).toBeNull();
  });

  test('INCONCLUSIVE never blocks (the anti-default-pass law, inverted correctly)', () => {
    expect(validateTemplateMatch({ name: 'x', template: 'E1', filepaths: [], mission: '' })).toBeNull();
  });

  test('CONTESTED emits warning-grade steering, not a block (genuine 2v2 verb tie)', () => {
    // research verbs (2) vs failure verbs (2), zero shape signals — a true tie:
    const contested: SpecIntentEvidence = {
      name: 'x', template: 'E1',
      filepaths: [],
      mission: 'Research the external sources and cite them; then postmortem the incident for root cause.',
    };
    const v = classifySpecIntent(contested);
    expect(v.state).toBe('CONTESTED');
    const d = validateTemplateMatch(contested);
    expect(d).not.toBeNull();
    expect(d!.severity).toBe('warning');
  });
});

describe('validateSpecFile integration — the filter fires at the INPUT FILE', () => {
  test('a spec file with an E3-on-code agent is REFUSED before generation with the named fix', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti-spec-'));
    const fp = '/tmp/ti-fixture-target.ts';
    fs.writeFileSync(fp, 'export const x = 1;\n');
    const specPath = path.join(dir, 'wave-spec.json');
    const D = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
    fs.writeFileSync(specPath, JSON.stringify({
      expectedCount: 1,
      agents: [{
        name: 'mismatched-probe', template: 'E3', filepaths: [fp],
        mission: D('Extract the module inventory from /tmp/ti-fixture-target.ts and report exports with file:line anchors. ', 220),
        knownContext: D('The fixture module has one export; anchors verified. ', 220),
        doctrine: D('Read-only extraction; cite file lines.', 110),
        measurements: D('One file, ~1 line, one export.', 110),
        acceptance: D('Exports listed with line anchors; no fabrication.', 110),
        taskTargets: D('WHAT: list exports HOW: read file WHY: anchor EXPECTED: table', 110),
        position: D('Terminal probe agent feeding nothing downstream directly.', 60),
      }],
    }));
    const diags = validateSpecFile(specPath);
    const mismatch = diags.find((d) => d.field === 'template' && d.severity === 'error');
    expect(mismatch).toBeDefined();
    expect(mismatch!.message).toContain('TEMPLATE MISMATCH');
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(fp, { force: true });
  });
});

describe('the floor fixes in validateTaskPromptLines', () => {

  /** A structurally-complete prompt at exactly N non-empty lines with a given command form. */
  function structuredPrompt(lines: number, cmdLine: string): string {
    const out: string[] = [
      'THE MISSION: extract the forensic context and synthesize the report.',
      'THE READING ORDER — read before execution:',
      '/home/leviathan/proj/src/one.ts', '/home/leviathan/proj/src/two.ts', '/tmp/three.ts',
      '## TASK 1', 'WHAT: map section one with file:line anchors.',
      'HOW: read fully at 2500-line passes; cite every claim.', 'WHY: anchoring prevents fabrication.',
      'EXPECTED: dense table per symbol.',
      '## TASK 2', 'WHAT: verify cited anchors.', 'HOW: grep each symbol in the file.',
      'WHY: stale anchors derail builds.', 'EXPECTED: FOUND/MOVED/ABSENT verdicts.',
      '## TASK 3', 'WHAT: trace data flow.', 'HOW: follow call chains.', 'WHY: blast radius awareness.',
      'EXPECTED: per-path contracts.',
      'CONSTRAINTS: do not touch frozen files; read-only extraction.',
      'RETURN FORMAT: FULL REPORT with per-task verdicts.',
    ];
    out.push(cmdLine);
    while (out.filter((l) => l.trim().length > 0).length < lines) out.push('- detail line ' + out.length + ': anchored extraction continues.');
    return out.join('\n');
  }

  test('REGRESSION PIN: the EXACT failed-E3 shape (129 lines, webfetch verification) now PASSES', () => {
    const p = structuredPrompt(129, 'THE VERIFICATION (run ALL + return outputs):\n1. webfetch https://spec.example/source\n2. curl -s https://api.example/meta | jq keys');
    const v = validateTaskPromptLines(p);
    expect(v.passed).toBe(true);   // was: FAIL (cmd miss → structureOk false → floor 96→150 → 129<150)
  });

  test('UNCONDITIONAL 96: a structurally-broken prompt at 130 lines still fails on ITS named checks — not on lines', () => {
    // 130 lines, NO verification commands, NO reading-order marker:
    const body = Array.from({ length: 120 }, (_, i) => 'filler line ' + i).join('\n');
    const p = 'THE MISSION: something vague.\n' + body;
    const v = validateTaskPromptLines(p);
    expect(v.passed).toBe(false);
    const joined = v.lines.join(' ');
    expect(joined).toContain('[FAIL]');                       // the failures are NAMED...
    expect(joined).not.toContain('min 150');                  // ...and NEVER via a silent 150 floor
  });

  test('sub-96 still fails regardless of structure (the ruling preserved)', () => {
    const p = 'THE MISSION: tiny.\nTHE RETURN FORMAT: none.\nread /tmp/x.ts\ngrep pattern /tmp/x.ts';
    expect(validateTaskPromptLines(p).passed).toBe(false);
  });

  test('code-command forms still accepted (no regression on the original lexicon)', () => {
    const p = structuredPrompt(100, 'VERIFICATION: grep -c export /home/leviathan/proj/src/one.ts && bun test ./src/');
    expect(validateTaskPromptLines(p).passed).toBe(true);
  });
});

describe('templateToFamily mapping', () => {
  test('every enum maps; junk returns null', () => {
    expect(templateToFamily('E1')).toBe('code-extract');
    expect(templateToFamily('E2')).toBe('docs-deep');
    expect(templateToFamily('E3')).toBe('research');
    expect(templateToFamily('E4')).toBe('failure-evidence');
    expect(templateToFamily('B5')).toBe('build');
    expect(templateToFamily('X9')).toBeNull();
  });
});
