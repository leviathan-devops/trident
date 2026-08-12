// ============================================================================
// file: src/tests/shadow-extract.test.ts
//
// THE REASONING-TOKEN EXTRACTION TESTS (2026-08-07 — THE CONTAMINATION FIX).
// The incident: the shadow brain's output contained its chain-of-thought — the
// model QUOTED the output contract early ("EXECUTE THE FOLLOWING", include
// section markers...) so the OLD extraction (the FIRST indexOf) cut at position
// 0 INSIDE the thinking and the entire drafting session rode along as "the
// prompt" (2 of the 4 live wave prompts were contaminated — the operator's
// catch). The structural gates PASSED because the contamination CONTAINS the
// markers.
//
// THE FIX UNDER TEST: extractFinalPrompt (the LAST real template opener —
// the "EXECUTE THE FOLLOWING <TYPE> VERBATIM" form — the thinking's bare
// quotes never match the full pattern) + detectThinkingLeak (the drafting-
// marker lexicon + the first-line opener check) + silentVerify's THINKING-LEAK
// flag + the re-extraction repair. PLUS the operator's [SHADOW INFERENCE]
// design (2026-08-07): the model-written forward-map brief after the
// ~~~~~~~~~~~ delimiter satisfies the presence requirement — the mechanical
// inference.text appends ONLY when neither form exists.
//
// The fixtures reproduce the EXACT live contamination shapes (task-tool-
// internals: thinking → fenced draft → [SHADOW INFERENCE]; batch-async-events:
// thinking → plain draft → mechanical sections) so the regression is real.
// ============================================================================

import { describe, expect, test } from 'bun:test';
import {
  extractFinalPrompt,
  detectThinkingLeak,
  silentVerify,
  stripEchoedInferenceIntro,
  SHADOW_INFERENCE_DELIMITER,
  SUPREMACY_CONTRACT,
  type VerifyResult,
} from '../tools/shadow/shadow-runner.ts';
import { SHADOW_INFERENCE_SECTION_TITLE, type ShadowInference } from '../tools/shadow/shadow-context-manager.ts';
import type { AgentSpec } from '../tools/trident-task-preflight.ts';

// ── THE FIXTURES (the live contamination shapes) ──

/** The task-tool-internals shape: the thinking QUOTES the contract at line 1
 *  (the old indexOf landed at 0 → NO cut → everything rode along). Then a
 *  planning session, then the real draft inside a code fence. */
function contaminatedFencedShape(): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING", include section markers (THE MISSION / THE ACCEPTANCE / THE READING ORDER / THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), 3+ absolute filepaths, concrete verification commands, doctrine quoted verbatim, per-task WHAT/HOW/WHY/EXPECTED blocks.');
  L.push('');
  L.push('The skeleton provided in the brief already has most of the structure — I need to weave everything in. Let me examine the skeleton carefully:');
  L.push('');
  L.push('The skeleton has:');
  L.push('- EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY.');
  L.push('- THE MISSION: (mission arg)');
  L.push('- THE ACCEPTANCE CRITERIA: (static bullets + acceptance)');
  L.push('');
  L.push('Let me plan the tool calls:');
  L.push('1. stat on the four files to confirm line counts');
  L.push('2. grep on wave-dispatch.ts for key anchors');
  L.push('');
  L.push('Let me think about whether I need to call them. The shadow inference is already provided.');
  L.push('');
  L.push('Now let me think about the known measurements table. The measurements are the four items.');
  L.push('');
  L.push('Let me start writing:');
  L.push('```');
  L.push('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY.');
  L.push('You do NOT write, edit, modify, create, or delete any file.');
  L.push('');
  L.push('WORKSPACE ROOT: /home/leviathan');
  L.push('');
  L.push('THE MISSION:');
  L.push('FIND the task tool\'s ACTUAL implementation inside the opencode runtime.');
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA (all must be met):');
  L.push('- The report MUST answer: (1) how the task tool spawns a child session step-by-step.');
  L.push('');
  L.push('THE READING ORDER (READ BEFORE ANY EXECUTION):');
  L.push('1. /home/leviathan/.opencode');
  L.push('2. /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts');
  L.push('');
  L.push('THE KNOWN CONTEXT (the measured state — do NOT re-derive, verify the anchors):');
  L.push('- Trident v4.4.2 is mid-overhaul.');
  L.push('');
  L.push('THE CONSTRAINTS:');
  L.push('- READ-ONLY. No writes, no edits.');
  L.push('');
  L.push('THE VERIFICATION:');
  L.push('1. which opencode — the runtime binary location');
  L.push('2. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts');
  L.push('');
  L.push('THE RETURN FORMAT:');
  L.push('1. THE REGION MAP — the per-file blocks.');
  L.push('RETURN THE FULL REPORT — NEVER an empty return. Every claim carries a file:line anchor.');
  L.push('```');
  L.push('');
  L.push('## [SHADOW INFERENCE]');
  L.push('');
  L.push('The shadow backend\'s understanding of the files and the task.');
  return L.join('\n');
}

