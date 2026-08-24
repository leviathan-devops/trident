// ═══ TEMPLATE INTENT — THE INPUT-FILE FILTER THAT MAKES TEMPLATE MISMATCH
// IMPOSSIBLE (2026-08-23 — the operator: "this template mismatch is retarded
// how do we make this impossible? some lexicon intent detector ... t.e.b
// machine that can auto match the correct template to the task? Some filter
// on the inputfile? this cannot fucking waste 15 minutes like this") ═══
//
// THE FAILURE CLASS THIS KILLS: the live wave-1787506367557 burned ~15 minutes
// generating an E3 (research/web) prompt for a CODE-EXTRACTION job (local .ts
// filepaths + "extract the test inventory" mission), failing DPL1 validation
// twice (129 lines + fetch-form verification) before the loud refusal. The
// mismatch was DECIDABLE FROM THE SPEC FILE ITSELF at validation time — zero
// LLM calls needed. Now it is: validateSpecFile refuses the wave BEFORE any
// generation when the declared template contradicts the spec's own signals.
//
// THE ISE CANON (Lexicon_Grade_Intelligent_Systems_Engineering_Bible §1.2):
// - The typed PatternFamily members below are the vocabulary.
// - The matchers are mechanical DETECTORS ONLY — the decision is the state
//   machine (IDLE→PARSED→ANALYZED→CLASSIFIED→EMITTED, fail-state INCONCLUSIVE).
// - Every finding exists ONLY as the evidence triad {Pattern, State, Evidence}.

import type { SpecDiagnostic } from './wave-spec.ts';

// ── THE TYPED EVIDENCE (the spec's own fields — the input-file filter reads
//    NOTHING else; no LLM, no network, no side effects) ──

export interface SpecIntentEvidence {
  name: string;
  template: string;
  filepaths: string[];
  mission: string;
  taskTargets?: string;
}

export interface IntentTriad {
  patternId: string;
  state: 'PARSED' | 'CLASSIFIED';
  /** WHERE the signal fired: the spec field + the matched excerpt. */
  field: string;
  excerpt: string;
}

export type IntentVerdict =
  | { state: 'INCONCLUSIVE'; reason: string }
  | {
      state: 'CLASSIFIED' | 'CONTESTED';
      family: TemplateFamily;
      confidence: number;          // votes for the winner / total votes
      triads: IntentTriad[];
      runnerUp?: { family: TemplateFamily; votes: number };
    };

export type TemplateFamily = 'code-extract' | 'docs-deep' | 'research' | 'failure-evidence' | 'build';

// ── THE SIGNAL LEXICON (the detectors — regexes are DETECTORS ONLY; every
//    threshold is NAMED data on its pattern, never a bare magic ladder) ──

/** Local filesystem code/doc targets — the code-extract/docs-deep shape. */
const LOCAL_CODE_PATH_RE = /^\/(home|root|tmp|var|usr|etc|opt|workspace|app|mnt|src)\/.+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|sh|md|json|ya?ml)$/i;
/** Web targets — the research shape. */
const WEB_TARGET_RE = /^https?:\/\//i;
/** Code-action verb lexicon (extract/inventory/map/audit a CODEBASE). */
const CODE_ACTION_VERBS = /\b(extract|inventory|map|enumerate|audit|trace|catalogue|catalog|list exports|imports graph|call ?graph|file:?line anchors?)\b/i;
/** Research verb lexicon (gather from EXTERNAL sources / synthesize positions). */
const RESEARCH_ACTION_VERBS = /\b(research|investigate|survey|fetch|scrape|search the web|web search|compare (sources|approaches|libraries)|state of the art|benchmark against external|cite (sources|urls))\b/i;
/** Failure forensics lexicon. */
const FAILURE_ACTION_VERBS = /\b(failure|postmortem|post-mortem|incident|root cause|regression|rca|debug (trail|history)|autopsy)\b/i;
/** Build verb lexicon (produce/change code artifacts). */
const BUILD_ACTION_VERBS = /\b(implement|build|write (the )?(code|module|feature)|create (the )?(file|component)|refactor|fix the bug|patch|ship)\b/i;

interface FamilyPattern {
  id: string;
  kind: 'filepath-shape' | 'mission-verb' | 'taskTargets-verb';
  /** THE NAMED WEIGHTS (bible: thresholds are named member data, never a
   *  magic ladder): VERB signals express INTENT (weight 2); FILEPATH SHAPE
   *  expresses compatible CONTEXT only (weight 1) — building a module also
   *  happens on local paths, so shape must never outvote a matching verb. */
  detector: (evidence: SpecIntentEvidence) => IntentTriad[];
}

const KIND_WEIGHT: Record<FamilyPattern['kind'], number> = {
  'mission-verb': 2,
  'taskTargets-verb': 2,
  'filepath-shape': 1,
};

