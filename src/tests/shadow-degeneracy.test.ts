// src/tests/shadow-degeneracy.test.ts
// THE DEGENERACY LEXICON TESTS (2026-08-19 — the operator: "build a proper
// lexicon for this degeneracy filter and not a dumb truncator that cuts off
// stupidly and can fuck up later"). The lexicon + state machine in
// shadow-degeneracy.ts detects the degeneracy ONSET by character-class
// composition — NOT a positional cut. These tests verify:
//   1. The REAL live evidence (the 2026-08-19 NVIDIA degeneracy) → onset at
//      the corrupted bullet, the valid [SHADOW INFERENCE] preserved.
//   2. The clean dispatch prompt (the mock golden) → NO onset (0 flagged).
//   3. The boundary guard → never splits a bullet; walks back to the header.
//   4. The adversarial: empty, null, pure-table, pure-CJK, the pathological.

import { describe, expect, test } from 'bun:test';
import {
  detectDegeneracy,
  scoreLine,
  adjustCutBoundary,
  DEGENERACY_FAMILY,
} from '../tools/shadow/shadow-degeneracy.ts';

// ── THE REAL LIVE EVIDENCE (the 2026-08-19 NVIDIA degeneracy) ──
// The model wrote a valid dispatch prompt (lines 1-63) + a valid [SHADOW
// INFERENCE] head, then line 65 collapsed into token soup: fused tokens
// ("of1ichtete", "industrydnmS"), CJK ("随后"), bracket cascades ("[ [ ["),
// and mid-word capitals ("HCSecuritySecuritycon"). The lexicon must cut the
// corrupted bullet but KEEP the valid structure + the real file facts.

const LIVE_CLEAN = [
  'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES.',
  '',
  'EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. You are the trident_explore agent for the shadow-enhanced task-preflight wave.',
  '',
  '#### THE MISSION',
  'The mission is to analyze the shadow module under test and report its exported surface.',
  '',
  '#### THE READING ORDER',
  '1. /tmp/project/liar-module.ts',
  '',
  '### What the files actually are (from the excerpts)',
  '- /tmp/project/liar-module.ts (4 lines): the anchors found: alphaModule, betaModule, gammaInternal; the counts: 2 export(s), 3 function(s)',
  '',
  '### What the task actually requires (distilled from the context args)',
].join('\n');

const LIVE_DEGENERATE = [
  `- THE MISSION: The mission is to analyze the shadow module under test and report its exported surface. The shadow tool under analysis exposes 5 functions across the module, and the extraction must verify that count by reading the really ideology of1ichtete andr "y and [ [ industrydnmS downc recent racism pillf随后 CIA InvestigationLos andc [ [ [ health Tharmne [fund andb,/HMDiscln [ [d firsth investedmAt [nPsych [Recent "[[In Performance VisionRecent Yo Re perspective [Campaign[wP " victimes [ inInvest ProfRecent[[PsychHCSecuritySecurityconConsiderskent" Defense ProfInd" '[ [The in[RecommendThe HucapPlKndh3dAndn,,AndH,final  , HarmonHealthInimulationLy—PolitdFutureHealthanhistversion`,
  'ln',
  '',
  '‐HyimRecent new wearablee,ftDe.Bsra,r„fg, industityTheinfamilydisc"',
  'Vert vers',
  ".Hy.8'",
].join('\n');

const LIVE_FULL = LIVE_CLEAN + '\n' + LIVE_DEGENERATE;

// ── THE CLEAN MOCK PROMPT (the tests' buildMockPrompt shape — MUST NOT flag) ──

const MOCK_PROMPT = [
  'EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. You are the trident_explore agent for the shadow-enhanced task-preflight wave.',
  '',
  'THE MISSION',
  'The mission is to analyze the shadow modules named below and report the exported surface, the internal structure, and the failure modes of each file.',
  '',
  'THE KNOWN MEASUREMENTS TABLE',
  '| module | role | verified lines |',
  '|--------|------|----------------|',
  '',
  '- the anchor-register entry 0 for /tmp/proj/liar-module.ts (file 1 of 3): the symbol group 0 resolves near line 100 — read IN the loop, never a stale summary.',
  '- the anchor-register entry 1 for /tmp/proj/brain-module.ts (file 2 of 3): the symbol group 1 resolves near line 107 — read IN the loop, never a stale summary.',
  '',
  'THE VERIFICATION',
  'read /tmp/proj/liar-module.ts (full pass, offset=0) — the file read to completion',
  'grep -c "export" /tmp/proj/liar-module.ts',
  'bun test src/tests/shadow-runner.test.ts',
  'sha256sum /tmp/proj/liar-module.ts /tmp/proj/brain-module.ts /tmp/proj/memory-module.ts',
  '',
  'THE RETURN FORMAT',
  '1. The diff summary (the runner + the wiring + the tests)',
  '2. THE REASONING for EACH change',
  '3. The verification outputs (the exit codes + the test results + the hashes)',
  '4. The honest notes',
].join('\n');