/** The batch-async-events shape: thinking with a section PLAN at line 1, then
 *  a plain (unfenced) real draft. */
function contaminatedPlainShape(): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING (1-2 lines)');
  L.push('2. Agent identity + READ-ONLY (2 lines)');
  L.push('3. WORKSPACE ROOT (1 line)');
  L.push('4. THE RESEARCH SOURCES (4 lines)');
  L.push('');
  L.push("That's roughly 250-350. I need to be careful. Let me write it out and count.");
  L.push('');
  L.push('The filepaths (3+):');
  L.push('- /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts');
  L.push('');
  L.push('Let me be careful. Let me write it:');
  L.push('');
  L.push('---');
  L.push('');
  L.push('EXECUTE THE FOLLOWING RESEARCH TASK VERBATIM. You are a trident_explore agent — READ-ONLY.');
  L.push('You do NOT write, edit, modify, create, or delete any file. You produce a cited report, not changes.');
  L.push('');
  L.push('WORKSPACE ROOT: /home/leviathan');
  L.push('');
  L.push('THE RESEARCH QUESTIONS + THE CONTEXT:');
  L.push('RESEARCH + VERIFY three mechanisms: (1) THE BATCH, (2) ASYNC BACKGROUND EXECUTION, (3) THE EVENT BUS.');
  L.push('');
  L.push('THE MISSION:');
  L.push('Answer the research questions with CITED evidence.');
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA:');
  L.push('- Every load-bearing claim carries a citation (the URL or the file:line).');
  L.push('');
  L.push('THE READING ORDER (READ BEFORE ANY EXECUTION):');
  L.push('1. /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts (479 lines — read the FULL file)');
  L.push('2. https://opencode.ai/docs (subagents + plugins + events + SDK reference)');
  L.push('');
  L.push('THE CONSTRAINTS:');
  L.push('- READ-ONLY. No writes, no edits.');
  L.push('');
  L.push('THE VERIFICATION (run ALL + return the outputs):');
  L.push('1. webfetch https://opencode.ai/docs/subagents');
  L.push('2. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts');
  L.push('');
  L.push('THE RETURN FORMAT:');
  L.push('1. THE ANSWERS — per question with the citations.');
  L.push('RETURN THE FULL REPORT — NEVER an empty return.');
  return L.join('\n');
}

/** The CLEAN shape + the operator's model-written [SHADOW INFERENCE] brief
 *  after the ~~~~~~~~~~~ delimiter (the new design). */
