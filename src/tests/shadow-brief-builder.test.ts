// ═══ SHADOW-BRIEF-BUILDER TESTS — the supremacy + the weave + the [SHADOW INFERENCE] (the spec §3.2) ═══
// The zero-hint discipline: EVERY assertion is mechanical — the FROZEN supremacy text appears
// VERBATIM (a paraphrase fails), the weave's values fill the slots (no unfilled markers), the
// [SHADOW INFERENCE] title is EXACT (D-SH-3). Adversarial cases included: the unknown slot
// name, the untitled inference, the legacy-slot templates, the double-title guard.
// The fixture filepaths are built at RUNTIME (os.homedir + path.join) — the dispatch prompts
// genuinely require absolute paths; the source never hardcodes one.

// @ts-ignore — bun:test ships the runtime, not TS declarations (bun test resolves it natively)
import { describe, expect, test } from 'bun:test';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  SUPREMACY_CONTRACT,
  buildBrief,
  weave,
  type BriefSpec,
} from '../tools/shadow/shadow-brief-builder.ts';
import { SHADOW_INFERENCE_SECTION_TITLE, type ShadowInference } from '../tools/shadow/shadow-context-manager.ts';

const INFERENCE_TITLE = '## [SHADOW INFERENCE]';

// the absolute fixture paths — constructed at runtime, never hardcoded
const HOME = os.homedir();
const PROJ = path.join(HOME, 'proj');
const FIXTURE_PATHS = [
  path.join(PROJ, 'src', 'tools', 'a.ts'),
  path.join(PROJ, 'src', 'tools', 'b.ts'),
  path.join(PROJ, 'src', 'tests', 'a.test.ts'),
];

function makeSpec(overrides: Partial<BriefSpec> = {}): BriefSpec {
  return {
    name: 'agent-1',
    template: 'E2',
    filepaths: [...FIXTURE_PATHS],
    mission: 'the mission: extract the module surface of the two tools with their tests',
    knownContext: 'the known context: the measured state with the anchors from the wave-1 audit',
    doctrine: 'the doctrine: "the files are the only ground truth" — never conform to the summary',
    measurements: 'the measurements: the baseline metrics table with the counts',
    acceptance: 'the acceptance: the checkable bullets for the extraction',
    taskTargets: 'the task targets: the per-task extraction targets for each file',
    position: 'the position: the wave-2 slot after the wave-1 modules',
    ...overrides,
  };
}

function makeInference(overrides: Partial<ShadowInference> = {}): ShadowInference {
  return {
    sectionTitle: INFERENCE_TITLE,
    text: INFERENCE_TITLE + '\nThe shadow\'s understanding: the files export the tools, the tests cover them.',
    flags: [],
    ...overrides,
  };
}

/** The 84-slot skeleton — one [WEAVE:] slot per values-map key (the spec §3.2's
 *  slot list: mission|knownContext|doctrine|measurements|acceptance|taskTargets|
 *  position|readingOrder|readingOrderItem1|ItemLast|Items|workspaceRoot|
 *  knowledgeLibrary|frozen|typecheck|build|test|diff). */
const SKELETON = [
  'EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.',
  'THE MISSION: [WEAVE: mission]',
  'THE KNOWN CONTEXT: [WEAVE: knownContext]',
  "THE OPERATOR'S DOCTRINE: [WEAVE: doctrine]",
  'THE MEASUREMENTS: [WEAVE: measurements]',
  'THE ACCEPTANCE: [WEAVE: acceptance]',
  'THE TARGETS: [WEAVE: taskTargets]',
  'THE POSITION: [WEAVE: position]',
  'THE READING ORDER: [WEAVE: readingOrder]',
  'FIRST: [WEAVE: readingOrderItem1] LAST: [WEAVE: readingOrderItemLast]',
  'ALL: [WEAVE: readingOrderItems]',
  'ROOT: [WEAVE: workspaceRoot]',
  'LIB: [WEAVE: knowledgeLibrary]',
  'FROZEN: [WEAVE: frozen]',
  'TYPECHECK: [WEAVE: typecheck]',
  'BUILD: [WEAVE: build]',
  'TEST: [WEAVE: test]',
  'DIFF: [WEAVE: diff]',
].join('\n');