/** Which families each pattern votes FOR — shape patterns are multi-family
 *  context (a local tree serves extract/docs/build alike); verb patterns are
 *  intent-specific. */
const FAMILY_PATTERNS: (FamilyPattern & { votesFor: TemplateFamily[] })[] = [
  {
    id: 'code-local-paths', kind: 'filepath-shape',
    votesFor: ['code-extract', 'docs-deep', 'build'],
    // ≥1 local code/doc target ⇒ the job works ON the local tree.
    detector: (ev) => ev.filepaths
      .filter((fp) => LOCAL_CODE_PATH_RE.test(fp.trim()))
      .map((fp) => ({ patternId: 'code-local-paths', state: 'PARSED' as const, field: 'filepaths', excerpt: fp })),
  },
  {
    id: 'research-web-targets', kind: 'filepath-shape', votesFor: ['research'],
    detector: (ev) => ev.filepaths
      .filter((fp) => WEB_TARGET_RE.test(fp.trim()))
      .map((fp) => ({ patternId: 'research-web-targets', state: 'PARSED' as const, field: 'filepaths', excerpt: fp })),
  },
  {
    id: 'code-action-verbs', kind: 'mission-verb', votesFor: ['code-extract'],
    detector: (ev) => CODE_ACTION_VERBS.test(ev.mission)
      ? [{ patternId: 'code-action-verbs', state: 'PARSED', field: 'mission', excerpt: (ev.mission.match(CODE_ACTION_VERBS) ?? [''])[0] }]
      : [],
  },
  {
    id: 'research-action-verbs', kind: 'mission-verb', votesFor: ['research'],
    detector: (ev) => RESEARCH_ACTION_VERBS.test(ev.mission)
      ? [{ patternId: 'research-action-verbs', state: 'PARSED', field: 'mission', excerpt: (ev.mission.match(RESEARCH_ACTION_VERBS) ?? [''])[0] }]
      : [],
  },
  {
    id: 'failure-action-verbs', kind: 'mission-verb', votesFor: ['failure-evidence'],
    detector: (ev) => FAILURE_ACTION_VERBS.test(ev.mission)
      ? [{ patternId: 'failure-action-verbs', state: 'PARSED', field: 'mission', excerpt: (ev.mission.match(FAILURE_ACTION_VERBS) ?? [''])[0] }]
      : [],
  },
  {
    id: 'build-action-verbs', kind: 'mission-verb', votesFor: ['build'],
    detector: (ev) => BUILD_ACTION_VERBS.test(ev.mission)
      ? [{ patternId: 'build-action-verbs', state: 'PARSED', field: 'mission', excerpt: (ev.mission.match(BUILD_ACTION_VERBS) ?? [''])[0] }]
      : [],
  },
  {
    id: 'taskTargets-build-verbs', kind: 'taskTargets-verb', votesFor: ['build'],
    detector: (ev) => ev.taskTargets && BUILD_ACTION_VERBS.test(ev.taskTargets)
      ? [{ patternId: 'taskTargets-build-verbs', state: 'PARSED', field: 'taskTargets', excerpt: (ev.taskTargets.match(BUILD_ACTION_VERBS) ?? [''])[0] }]
      : [],
  },
];

// ── THE DECLARED-FAMILY MAP (template enum → family) ──

export function templateToFamily(template: string): TemplateFamily | null {
  if (/^E1$/i.test(template)) return 'code-extract';
  if (/^E2$/i.test(template)) return 'docs-deep';
  if (/^E3$/i.test(template)) return 'research';
  if (/^E4$/i.test(template)) return 'failure-evidence';
  if (/^B[1-5]$/i.test(template)) return 'build';
  return null;
}

/** docs-deep shares the code-extract signals (both read local trees) — the
 *  E1↔E2 confusion is harmless (same runtime behavior); only cross-KIN mismatches block. */