function cleanWithModelBrief(): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY.');
  L.push('You do NOT write, edit, modify, create, or delete any file.');
  L.push('');
  L.push('THE MISSION:');
  L.push('LOCATE the opencode runtime + SDK installation on this machine.');
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA (all must be met):');
  L.push('- The report MUST answer: (1) where the SDK lives.');
  L.push('');
  L.push('THE READING ORDER (READ BEFORE ANY EXECUTION):');
  L.push('1. /home/leviathan/.opencode');
  L.push('');
  L.push('THE CONSTRAINTS:');
  L.push('- READ-ONLY.');
  L.push('');
  L.push('THE VERIFICATION:');
  L.push('1. which opencode');
  L.push('');
  L.push('THE RETURN FORMAT:');
  L.push('1. THE ANSWERS.');
  L.push('');
  L.push(SHADOW_INFERENCE_DELIMITER);
  L.push('');
  L.push('[SHADOW INFERENCE]');
  L.push('');
  L.push('The shadow backend\'s distilled understanding: the SDK lives under /home/leviathan/.opencode; the wave-dispatch\'s getOpencodeClient can return null when the global is unset; the subagent must verify the parentID field in the SDK types rather than trusting the spec\'s line cites.');
  return L.join('\n');
}

function cleanNoBrief(): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. You are a trident_build agent.');
  L.push('You implement; you do NOT redesign.');
  L.push('');
  L.push('THE MISSION:');
  L.push('Build the thing.');
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA (all must be met):');
  L.push('- The build passes.');
  L.push('');
  L.push('THE READING ORDER (READ BEFORE ANY EXECUTION):');
  L.push('1. /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/package.json');
  L.push('');
  L.push('THE CONSTRAINTS:');
  L.push('- The hardcode ban.');
  L.push('');
  L.push('THE VERIFICATION:');
  L.push('1. bun run build');
  L.push('');
  L.push('THE RETURN FORMAT:');
  L.push('1. The diff summary.');
  return L.join('\n');
}

function makeSpec(): AgentSpec {
  return {
    name: 'test-agent',
    template: 'E1',
    filepaths: ['/home/leviathan/.opencode'],
    mission: 'the mission',
    knownContext: 'the known context',
    doctrine: 'THE OPERATOR\'S RULING: "READ-ONLY exploration" — the quote must survive',
    measurements: 'the measurements',
    acceptance: 'the acceptance',
    taskTargets: 'the targets',
    position: 'the position',
  };
}

function makeInference(): ShadowInference {
  return {
    sectionTitle: SHADOW_INFERENCE_SECTION_TITLE,
    text: SHADOW_INFERENCE_SECTION_TITLE + '\n\nThe mechanical fallback inference.',
    flags: [],
  };
}

// ── THE TESTS ──

