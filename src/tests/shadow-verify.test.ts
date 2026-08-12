// ═══ SHADOW-VERIFY TESTS — the silent verifier (the spec §3.7) ═══
// The zero-hint discipline: EVERY assertion is mechanical — the markers (the firewall mirror +
// the raw-template markers), the VERBATIM-DOCTRINE (a paraphrase fails, the exact quote passes),
// the FRESHNESS (the stale sha256 fails, the current state passes, the unread spec path fails,
// the unreferenced read file fails), the REPAIR (the under-floor prompt → the repaired text at
// the 125+ floor). Adversarial-only: no happy path without its failure twin.
// The fixture filepaths are built at RUNTIME (os.homedir + path.join) — the dispatch prompts
// genuinely require absolute paths (the ABS_PATH_RE scans for /home/|/root/|... prefixes).

// @ts-ignore — bun:test ships the runtime, not TS declarations (bun test resolves it natively)
import { describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateTaskPromptLines } from '../tools/trident-preflight.ts';
import {
  extractDoctrineQuotes,
  freshnessFlags,
  mechanicallyRepair,
  silentVerify,
  type FileState,
} from '../tools/shadow/shadow-verify.ts';
import type { BriefSpec } from '../tools/shadow/shadow-brief-builder.ts';

// the absolute fixture paths — constructed at runtime, never hardcoded
const HOME = os.homedir();
const PROJ = path.join(HOME, 'proj');
const PATHS = [
  path.join(PROJ, 'src', 'tools', 'a.ts'),
  path.join(PROJ, 'src', 'tools', 'b.ts'),
  path.join(PROJ, 'src', 'tests', 'a.test.ts'),
  path.join(PROJ, 'src', 'tests', 'b.test.ts'),
];

/** The doctrine's DISTINCTIVE quote — the phrase the weave must preserve
 *  VERBATIM (the §6.1 VERBATIM scenario: a paraphrase fails). */
const DOCTRINE_QUOTE = 'the files are the only ground truth, never the summary';

function makeSpec(overrides: Partial<BriefSpec> = {}): BriefSpec {
  return {
    filepaths: [...PATHS],
    mission: 'the mission: extract the module surface of the tools and the tests',
    knownContext: 'the known context: the measured state with the anchors',
    doctrine: 'the operator\'s doctrine: "' + DOCTRINE_QUOTE + '" — the verbatim quote must survive the weave',
    measurements: 'the measurements: the baseline table',
    acceptance: 'the acceptance: the checkable bullets',
    taskTargets: 'the targets: the per-task extraction targets',
    position: 'the position: the wave-2 slot',
    ...overrides,
  };
}

/** A spec whose doctrine carries NO distinctive quotes — the verbatim check
 *  passes trivially so the OTHER checks are isolated. */
function quoteFreeSpec(overrides: Partial<BriefSpec> = {}): BriefSpec {
  return makeSpec({
    doctrine: 'the operator doctrine: the files are the ground truth and the context args are belief, verified against the files.',
    ...overrides,
  });
}

/** The file states the PI loop captured AT READ TIME — sha256 values are
 *  64-hex, distinct per file. */
function makeFileStates(): FileState[] {
  return PATHS.map((p, i) => ({
    path: p,
    lineCount: 100 + i * 10,
    sha256: ('a' + String(i)).repeat(32),
  }));
}

/** THE 5-TASK PER-FILE BLOCK — each line carries the path/name so the
 *  unique-line ratio stays high and every task is file-specific. */
