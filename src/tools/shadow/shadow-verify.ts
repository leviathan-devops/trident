// ============================================================================
// file: src/tools/shadow/shadow-verify.ts
//
// §3.7 of SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md — THE SILENT VERIFIER.
//
// silentVerify(promptText, spec, fileStates) → { flags, verified, repairedText? }
// — the Stage-6 verification, SILENT (L6): the flags ride INSIDE the manifest's
// notes, never as separate directives. THE CHECKS:
//   (a) THE MARKERS — the firewall mirror (validateTaskPromptLines: the section
//       markers, the WHAT:/EXPECTED: counts, the 3+ absolute paths, the
//       unique-line ratio >= 0.55, the concrete verification commands, the line
//       floor) + the shadow's own RAW-MARKERS check (0 raw [FILL]/[WEAVE]/
//       [FILEPATHS:]/[CONTEXT:] markers — the existing validator only scans
//       [FILL, so the [WEAVE] family is the verifier's addition).
//   (b) THE VERBATIM-DOCTRINE CHECK (the §6.1 VERBATIM scenario): the doctrine
//       arg's distinctive quoted phrases MUST appear VERBATIM in the woven
//       prompt — a paraphrase fails the check (the exact string is absent).
//   (c) THE FRESHNESS CHECK (the §6.1 FRESHNESS scenario): the fileStates
//       (the { path, lineCount, sha256 } records the runner captured IN the
//       loop) vs the prompt's claims — (i) every spec filepath must have a
//       state captured in the loop, (ii) every read state must be REFLECTED in
//       the prompt, (iii) every sha256 the prompt cites must match a captured
//       state — a stale/fabricated hash is flagged. The prompt must reflect the
//       CURRENT file state, never a stale summary.
//   (d) THE REPAIR — the mechanicallyRepair v2 (the task blocks + the reading
//       order + the verification appended when the structure/floor is unmet) +
//       the v10b final-fallback: the repair runs INTERNALLY when the mechanical
//       checks fail; the flags then report the FINAL (repaired) state + a
//       REPAIRED/REPAIRED-PARTIAL note. The repaired text is returned so the
//       runner appends THE REPAIRED TEXT (the manifest must never claim
//       verified=true for a prompt that was repaired but not persisted).
//
// THE OPERATOR'S "actually reads all the data and input context": the
// verbatim-doctrine + the freshness are the shadow's NEW checks — the weave
// cannot silently drop or paraphrase the doctrine's distinctive quotes, and
// the prompt cannot ship a stale picture of the files the loop actually read.
// ============================================================================

import * as path from 'node:path';
import { validateTaskPromptLines } from '../trident-preflight.ts';
import { injectSlots, type BriefSpec } from './shadow-brief-builder.ts';

/** THE FILE STATE — the record the PI loop captures when it READS a file
 *  (the read-before-write, mechanically): the path, the line count, and the
 *  sha256 AT READ TIME. The freshness check verifies the prompt against these
 *  — never against the caller's summary. */
export interface FileState {
  path: string;
  lineCount: number;
  sha256: string;
}

/** THE SILENT VERIFIER RESULT. The spec's minimum contract is
 *  { flags, verified } — repairedText is the SUPERSET the runner needs to
 *  persist the repaired prompt (a manifest claiming verified=true for a
 *  repaired-but-not-persisted prompt would be a lie). */
export interface SilentVerifyResult {
  /** Each flag names the check + the shortfall (L6 — they ride inside the
   *  manifest's notes). The REPAIRED note is informational, not a failure. */
  flags: string[];
  /** True ONLY when the FINAL text (repairedText ?? promptText) passes EVERY
   *  check. */
  verified: boolean;
  /** The mechanically-repaired text when a repair was applied — the runner
   *  MUST write THIS to disk, not the original. Absent when no repair ran. */
  repairedText?: string;
}

/** THE ABSOLUTE-PATH SCAN — the firewall mirror's exact alternation. */
const ABS_PATH_RE = /(?:\/home\/|\/root\/|\/tmp\/|\/var\/|\/usr\/|\/etc\/|\/opt\/|\/workspace\/|\/app\/|\/mnt\/|C:\\|\/Users\/)/g;