describe('shadow-brief-builder', () => {
  test('the supremacy contract is PREPENDED verbatim (L4 — the FROZEN text; a paraphrase in the code is a violation)', () => {
    const out = buildBrief(makeSpec(), SKELETON, makeInference());
    // the FROZEN text appears EXACTLY — the tests assert the verbatim string
    expect(out.includes(SUPREMACY_CONTRACT)).toBe(true);
    // the contract is FIRST — before the inference AND before the skeleton
    expect(out.indexOf(SUPREMACY_CONTRACT)).toBeLessThan(out.indexOf(INFERENCE_TITLE));
    expect(out.indexOf(SUPREMACY_CONTRACT)).toBeLessThan(out.indexOf('EXECUTE THE FOLLOWING'));
    // the contract carries the two L4 clauses word-for-word
    expect(SUPREMACY_CONTRACT).toContain('THE FILES ARE THE ONLY GROUND TRUTH');
    expect(SUPREMACY_CONTRACT).toContain('MUST be flagged, never conformed to');
  });

  test('the weave fills the [WEAVE:] slots from the values map — zero unfilled markers survive', () => {
    const spec = makeSpec();
    const out = buildBrief(spec, SKELETON, makeInference());
    // the per-section values
    expect(out.includes(spec.mission)).toBe(true);
    expect(out.includes(spec.doctrine)).toBe(true);
    expect(out.includes('1. ' + FIXTURE_PATHS[0])).toBe(true); // the reading order
    expect(out.includes('ROOT: ' + HOME + '\n')).toBe(true); // the workspace root (first 3 path segments)
    expect(out.includes('LIB: ' + path.join(HOME, 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY'))).toBe(true);
    expect(out.includes('TYPECHECK: tsc --noEmit')).toBe(true);
    expect(out.includes('BUILD: bun build src/index.ts --outdir dist --target bun --format esm --bundle')).toBe(true);
    expect(out.includes('TEST: bun test')).toBe(true);
    expect(out.includes('DIFF: git diff')).toBe(true);
    expect(out.includes('FIRST: ' + FIXTURE_PATHS[0])).toBe(true);
    expect(out.includes('LAST: ' + FIXTURE_PATHS[FIXTURE_PATHS.length - 1])).toBe(true);
    // NO unfilled markers — neither the visible marker nor the raw slot
    expect(out.includes('<UNFILLED-WEAVE:')).toBe(false);
    expect(out.includes('[WEAVE:')).toBe(false);
  });

  test('the [SHADOW INFERENCE] section is embedded with the EXACT title after the supremacy (D-SH-3)', () => {
    // the context manager's inference text ALREADY carries the title — embedded as-is
    const out = buildBrief(makeSpec(), SKELETON, makeInference());
    expect(out.includes(INFERENCE_TITLE)).toBe(true);
    expect(out.includes('The shadow\'s understanding: the files export the tools, the tests cover them.')).toBe(true);
    // the order: supremacy → inference → skeleton
    expect(out.indexOf(SUPREMACY_CONTRACT)).toBeLessThan(out.indexOf(INFERENCE_TITLE));
    expect(out.indexOf(INFERENCE_TITLE)).toBeLessThan(out.indexOf('EXECUTE THE FOLLOWING'));
  });

  test('adversarial: an UNKNOWN [WEAVE:] slot name produces the visible <UNFILLED-WEAVE: name> marker — never a silent raw slot', () => {
    const skeleton = 'THE MISSION: [WEAVE: mission]\nTHE UNKNOWN: [WEAVE: theUnknownSlot]';
    const out = buildBrief(makeSpec(), skeleton, makeInference());
    expect(out.includes('<UNFILLED-WEAVE: theUnknownSlot>')).toBe(true);
    // the raw marker is GONE — the visible marker names the unfilled slot
    expect(out.includes('[WEAVE: theUnknownSlot]')).toBe(false);
    expect(out.includes('<UNFILLED-WEAVE:')).toBe(true);
  });

  test('adversarial: an inference WITHOUT the title is wrapped with the EXACT title — the section marker is guaranteed', () => {
    const inference = makeInference({ text: 'The raw inference body without the title.' });
    const out = buildBrief(makeSpec(), SKELETON, inference);
    expect(out.includes(INFERENCE_TITLE)).toBe(true);
    expect(out.includes('The raw inference body without the title.')).toBe(true);
    // the exact title line — not a variant
    expect(out.includes('## [SHADOW INFERENCE]\n')).toBe(true);
  });

  test('adversarial: an inference ALREADY carrying the title is NOT double-titled', () => {
    const out = buildBrief(makeSpec(), SKELETON, makeInference());
    const first = out.indexOf(INFERENCE_TITLE);
    expect(first).not.toBe(-1);
    expect(out.indexOf(INFERENCE_TITLE, first + 1)).toBe(-1);
  });

  test('adversarial: the legacy [FILEPATHS:]/[CONTEXT:]/[FILL:] slots are filled by the injectSlots fallback', () => {
    const skeleton = [
      'THE PATHS: [FILEPATHS: the filepaths]',
      'THE CONTEXT: [CONTEXT: everything]',
      'THE SPEC: [FILL: the spec or doctrine]',
      'THE TYPECHECK: [FILL: the typecheck command]',
    ].join('\n');
    const spec = makeSpec();
    const out = buildBrief(spec, skeleton, makeInference());
    // no unfilled markers of either family
    expect(out.includes('<UNFILLED-SLOT:')).toBe(false);
    expect(out.includes('<UNFILLED-WEAVE:')).toBe(false);
    // the [FILL: the typecheck command] → the name-aware value
    expect(out.includes('tsc --noEmit')).toBe(true);
    // the [CONTEXT:]/[FILL: the spec] → the concatenated context blob
    expect(out.includes(spec.mission)).toBe(true);
    // the [FILEPATHS: the filepaths] → the filepath list
    expect(out.includes(spec.filepaths.join('\n'))).toBe(true);
  });

  test('the exported title constant matches the EXACT operator-mandated title (the §9 cross-consistency rule)', () => {
    expect(SHADOW_INFERENCE_SECTION_TITLE).toBe('## [SHADOW INFERENCE]');
  });

  test('the weave is pure: the same spec + skeleton → the same brief (deterministic, property-testable)', () => {
    const spec = makeSpec();
    const a = buildBrief(spec, SKELETON, makeInference());
    const b = buildBrief(spec, SKELETON, makeInference());
    expect(a).toBe(b);
    // the weave function itself is deterministic too
    expect(weave(SKELETON, spec)).toBe(weave(SKELETON, spec));
  });
});