function taskLines(p: string): string[] {
  const name = p.split('/').pop()!.replace(/\.[^.]+$/, '');
  return [
    'Task A — the ' + name + ' role and its exported surface.',
    '  WHAT: the role of ' + p + ' inside the module and the exported surface it presents.',
    '  HOW: read ' + p + ' in full passes and enumerate the exports, the key functions, the types.',
    '  HOW: trace the call chains from ' + p + ' into the consumers across the workspace.',
    '  WHY: the orchestrator must know the exact surface of ' + p + ' before specifying changes.',
    '  WHY: a missing export in ' + p + ' derails the downstream dispatch targets.',
    '  EXPECTED: the per-file block for ' + p + ': the path, the role, the exports, the anchors.',
    'Task B — the ' + name + ' anchors and the data contracts.',
    '  WHAT: the file:line anchors and the boundary contracts of ' + p + '.',
    '  HOW: grep the cited symbols inside ' + p + ' and verify each against the source text.',
    '  HOW: map the contract shapes at the edge of ' + p + ' to the consumers\' expectations.',
    '  WHY: the surgical edits target the exact lines of ' + p + ' — a wrong anchor derails the build.',
    '  EXPECTED: the verification table for ' + p + ': the spec claim, the current line, the verdict.',
    'Task C — the ' + name + ' failure modes and the error handling.',
    '  WHAT: the error paths and the failure handling inside ' + p + '.',
    '  HOW: read the error branches of ' + p + '; note the empty catches and the silent fallbacks.',
    '  HOW: exercise the boundary inputs against ' + p + ' to expose the unchecked paths.',
    '  WHY: the audit gate flags the silent failures — the extraction must surface them from ' + p + '.',
    '  EXPECTED: the failure-mode list for ' + p + ': the error, the handling, the verdict.',
    'Task D — the ' + name + ' verification probes and the read-back checks.',
    '  WHAT: the mechanical probes that confirm the state of ' + p + ' after the extraction.',
    '  HOW: run the grep probes against ' + p + ' and capture the raw output lines.',
    '  WHY: the probe output is the evidence the manifest reports for ' + p + '.',
    '  EXPECTED: the probe results for ' + p + ': the command, the output, the pass or fail verdict.',
    'Task E — the ' + name + ' deliverable summary block.',
    '  WHAT: the summary of the extraction of ' + p + ' for the wave report.',
    '  HOW: assemble the block from the anchors and the contracts found in ' + p + '.',
    '  WHY: the wave report needs the per-file digest of ' + p + ' at the end.',
    '  EXPECTED: the summary block for ' + p + ': the file, the count, the one-line verdict.',
  ];
}

/** A FULLY VALID dispatch prompt (~148 lines for 4 paths) — passes EVERY
 *  marker check: 6/6 section markers, the WHAT:/EXPECTED: counts, the 3+
 *  absolute paths, the concrete commands, the unique-line ratio, the 125 floor.
 *  opts.quote injects the doctrine quote (the verbatim probe); opts.sha injects
 *  a sha256 claim (the freshness probe). */
function validPrompt(paths: string[], opts: { quote?: string; sha?: string } = {}): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.');
  L.push('');
  L.push('THE MISSION: extract the module surface of the tools and the tests with the anchors intact.');
  L.push('');
  L.push("THE OPERATOR'S DOCTRINE: " + (opts.quote ?? '') + ' — the doctrine governs the whole dispatch.');
  L.push('');
  L.push('THE READING ORDER:');
  paths.forEach((p, i) => L.push('  ' + (i + 1) + '. ' + p + ' — the target to read fully'));
  L.push('');
  for (const p of paths) L.push(...taskLines(p));
  L.push('');
  L.push('THE CONSTRAINTS: the frozen files named by the orchestrator are never touched.');
  L.push('');
  if (opts.sha) {
    L.push('THE FILE STATE SNAPSHOT: sha256 ' + opts.sha + ' captured at the read in the loop.');
    L.push('');
  }
  L.push('THE VERIFICATION: run ALL of the commands and return the outputs verbatim.');
  for (const p of paths) L.push('read ' + p + ' (full pass, offset=0) — the file read to completion');
  L.push('bun test');
  L.push('tsc --noEmit');
  L.push('sha256sum ' + paths.join(' '));
  L.push('');
  L.push('THE RETURN FORMAT: the diff summary, the reasoning per change, the verification outputs, the honest notes.');
  return L.join('\n');
}

/** AN UNDER-FLOOR PROMPT (~55 lines for 4 paths) — LONG but structurally
 *  EMPTY: no WHAT:/EXPECTED: blocks, no read/grep commands, under the 125
 *  floor. The repair must bring it to the floor. */