const KIN_GROUPS: TemplateFamily[][] = [
  ['code-extract', 'docs-deep'],
  ['research'],
  ['failure-evidence'],
  ['build'],
];
function sameKin(a: TemplateFamily, b: TemplateFamily): boolean {
  return KIN_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

// ── THE STATE MACHINE (the decision layer — IDLE→PARSED→ANALYZED→CLASSIFIED
//    →EMITTED; the fail-state INCONCLUSIVE replaces any default-pass) ──

/** THE CONTEST MARGIN (named threshold data — the bible: a threshold is a
 *  pattern member, never an anonymous ladder rung): the winner needs at least
 *  ONE more vote than every other family to reach CLASSIFIED; ties emit
 *  CONTESTED (warning-grade), zero votes emit INCONCLUSIVE (silent pass —
 *  the filter never blocks what it cannot judge). */
const CONTEST_MARGIN = 1;

export function classifySpecIntent(ev: SpecIntentEvidence): IntentVerdict {
  // PARSED: fire every detector, collect triads.
  const allTriads: IntentTriad[] = [];
  for (const p of FAMILY_PATTERNS) {
    try { allTriads.push(...p.detector(ev)); } catch { /* a broken detector is skipped, never fatal */ }
  }
  if (allTriads.length === 0) {
    return { state: 'INCONCLUSIVE', reason: 'no filepath-shape or action-verb signals fired on this spec' };
  }
  // ANALYZED: weighted tally by family (verbs=2 intent, shapes=1 context —
  // KIND_WEIGHT, named above). Every triad's weight rides its pattern's kind.
  const weighted = new Map<TemplateFamily, { weight: number; triads: IntentTriad[] }>();
  for (const t of allTriads) {
    const p = FAMILY_PATTERNS.find((x) => x.id === t.patternId)!;
    const w = KIND_WEIGHT[p.kind];
    for (const fam of p.votesFor) {
      const entry = weighted.get(fam) ?? { weight: 0, triads: [] };
      // The triad is recorded ONCE per firing pattern (evidence), while the
      // weight spreads across the pattern's compatible families:
      if (entry.triads.length === 0 || fam === p.votesFor[0]) entry.triads.push(t);
      entry.weight += w;
      weighted.set(fam, entry);
    }
  }
  const ranked = [...weighted.entries()]
    .map(([family, e]) => ({ family, weight: e.weight, triads: e.triads }))
    .sort((a, b) => b.weight - a.weight);
  const top = ranked[0];
  const runnerUp = ranked[1] ? { family: ranked[1].family, votes: ranked[1].weight } : undefined;
  const totalWeight = ranked.reduce((s, r) => s + r.weight, 0);
  // CLASSIFIED vs CONTESTED vs INCONCLUSIVE — the named margin decides.
  if (!runnerUp || top.weight - runnerUp.votes >= CONTEST_MARGIN) {
    return { state: 'CLASSIFIED', family: top.family, confidence: top.weight / totalWeight, triads: top.triads, runnerUp };
  }
  return {
    state: 'CONTESTED', family: top.family, confidence: top.weight / totalWeight,
    triads: top.triads, runnerUp,
  };
}

/** THE GATE FUNCTION — returns an ERROR diagnostic when the declared template's
 *  family is a DIFFERENT KIN than the classified intent (blocks generate),
 *  a WARNING when contested or kin-adjacent, and NOTHING when inconclusive
 *  or matching. This is the input-file filter: it runs inside validateSpecFile
 *  BEFORE any generation — a mismatch costs ZERO minutes, ever again. */
export function validateTemplateMatch(ev: SpecIntentEvidence): SpecDiagnostic | null {
  const declared = templateToFamily(ev.template);
  if (!declared) return null;   // invalid templates are caught by the existing check
  const verdict = classifySpecIntent(ev);
  if (verdict.state === 'INCONCLUSIVE') return null;

  if (verdict.state === 'CONTESTED') {
    return {
      agent: ev.name, field: 'template', severity: 'warning',
      message: 'CONTESTED intent: ' + verdict.family + ' (' + Math.round(verdict.confidence * 100) + '% of signals)'
        + ' vs ' + (verdict.runnerUp?.family ?? '?') + ' — declared template=' + ev.template + ' (' + declared + ')',
      fix: 'if this is intentional keep the template; otherwise align template with the dominant signals',
    };
  }
  if (verdict.family === declared || sameKin(verdict.family, declared)) return null;
  // THE BLOCK: cross-kin mismatch — the exact class that burned 15 minutes.
  const sig = triadSummaryOf(verdict.triads);
  return {
    agent: ev.name, field: 'template', severity: 'error',
    message: 'TEMPLATE MISMATCH: template=' + ev.template + ' (' + declared + ') but the spec signals say '
      + verdict.family.toUpperCase() + ' (' + sig + '). This job would generate with the wrong weave '
      + 'and fail DPL1 after minutes of wasted generation.',
    fix: 'set template=' + suggestedTemplate(verdict.family) + ' (or rewrite mission/filepaths so they genuinely need ' + declared + ')',
  };
}

/** The evidence-triad summary for the refusal text — the {Pattern, State,
 *  Evidence} rule made visible: the orchestrator sees WHICH signals fired. */
function triadSummaryOf(triads: IntentTriad[]): string {
  return triads.slice(0, 3).map((t) => t.patternId + ':' + t.field + '="' + t.excerpt.slice(0, 40) + '"').join(', ')
    + (triads.length > 3 ? ' +' + (triads.length - 3) + ' more' : '');
}

export function suggestedTemplate(family: TemplateFamily): string {
  switch (family) {
    case 'code-extract': return 'E1';
    case 'docs-deep': return 'E2';
    case 'research': return 'E3';
    case 'failure-evidence': return 'E4';
    case 'build': return 'B1-B5 (pick the build variant)';
  }
}