describe('shadow-extract — extractFinalPrompt (the LAST real opener, the fences, the idempotence)', () => {
  test('the fenced contamination: the thinking is DISCARDED, the draft + the inference survive', () => {
    const out = extractFinalPrompt(contaminatedFencedShape());
    expect(out.startsWith('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM')).toBe(true);
    // the drafting text is gone
    expect(out).not.toContain('Let me plan the tool calls');
    expect(out).not.toContain('The skeleton provided in the brief');
    expect(out).not.toContain('Let me start writing');
    // the fence is stripped
    expect(out).not.toContain('```');
    // the real draft + the inference survive
    expect(out).toContain('THE MISSION:');
    expect(out).toContain('FIND the task tool\'s ACTUAL implementation');
    expect(out).toContain('## [SHADOW INFERENCE]');
  });

  test('the plain contamination: the section-plan thinking is DISCARDED, the draft survives', () => {
    const out = extractFinalPrompt(contaminatedPlainShape());
    expect(out.startsWith('EXECUTE THE FOLLOWING RESEARCH TASK VERBATIM')).toBe(true);
    expect(out).not.toContain('Agent identity + READ-ONLY (2 lines)');
    expect(out).not.toContain("That's roughly 250-350");
    expect(out).not.toContain('Let me be careful');
    expect(out).toContain('THE RESEARCH QUESTIONS + THE CONTEXT:');
    expect(out).toContain('THE EVENT BUS');
  });

  test('a clean prompt + the model brief passes through UNCHANGED (idempotent)', () => {
    const clean = cleanWithModelBrief();
    const out = extractFinalPrompt(clean);
    expect(out).toBe(clean);
  });

  test('a clean prompt without a brief passes through UNCHANGED', () => {
    const clean = cleanNoBrief();
    const out = extractFinalPrompt(clean);
    expect(out).toBe(clean);
  });

  test('empty input returns empty — never a crash', () => {
    expect(extractFinalPrompt('')).toBe('');
    expect(extractFinalPrompt('   ')).toBe('');
  });

  test('the NO-FABRICATION candidate: a model fragment WITHOUT an opener is NOT repaired into a fake (the evaluateCandidate mechanicallyRepair removal — the live host-gen-a finding)', () => {
    // the live shape: the model's round-1 text (a tool call + a partial draft)
    // — the OLD evaluateCandidate called mechanicallyRepair which APPENDED the
    // mechanical scaffold (the reading order/tasks/verification) + the scaffold
    // CONTAINED the validation markers → the fake VALIDATED → shipped. The new
    // candidate ships AS THE MODEL WROTE IT — nothing appended.
    const modelFragment = "I'll start by verifying the key claims against the actual files before writing the dispatch prompt.\n\n<TOOL_CALL id=\"read-wave-1\" name=\"read_file\">\n{ \"filepath\": \"/x.ts\" }\n[/TOOL_CALL]\n\nTHE MISSION:\npartial draft";
    const out = extractFinalPrompt(modelFragment);
    // no opener → the text is kept AS-IS (the extraction never fabricates)
    expect(out).toContain('partial draft');
    expect(out).toContain('I\'ll start by verifying');
    // the extractFinalPrompt itself does NOT append the scaffold
    expect(out).not.toContain('THE MECHANICAL READING ORDER');
    expect(out).not.toContain('THE MECHANICAL TASKS');
    expect(out).not.toContain('THE MECHANICAL VERIFICATION');
  });

  test('the BRACKET TOLERANCE: the angle-bracket <TOOL_CALL> form is parsed + stripped (the live host-gen-a finding — the read_file never ran because the parser matched only square brackets)', () => {
    // the parse side: the angle-bracket open must be EXECUTED
    // (the parse happens in the runner — here we verify the strip side: the
    // raw marker text must NOT pollute the output)
    const withAngle = "I'll start by verifying.\n\n<TOOL_CALL id=\"c1\" name=\"read_file\">\n{ \"filepath\": \"/x.ts\" }\n[/TOOL_CALL]\n\nTHE MISSION: the real draft";
    // the strip regex (same as the runner's stripToolCalls) removes the
    // angle-bracket form
    const stripped = withAngle.replace(/[\[<]TOOL_CALL\s+id="[^"]*"\s+name="[^"]*"\s*[\]>][\s\S]*?\[\/TOOL_CALL\]/g, ' ').trim();
    expect(stripped).not.toContain('TOOL_CALL');
    expect(stripped).not.toContain('read_file');
    expect(stripped).toContain('THE MISSION: the real draft');
    // the square-bracket form still strips (no regression)
    const withSquare = "[TOOL_CALL id=\"c1\" name=\"read_file\"]\n{ \"filepath\": \"/x.ts\" }\n[/TOOL_CALL]\n\nTHE MISSION: the real draft";
    const strippedSquare = withSquare.replace(/[\[<]TOOL_CALL\s+id="[^"]*"\s+name="[^"]*"\s*[\]>][\s\S]*?\[\/TOOL_CALL\]/g, ' ').trim();
    expect(strippedSquare).not.toContain('TOOL_CALL');
    expect(strippedSquare).toContain('THE MISSION: the real draft');
  });

  test('the ECHOED-INTRO STRIP: the model\'s copied "The shadow backend\'s understanding... assembled from the session stream" intro is removed — the section is LITERALLY [SHADOW INFERENCE] + the content (the live host-final-1 finding)', () => {
    const withEcho = SHADOW_INFERENCE_DELIMITER + '\n\n## [SHADOW INFERENCE]\n\nThe shadow backend\'s understanding of the files and the task — assembled from the session stream, the context args, and the file excerpts. THE FILES ARE THE ONLY GROUND TRUTH (L4); the context args are BELIEF — verified against the files, NEVER conformed to.\n\n### What the files actually are (verified from the reads)\n- wave-dispatch.ts is 496 lines.';
    const out = stripEchoedInferenceIntro(withEcho);
    expect(out).not.toContain('assembled from the session stream');
    expect(out).not.toContain('The shadow backend\'s understanding of the files and the task');
    // the header + the model's content survive
    expect(out).toContain('## [SHADOW INFERENCE]');
    expect(out).toContain('### What the files actually are (verified from the reads)');
    expect(out).toContain('wave-dispatch.ts is 496 lines');
    // the supremacy contract (a DIFFERENT sentence) is NEVER touched
    const withSupremacy = 'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES.';
    expect(stripEchoedInferenceIntro(withSupremacy)).toBe(withSupremacy);
    // a clean prompt without the echo passes through unchanged
    const clean = cleanWithModelBrief();
    expect(stripEchoedInferenceIntro(clean)).toBe(clean);
  });

  test('the multiple-draft case: the LAST opener wins (the model\'s final draft)', () => {
    const L: string[] = [];
    L.push('thinking text first');
    L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. Draft one — incomplete.');
    L.push('THE MISSION: draft one');
    L.push('some more thinking between the drafts');
    L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. Draft two — the final.');
    L.push('THE MISSION: draft two');
    L.push('THE ACCEPTANCE CRITERIA:');
    L.push('- complete.');
    const out = extractFinalPrompt(L.join('\n'));
    expect(out.startsWith('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. Draft two — the final.')).toBe(true);
    expect(out).toContain('THE ACCEPTANCE CRITERIA:');
    expect(out).not.toContain('Draft one');
    expect(out).not.toContain('thinking text first');
    expect(out).not.toContain('some more thinking between the drafts');
  });

  test('the DRAFT-SCAFFOLDING strip: the numbered prefixes + the (blank) placeholders are removed (the Agent-3 finding)', () => {
    const L: string[] = [];
    L.push('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY.');
    L.push('2 You do NOT write, edit, modify, create, or delete any file.');
    L.push('3 (blank)');
    L.push('4 WORKSPACE ROOT: /root/.config');
    L.push('(blank)');
    L.push('6 THE MISSION:');
    L.push('7 Locate the opencode runtime.');
    L.push('1. /root/.config/opencode/plugins/trident/dist/index.js');
    L.push('Task 1 — the per-file extraction.');
    const out = extractFinalPrompt(L.join('\n'));
    // the numbered prefixes are stripped
    expect(out).not.toContain('2 You do NOT');
    expect(out).not.toContain('3 (blank)');
    expect(out).not.toContain('(blank)');
    expect(out).not.toContain('4 WORKSPACE ROOT');
    // the legit numbered content SURVIVES (a period / a word follows)
    expect(out).toContain('1. /root/.config/opencode/plugins/trident/dist/index.js');
    expect(out).toContain('Task 1 — the per-file extraction.');
    // the stripped content is present
    expect(out).toContain('You do NOT write, edit, modify, create, or delete any file.');
    expect(out).toContain('WORKSPACE ROOT: /root/.config');
    expect(out).toContain('THE MISSION:');
    expect(out).toContain('Locate the opencode runtime.');
  });
});