function underFloorPrompt(paths: string[]): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.');
  L.push('THE MISSION: the extraction of the module surface for the wave report.');
  L.push('THE KNOWN CONTEXT: the measured state from the wave-1 audit with the anchors.');
  L.push('THE ACCEPTANCE CRITERIA: the checkable bullets the extraction must satisfy.');
  L.push('THE CONSTRAINTS: the frozen files are never touched.');
  L.push('THE READING ORDER:');
  paths.forEach((p, i) => L.push('  ' + (i + 1) + '. ' + p));
  L.push('THE RETURN FORMAT: the diff summary and the verification outputs.');
  // the filler prose — the prompt is LONG but structurally empty (the 40
  // paragraphs carry no WHAT:/EXPECTED: and no commands)
  for (let i = 0; i < 40; i++) {
    L.push('the context paragraph ' + i + ' of the under-floor prompt covering the files and the mission.');
  }
  return L.join('\n');
}

describe('shadow-verify — the markers', () => {
  test('the markers: a structurally-impossible prompt (1 path) is flagged and NEVER verified — the repair cannot fabricate paths', () => {
    // 1 path → the ABS_PATH occurrences can never reach the 3+ floor even after
    // the repair appends the same single path — the MARKERS/STRUCTURE flag survives
    const spec = makeSpec({ filepaths: [PATHS[0]] });
    const states = makeFileStates().slice(0, 1);
    const prompt = validPrompt([PATHS[0]], { quote: DOCTRINE_QUOTE });
    const res = silentVerify(prompt, spec, states);
    expect(res.verified).toBe(false);
    expect(res.flags.some((f) => f.startsWith('MARKERS/STRUCTURE'))).toBe(true);
  });

  test('the raw markers: a raw [WEAVE:] marker is FLAGGED and never repaired (the append-blocks cannot remove it)', () => {
    const prompt = validPrompt(PATHS, { quote: DOCTRINE_QUOTE }) + '\nTHE EXTRA: [WEAVE: mission]';
    const res = silentVerify(prompt, makeSpec(), makeFileStates());
    expect(res.verified).toBe(false);
    expect(res.flags.some((f) => f.startsWith('RAW-MARKERS'))).toBe(true);
    expect(res.repairedText).toBeUndefined(); // the repair cannot remove the raw marker
  });
});

describe('shadow-verify — the verbatim-doctrine', () => {
  test('the verbatim-doctrine: a PARAPHRASED doctrine quote is FLAGGED (the exact string is absent)', () => {
    const paraphrased = validPrompt(PATHS, { quote: 'the files are believed to be the sole source of truth' });
    const res = silentVerify(paraphrased, makeSpec(), makeFileStates());
    expect(res.verified).toBe(false);
    expect(res.flags.some((f) => f.startsWith('VERBATIM-DOCTRINE'))).toBe(true);
  });

  test('the verbatim-doctrine: the EXACT quote passes — no verbatim flag, the prompt is verified', () => {
    const exact = validPrompt(PATHS, { quote: DOCTRINE_QUOTE });
    const res = silentVerify(exact, makeSpec(), makeFileStates());
    expect(res.verified).toBe(true);
    expect(res.flags.some((f) => f.startsWith('VERBATIM-DOCTRINE'))).toBe(false);
    expect(res.repairedText).toBeUndefined(); // nothing was repaired
  });

  test('extractDoctrineQuotes: the distinctive quoted phrases are extracted; the short/noise segments are skipped', () => {
    const doctrine = 'the rule "the files are the only ground truth" governs; "X" is noise; "12345678" is numeric; "a b" is short.';
    const quotes = extractDoctrineQuotes(doctrine);
    expect(quotes).toContain('the files are the only ground truth');
    expect(quotes.some((q) => q === 'X')).toBe(false); // < 8 chars
    expect(quotes.some((q) => q === '12345678')).toBe(false); // no letter
    expect(quotes.some((q) => q === 'a b')).toBe(false); // < 8 chars
  });
});