/** The distinctive-quote floor: a quoted phrase must be >= 8 chars AND carry
 *  at least one letter to count as distinctive — a short token or a pure
 *  number is prose noise, not a doctrine quote (the R3 false-positive guard's
 *  spirit). */
const DISTINCTIVE_QUOTE_MIN = 8;

/** THE DOCTRINE QUOTE EXTRACTION — the "quoted" segments (double- OR
 *  single-quoted, non-greedy, single-line) that qualify as distinctive. The
 *  extracted phrases are what MUST appear VERBATIM in the woven prompt. */
export function extractDoctrineQuotes(doctrine: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const consider = (raw: string): void => {
    const phrase = raw.trim();
    if (phrase.length < DISTINCTIVE_QUOTE_MIN) return; // too short — prose noise
    if (!/[A-Za-z]/.test(phrase)) return; // pure digits/symbols — not a doctrine quote
    const key = phrase.toLowerCase();
    if (seen.has(key)) return; // dedupe — the same quote is not double-flagged
    seen.add(key);
    found.push(phrase);
  };
  const dq = /"([^"\n]+)"/g;
  for (const m of doctrine.matchAll(dq)) consider(m[1]);
  const sq = /'([^'\n]+)'/g;
  for (const m of doctrine.matchAll(sq)) consider(m[1]);
  return found;
}

/** (b) THE VERBATIM-DOCTRINE CHECK — the doctrine arg's distinctive quotes
 *  MUST appear VERBATIM in the prompt. A paraphrase fails: the exact string is
 *  absent, so the check flags the missing quote — the §6.1 VERBATIM scenario. */
export function verbatimDoctrineFlags(promptText: string, doctrine: string): string[] {
  const flags: string[] = [];
  for (const phrase of extractDoctrineQuotes(doctrine)) {
    if (!promptText.includes(phrase)) {
      flags.push(
        'VERBATIM-DOCTRINE: the doctrine quote "' + phrase + '" does NOT appear verbatim in the woven prompt — ' +
        'the doctrine must be quoted word-for-word, a paraphrase fails the check',
      );
    }
  }
  return flags;
}

/** (c) THE FRESHNESS CHECK — the prompt vs the file states captured IN the
 *  loop. Three directions: (i) every spec filepath was READ (a state exists),
 *  (ii) every read state is REFLECTED in the prompt, (iii) every sha256 the
 *  prompt cites matches a captured state — the §6.1 FRESHNESS scenario. */
export function freshnessFlags(promptText: string, spec: BriefSpec, fileStates: FileState[]): string[] {
  const flags: string[] = [];
  const stateByPath = new Map(fileStates.map((f) => [f.path, f]));
  // (i) the spec's filepaths → the states: everything the spec requested was
  //     read in the loop (a read-before-write gap = the prompt cannot be fresh
  //     about a file the shadow never actually read)
  for (const p of spec.filepaths) {
    if (!stateByPath.has(p)) {
      flags.push(
        'FRESHNESS: ' + p + ' (the spec\'s filepaths) has NO file state captured in the loop — ' +
        'the shadow never read it; the prompt cannot be fresh about its contents',
      );
    }
  }
  // (ii) the states → the prompt: every read state is REFLECTED (a read file
  //      the prompt ignores = the prompt was built from a stale summary that
  //      predates the read)
  for (const f of fileStates) {
    if (!promptText.includes(f.path)) {
      flags.push(
        'FRESHNESS: ' + f.path + ' (read in the loop — ' + f.lineCount + ' lines, sha256 ' +
        f.sha256.substring(0, 12) + '…) is NOT referenced in the prompt — the current file state ' +
        'is not reflected; the prompt may be built from a stale summary',
      );
    }
  }
  // (iii) the prompt's sha256 claims → the states: a hash the prompt cites that
  //       matches NO captured state is stale or fabricated (the strong claim —
  //       the prompt must reflect the CURRENT file state, never a stale hash)
  const validShas = new Set(fileStates.map((f) => f.sha256));
  const shaRe = /\b[0-9a-f]{64}\b/g;
  for (const m of promptText.matchAll(shaRe)) {
    if (!validShas.has(m[0])) {
      flags.push(
        'FRESHNESS: the prompt cites sha256 ' + m[0].substring(0, 12) + '… which matches NO file state ' +
        'read in the loop — a stale or fabricated state claim',
      );
    }
  }
  return flags;
}