describe('shadow-extract — detectThinkingLeak (the drafting-marker lexicon + the first-line check)', () => {
  test('the fenced contamination: a drafting marker is found', () => {
    const leak = detectThinkingLeak(contaminatedFencedShape());
    expect(leak).not.toBeNull();
  });

  test('the plain contamination: a drafting marker is found', () => {
    const leak = detectThinkingLeak(contaminatedPlainShape());
    expect(leak).not.toBeNull();
  });

  test('the clean prompt + the model brief: NO leak (the brief is the distilled understanding, not drafting)', () => {
    expect(detectThinkingLeak(cleanWithModelBrief())).toBeNull();
  });

  test('the clean prompt without a brief: NO leak', () => {
    expect(detectThinkingLeak(cleanNoBrief())).toBeNull();
  });

  test('a text that does not begin with the opener is flagged (the extraction failed)', () => {
    const leak = detectThinkingLeak('some text that never reaches the opener\nmore text');
    expect(leak).not.toBeNull();
    expect(leak).toContain('first line');
  });

  test('the SUPREMACY-prefixed artifact is NOT flagged (the Agent-3 finding: the detector must not flag its own repair)', () => {
    const supremacyPrefixed = SUPREMACY_CONTRACT + '\n\n' + cleanWithModelBrief();
    expect(detectThinkingLeak(supremacyPrefixed)).toBeNull();
  });

  test('empty input: no leak, no crash', () => {
    expect(detectThinkingLeak('')).toBeNull();
    expect(detectThinkingLeak('   ')).toBeNull();
  });
});