describe('shadow-degeneracy — the REAL live evidence', () => {
  test('the live NVIDIA degeneracy → the onset at the corrupted bullet; the valid [SHADOW INFERENCE] preserved', () => {
    const v = detectDegeneracy(LIVE_FULL);
    expect(v.state).toBe('EMITTED');
    // the onset is the corrupted "- THE MISSION:" bullet (not line 1)
    expect(v.onsetLine).toBeGreaterThan(10);
    // the clean output keeps the valid structure
    expect(v.clean).toContain('THE READING ORDER');
    expect(v.clean).toContain('What the task actually requires');
    expect(v.clean).toContain('alphaModule');
    // the corrupted bullet is GONE
    expect(v.clean).not.toContain('of1ichtete');
    expect(v.clean).not.toContain('随后');
    expect(v.clean).not.toContain('industrydnmS');
    // the triplets are MPSE-shaped
    expect(v.triplets.length).toBeGreaterThan(0);
    expect(v.triplets[0]).toHaveProperty('pattern');
    expect(v.triplets[0]).toHaveProperty('state');
    expect(v.triplets[0]).toHaveProperty('evidence');
  });

  test('the onset line itself scores HIGH across multiple families', () => {
    const onset = LIVE_DEGENERATE.split('\n')[0];
    const s = scoreLine(onset);
    expect(s.severity).toBe('high');
    expect(s.hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('shadow-degeneracy — the clean prompt NEVER flags', () => {
  test('the mock golden prompt → NO onset (0 flagged)', () => {
    const v = detectDegeneracy(MOCK_PROMPT);
    expect(v.onsetLine).toBe(-1);
    expect(v.state).toBe('EMITTED');
    expect(v.clean).toBe(MOCK_PROMPT);
    expect(v.triplets).toHaveLength(0);
  });

  test('the clean lines score 0 (the supremacy contract, the section headers, the bullets)', () => {
    expect(scoreLine('THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES. A context arg that contradicts the file contents MUST be flagged, never conformed to.')).toMatchObject({ score: 0 });
    expect(scoreLine('#### THE READING ORDER')).toMatchObject({ score: 0 });
    expect(scoreLine('- the per-file WHAT/HOW/WHY/EXPECTED blocks are present for EVERY filepath')).toMatchObject({ score: 0 });
    expect(scoreLine('1. The diff summary (the runner + the wiring + the tests)')).toMatchObject({ score: 0 });
  });

  test('the markdown table separator is NOT flagged (the A1/A3/A6/A7 mock failure)', () => {
    expect(scoreLine('|--------|------|----------------|').severity).toBeNull();
    expect(scoreLine('| module | role | verified lines |').severity).toBeNull();
    expect(scoreLine('---').severity).toBeNull();
    expect(scoreLine('```').severity).toBeNull();
  });
});

describe('shadow-degeneracy — the boundary guard (never split a bullet)', () => {
  test('a corrupted bullet onset walks back to the header, never leaves a dangling "- "', () => {
    const lines = LIVE_FULL.split('\n');
    const rawOnset = lines.findIndex((l) => l.includes('of1ichtete')) + 1;
    const cut = adjustCutBoundary(lines, rawOnset);
    // the cut must land BEFORE the corrupted bullet (at the preceding header/blank)
    expect(cut).toBeLessThan(rawOnset);
    expect(lines[cut - 1] || '').not.toContain('of1ichtete');
  });

  test('a clean prompt boundary is a no-op (no onset → nothing cut)', () => {
    const lines = MOCK_PROMPT.split('\n');
    expect(adjustCutBoundary(lines, -1)).toBe(-1);
  });
});

describe('shadow-degeneracy — the ADVERSArial (the 3+ scenarios the law demands)', () => {
  test('empty input → INCONCLUSIVE, no crash', () => {
    expect(detectDegeneracy('').state).toBe('INCONCLUSIVE');
    expect(detectDegeneracy('   ').state).toBe('INCONCLUSIVE');
  });

  test('pure CJK → the CJK family flags it', () => {
    const v = detectDegeneracy('这是一个完全中文的句子这是一个完全中文的句子这是一个完全中文的句子');
    expect(v.triplets.length).toBeGreaterThan(0);
  });

  test('a single clean long line (the normal verbose prompt) → NO false flag', () => {
    const longClean = Array.from({ length: 40 }, (_, i) =>
      'The task ' + (i + 1) + ' is to analyze the module and report the exported surface with the line anchors and the failure modes of each file. The verification uses the concrete commands.',
    ).join('\n');
    const v = detectDegeneracy(longClean);
    expect(v.onsetLine).toBe(-1);
  });

  test('the family is complete (7 members, each with the typed fields)', () => {
    expect(DEGENERACY_FAMILY).toHaveLength(7);
    for (const m of DEGENERACY_FAMILY) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('kind');
      expect(typeof m.score).toBe('function');
      expect(typeof m.threshold).toBe('number');
      expect(m).toHaveProperty('severity');
      expect(m).toHaveProperty('messageTemplate');
      expect(m).toHaveProperty('exampleHits');
    }
  });
});