/** (a) THE RAW-MARKER CHECK — the shadow's addition to the firewall mirror:
 *  the validator scans [FILL only; the verifier demands 0 raw [WEAVE]/
 *  [FILEPATHS:]/[CONTEXT:]/[FILL:] markers — the weave left slots unfilled. */
export function rawMarkerFlags(promptText: string): string[] {
  const raw = (promptText.match(/\[(?:WEAVE|FILEPATHS|CONTEXT|FILL):/g) || []).length;
  if (raw === 0) return [];
  return [
    'RAW-MARKERS: ' + raw + ' raw template marker(s) remain in the prompt ([WEAVE:]/[FILEPATHS:]/[CONTEXT:]/[FILL:]) — ' +
    'the weave left slots unfilled',
  ];
}

/** THE CONTEXT BLOB — the concatenated context args (the same shape the
 *  trident-task-preflight feeds its repair). */
function contextBlob(spec: BriefSpec): string {
  return [
    spec.mission, spec.knownContext, spec.doctrine, spec.measurements,
    spec.acceptance, spec.taskTargets, spec.position,
  ].join(' ');
}

/** (d) THE MECHANICAL REPAIR v2 (replicated from the trident-task-preflight's
 *  mechanicallyRepair — the SAME logic, adapted to the BriefSpec):
 *  (a) any surviving legacy [FILEPATHS:]/[CONTEXT:]/[FILL:] markers are
 *      re-injected with the real values; (b) the task blocks + the reading
 *      order + the verification are APPENDED when ANY structural requirement
 *      is unmet (the paths < 3, no read command, the WHAT:/EXPECTED: counts,
 *      or the 125-line floor). The model under-production can no longer fail
 *      the validation. Exported so the runner can repair BEFORE appending. */
export function mechanicallyRepair(text: string, spec: BriefSpec): string {
  let out = text;
  const context = contextBlob(spec);
  // (a) the surviving legacy markers — re-inject with the real values
  if (/\[(?:FILEPATHS|CONTEXT|FILL):/.test(out)) {
    out = injectSlots(out, spec.filepaths, context);
  }
  // (b) the mechanical blocks when ANY structural requirement is unmet
  const pathCount = (out.match(ABS_PATH_RE) || []).length;
  const whatCount = (out.match(/\bWHAT:/g) || []).length;
  const expectedCount = (out.match(/\bEXPECTED:/g) || []).length;
  const lines = out.split('\n').length;
  if (pathCount < 3 || !/\bread\s+\//.test(out) || whatCount < 3 || expectedCount < 3 || lines < 125) {
    const taskBlocks = spec.filepaths.map((p: string) => {
      const name = path.basename(p).replace(/\.[^.]+$/, '') || 'theTarget';
      return 'Task A — the ' + name + ' role + exports.\n' +
        '  WHAT: the role, the exported surface, the internal structure of ' + p + '\n' +
        '  HOW: read ' + p + ' fully (2500-line passes); list the exports; describe the logic.\n' +
        '  WHY: the orchestrator must know the surface before specifying changes.\n' +
        '  EXPECTED: the per-file block: path, role, exports, key functions, line anchors.\n' +
        'Task B — the ' + name + ' anchors + data contracts.\n' +
        '  WHAT: the file:line anchors + the data contracts at the boundaries of ' + p + '\n' +
        '  HOW: grep each cited symbol in ' + p + '; trace the call chains to the consumers.\n' +
        '  WHY: the surgical edits target these exact lines — a wrong anchor derails the build.\n' +
        '  EXPECTED: the verification table: spec claim → current line → verdict (FOUND/MOVED/ABSENT).\n' +
        'Task C — the ' + name + ' failure modes.\n' +
        '  WHAT: the error paths + the failure handling in ' + p + '\n' +
        '  HOW: read the error branches; note the empty catches, the silent fallbacks.\n' +
        '  WHY: the audit gate flags silent failures; the extraction surfaces them.\n' +
        '  EXPECTED: the failure-mode list per file: the error, the handling, the verdict.';
    }).join('\n');
    out += '\n\nTHE MECHANICAL READING ORDER (the filepaths — one per line):\n' +
      spec.filepaths.map((p: string, i: number) => (i + 1) + '. ' + p).join('\n') +
      '\n\nTHE MECHANICAL TASKS (the per-file extraction — the WHAT/HOW/WHY/EXPECTED blocks):\n' + taskBlocks +
      '\n\nTHE MECHANICAL VERIFICATION (run ALL + return the outputs — each a SINGLE command):\n' +
      spec.filepaths.map((p: string) => 'read ' + p + ' (full pass, offset=0) — the file read to completion').join('\n');
  }
  return out;
}

/** THE FOUR CHECKS — the markers (the firewall mirror + the raw markers), the
 *  verbatim-doctrine, the freshness. Each flag names the check + the shortfall. */
function runChecks(promptText: string, spec: BriefSpec, fileStates: FileState[]): string[] {
  const flags: string[] = [];
  // (a) THE MARKERS — the firewall mirror's FAIL lines, condensed into a flag
  const base = validateTaskPromptLines(promptText);
  const failLines = base.lines.filter((l) => l.includes('[FAIL]'));
  if (failLines.length > 0) {
    flags.push(
      'MARKERS/STRUCTURE: ' + failLines.map((l) => l.replace(/^\s*\[FAIL\]\s*/, '').trim()).join('; '),
    );
  }
  flags.push(...rawMarkerFlags(promptText));
  // (b) THE VERBATIM-DOCTRINE
  flags.push(...verbatimDoctrineFlags(promptText, spec.doctrine));
  // (c) THE FRESHNESS
  flags.push(...freshnessFlags(promptText, spec, fileStates));
  return flags;
}

/** Is the flag a MECHANICAL failure (repairable by the append-blocks)? The
 *  verbatim-doctrine + the freshness failures are NOT repairable — the repair
 *  can only append structure, never fabricate a doctrine quote or a file state. */
function isMechanicalFlag(flag: string): boolean {
  return flag.startsWith('MARKERS/STRUCTURE') || flag.startsWith('RAW-MARKERS');
}

/** THE SILENT VERIFIER (Stage 6). silentVerify(promptText, spec, fileStates)
 *  → { flags, verified, repairedText? }. The error paths FIRST (the flags),
 *  the happy path second (verified). The repair runs INTERNALLY when the
 *  mechanical checks fail; the flags then describe the FINAL state the runner
 *  will persist, with the REPAIRED note so the caller sees the repair (L6). */
export function silentVerify(promptText: string, spec: BriefSpec, fileStates: FileState[]): SilentVerifyResult {
  // THE CHECKS on the input text
  const failures = runChecks(promptText, spec, fileStates);
  const mechanicalFails = failures.some(isMechanicalFlag);
  if (!mechanicalFails) {
    // no mechanical shortfall — no repair; the happy path
    return { flags: failures, verified: failures.length === 0 };
  }
  // THE REPAIR — the task blocks + the reading order + the verification
  // appended when the structure/floor is unmet (the v10b final-fallback)
  const repaired = mechanicallyRepair(promptText, spec);
  if (repaired === promptText) {
    // the repair could not change the text (e.g. a raw [WEAVE:] marker the
    // append-blocks cannot remove) — the original failures stand, unverified
    return { flags: failures, verified: false };
  }
  // THE RE-CHECK on the repaired text — the flags describe what will actually
  // be persisted (the runner writes repairedText)
  const repairedFailures = runChecks(repaired, spec, fileStates);
  const repairedMechanical = repairedFailures.some(isMechanicalFlag);
  const note = repairedMechanical
    ? 'REPAIRED-PARTIAL: the mechanical repair appended the task blocks + the reading order + the verification, but the structural shortfalls remain — the caller must fix the filepaths/context before dispatch'
    : 'REPAIRED: the mechanical repair appended the task blocks + the reading order + the verification to meet the structural floor';
  return {
    flags: [...repairedFailures, note],
    // the REPAIRED note is informational — verified reflects the FINAL failures only
    verified: !repairedMechanical && repairedFailures.length === 0,
    repairedText: repaired,
  };
}