describe('shadow-extract — silentVerify: the THINKING-LEAK flag + the re-extraction repair + the brief acceptance', () => {
  test('a contaminated input: flagged THINKING-LEAK + the repair re-extracts at the LAST opener', () => {
    const spec = makeSpec();
    const inference = makeInference();
    const res: VerifyResult = silentVerify(contaminatedFencedShape(), spec, [], inference);
    expect(res.verified).toBe(false);
    expect(res.flags.some((f) => f.startsWith('THINKING-LEAK'))).toBe(true);
    // the repair: the drafting text discarded, the real draft wins — the
    // SUPREMACY contract opens the prompt (the L4 framing, by design), the
    // extracted draft follows it
    expect(res.repaired).toContain('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM');
    expect(res.repaired.indexOf('EXECUTE THE FOLLOWING FORENSIC')).toBeGreaterThan(
      res.repaired.indexOf('THE FILES ARE THE ONLY GROUND TRUTH'),
    );
    expect(res.repaired).not.toContain('Let me plan the tool calls');
  });

  test('the model-written brief (the delimiter form) SATISFIES the [SHADOW INFERENCE] presence requirement', () => {
    const spec = makeSpec();
    const res: VerifyResult = silentVerify(cleanWithModelBrief(), spec, [], makeInference());
    expect(res.flags.some((f) => f.startsWith('SHADOW-INFERENCE'))).toBe(false);
  });

  test('a clean prompt WITHOUT any inference form: flagged + the mechanical fallback is BANNED (the operator\'s ruling: the real model brief or just the prompt)', () => {
    const spec = makeSpec();
    const inference = makeInference();
    const res: VerifyResult = silentVerify(cleanNoBrief(), spec, [], inference);
    expect(res.flags.some((f) => f.startsWith('SHADOW-INFERENCE'))).toBe(true);
    // THE NO-MECHANICAL-FALLBACK (2026-08-07): the mechanical inference.text
    // is NEVER appended — the prompt ships without any [SHADOW INFERENCE]
    // section (the real model brief or just the prompt)
    expect(res.repaired).not.toContain(SHADOW_INFERENCE_SECTION_TITLE);
    expect(res.repaired).not.toContain('The mechanical fallback inference.');
  });

  test('the supremacy contract: a prompt missing it gets it prepended (the L4 framing is the behavior)', () => {
    const spec = makeSpec();
    const res: VerifyResult = silentVerify(cleanNoBrief(), spec, [], makeInference());
    expect(res.repaired).toContain('THE FILES ARE THE ONLY GROUND TRUTH');
    expect(res.repaired.indexOf(SUPREMACY_CONTRACT.substring(0, 30))).toBeLessThan(res.repaired.indexOf('EXECUTE THE FOLLOWING'));
  });
});