describe('shadow-verify — the freshness', () => {
  test('the freshness: a spec filepath with NO file state captured in the loop is FLAGGED', () => {
    // the spec requests 4 files; the loop only read 3 — PATHS[3] has no state
    const res = silentVerify(
      validPrompt(PATHS),
      quoteFreeSpec(),
      makeFileStates().slice(0, 3),
    );
    expect(res.verified).toBe(false);
    expect(res.flags.some((f) => f.startsWith('FRESHNESS: ' + PATHS[3]))).toBe(true);
  });

  test('the freshness: a STALE sha256 claim (matching NO captured state) is FLAGGED; the CURRENT sha passes', () => {
    const states = makeFileStates();
    const stale = silentVerify(validPrompt(PATHS, { sha: 'f'.repeat(64) }), quoteFreeSpec(), states);
    expect(stale.verified).toBe(false);
    expect(stale.flags.some((f) => f.startsWith('FRESHNESS: the prompt cites sha256'))).toBe(true);
    const current = silentVerify(validPrompt(PATHS, { sha: states[0].sha256 }), quoteFreeSpec(), states);
    expect(current.verified).toBe(true);
    expect(current.flags.some((f) => f.startsWith('FRESHNESS'))).toBe(false);
  });

  test('freshnessFlags (direct): the read-but-unreferenced file is flagged — the stale-summary gap', () => {
    // the loop read 4 files; the prompt only references 3 — PATHS[3] is dropped
    const flags = freshnessFlags(validPrompt(PATHS.slice(0, 3)), quoteFreeSpec(), makeFileStates());
    expect(flags.some((f) => f.startsWith('FRESHNESS: ' + PATHS[3]))).toBe(true);
  });
});

describe('shadow-verify — the repair', () => {
  test('the repair: an under-floor prompt is mechanically repaired to the 125+ floor (the REPAIRED note + the repairedText)', () => {
    const spec = quoteFreeSpec();
    const input = underFloorPrompt(PATHS);
    const res = silentVerify(input, spec, makeFileStates());
    expect(res.verified).toBe(true);
    expect(res.repairedText).toBeDefined();
    expect(res.repairedText).not.toBe(input);
    expect(res.flags.some((f) => f.startsWith('REPAIRED'))).toBe(true);
    // the repaired text passes the firewall mirror MECHANICALLY
    const v = validateTaskPromptLines(res.repairedText!);
    expect(v.passed).toBe(true);
    expect(res.repairedText!.split('\n').length).toBeGreaterThanOrEqual(125);
  });

  test('the repair cannot fabricate: the verbatim + freshness failures SURVIVE the repair (verified=false)', () => {
    // the under-floor prompt (no quote) + a doctrine WITH a quote + a state gap
    const spec = makeSpec(); // the doctrine carries DOCTRINE_QUOTE
    const states = makeFileStates().slice(0, 3); // PATHS[3] has no state
    const input = underFloorPrompt(PATHS);
    const res = silentVerify(input, spec, states);
    expect(res.verified).toBe(false);
    // the repair fixed the structure (the REPAIRED note) but cannot fabricate
    // the doctrine quote or the missing file state
    expect(res.flags.some((f) => f.startsWith('REPAIRED'))).toBe(true);
    expect(res.flags.some((f) => f.startsWith('VERBATIM-DOCTRINE'))).toBe(true);
    expect(res.flags.some((f) => f.startsWith('FRESHNESS: ' + PATHS[3]))).toBe(true);
  });

  test('mechanicallyRepair (direct): appends the reading order + the task blocks + the verification when the floor/structure is unmet', () => {
    const spec = quoteFreeSpec();
    const repaired = mechanicallyRepair('THE MISSION: thin.\n', spec);
    expect(repaired.includes('THE MECHANICAL READING ORDER')).toBe(true);
    expect(repaired.includes('THE MECHANICAL TASKS')).toBe(true);
    expect(repaired.includes('THE MECHANICAL VERIFICATION')).toBe(true);
    expect(repaired.includes(PATHS[0])).toBe(true);
    expect(repaired.includes('Task A')).toBe(true);
    expect(repaired.includes('  WHAT: the role, the exported surface')).toBe(true);
  });
});
