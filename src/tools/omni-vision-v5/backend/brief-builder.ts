// Omni Vision v5.0 — Backend Brief Builder (the DPL1 pipeline for vision)
// Builds the 250-500 line analysis brief the VLM sees.
// Structure replicated from buildL1ContentBrief (trident-tools.ts:316):
//   PRIMARY CONTEXT / KEY FACTS / WHAT TO GENERATE / REFERENCE / FORMAT / GROUNDING CONTRACT
// With the vision additions: CONTEXT CHAIN (prior frames) + MEDIA SPEC + OUTPUT FORMAT.
// The brief is the ENTIRE prompt the VLM sees — self-contained, no external fetch.

import type { AnalysisRecord } from './memory';

export interface BriefInput {
  projectId: string;
  mediaType: string;
  mediaPath: string;
  mediaContext: string;
  analysisGoal: string;
  outputRequirements: string[];
  storyline: string;
  artDirection?: string;
  priorAnalyses: AnalysisRecord[]; // the context chain (last N)
  epochSummary: string | null;
  frameSeq: number;
}

/**
 * The DPL1 brief — 250-500 lines. The VLM grounds its analysis against this.
 * "EVERY name, element, and structure mentioned is REAL and ACTUAL."
 */
export function buildVisionAnalysisBrief(input: BriefInput): string {
  const L: string[] = [];

  L.push(`# VISUAL ANALYSIS TASK: ${input.projectId}`);
  L.push(`Frame sequence: ${input.frameSeq} | Media: ${input.mediaType} | Source: ${input.mediaPath}`);
  L.push('');

  // ── THE PIXEL-SUPREMACY CONTRACT (the FIRST instruction — the ultimate law) ──
  L.push('## THE PIXEL-SUPREMACY CONTRACT — THE ULTIMATE LAW OF THIS ANALYSIS');
  L.push('');
  L.push('THE PIXELS IN THE MEDIA ARE THE ONLY GROUND TRUTH. EVERYTHING ELSE IS BELIEF.');
  L.push('');
  L.push('The storyline, the art direction, the media description, and the prior-frame analyses');
  L.push('below are BELIEFS — expectations about what SHOULD be in the media. They are NOT facts.');
  L.push('You MUST verify every belief against the actual pixels you see.');
  L.push('');
  L.push('THE FOUR LAWS:');
  L.push('1. PIXELS OVER CONTEXT: If ANY stated belief (the media description, the prior-frame');
  L.push('   analysis, the narrative arc) contradicts what the pixels actually show, THE PIXELS');
  L.push('   WIN. Report what you SEE, never what you were TOLD. Fabricating a value to match');
  L.push('   the context is the WORST possible error — it is a hallucination.');
  L.push('2. EXACT-VALUE DISCIPLINE: Every number you report (HP values, scores, coordinates,');
  L.push('   counts) MUST be read from the rendered pixels. If a digit is ambiguous or too');
  L.push('   small to read reliably, say "UNREADABLE — approximate: X" — NEVER invent a');
  L.push('   confident value you did not actually see. A wrong-but-confident number is a');
  L.push('   hallucination. An honest "unreadable" is a correct analysis.');
  L.push('3. CONTEXT-MISMATCH FLAGGING: If the media description or the prior-frame chain');
  L.push('   claims a state that the pixels do NOT show (e.g., the description says "game over"');
  L.push('   but the pixels show HP 80 and no game-over text), you MUST flag the mismatch');
  L.push('   explicitly under a "CONTEXT_MISMATCH" note and report the ACTUAL pixel state.');
  L.push('   The mismatch is a finding, not something to smooth over.');
  L.push('4. PRIOR FRAMES ARE HISTORY: The prior-frame analyses describe what those frames');
  L.push('   showed. THIS frame is a new observation. If this frame differs from the prior');
  L.push('   chain, that is a change to report — not a reason to force this frame to match');
  L.push('   the history.');
  L.push('');

  // ── PRIMARY CONTEXT — the storyline (a BELIEF to verify, not ground truth) ──
  L.push('## PRIMARY CONTEXT — THE STORYLINE AND ART DIRECTION (BELIEF — VERIFY AGAINST PIXELS)');
  L.push('');
  L.push('The following is the macro storyline and art direction of this project.');
  L.push('EVERY character, location, element, and design rule mentioned below is REAL and ACTUAL');
  L.push('as a DESIGN SPEC — it defines what SHOULD be in the media.');
  L.push('You MUST use ONLY these names and structures in your analysis.');
  L.push('NEVER invent alternative names, fictional elements, or idealized designs.');
  L.push('If the storyline says the HUD uses grid-12 spacing, analyze against grid-12 — NOT grid-8.');
  L.push('If the art direction says the character sprite is cel-shaded, flag any non-cel-shaded render.');
  L.push('CRITICAL: these rules are the LENS for judging the pixels — they do NOT replace the pixels.');
  L.push('A design rule tells you what to check FOR; the pixels tell you what IS.');
  L.push('');
  L.push(input.storyline);
  L.push('');

  if (input.artDirection && input.artDirection.trim().length > 0) {
    L.push('## ART DIRECTION — THE VISUAL SPEC');
    L.push('');
    L.push(input.artDirection);
    L.push('');
  }

  // ── CONTEXT CHAIN — PRIOR FRAMES (HISTORY — this frame is a NEW observation) ──
  if (input.priorAnalyses.length > 0) {
    L.push('## CONTEXT CHAIN — PRIOR FRAME ANALYSES (HISTORY — VERIFY, DO NOT CONFORM)');
    L.push('');
    L.push('The following are the analyses of the previous frames in this session.');
    L.push('They describe what THOSE frames showed. They are HISTORY, not a script for this frame.');
    L.push('Use them to detect continuity: what was present, what was flagged, what the arc was.');
    L.push('If THIS frame contradicts a prior finding, FLAG the contradiction explicitly —');
    L.push('the pixels of THIS frame are the truth, and a change from the history is a FINDING.');
    L.push('NEVER force this frame to match the prior chain. NEVER report a prior value as if');
    L.push('it were visible in this frame — if the value is not in THIS frame\'s pixels, say so.');
    L.push('Do NOT repeat prior findings verbatim — reference them by frame and build on them.');
    L.push('');
    for (const a of input.priorAnalyses) {
      const excerpt = a.analysis_json.length > 1200
        ? a.analysis_json.substring(0, 1200) + '\n... (truncated)'
        : a.analysis_json;
      L.push(`### Frame ${a.seq} (${a.frame_id})`);
      L.push('```');
      L.push(excerpt);
      L.push('```');
      L.push('');
    }
  }

  if (input.epochSummary) {
    L.push('## EPOCH SUMMARY — THE NARRATIVE ARC');
    L.push('');
    L.push(input.epochSummary.length > 1500
      ? input.epochSummary.substring(0, 1500) + '\n... (truncated)'
      : input.epochSummary);
    L.push('');
  }

  // ── KEY FACTS — MUST APPEAR IN OUTPUT (the output requirements) ──
  L.push('## KEY FACTS — MUST APPEAR IN OUTPUT');
  L.push('');
  for (const req of input.outputRequirements) {
    L.push(`- ${req}`);
  }
  L.push('');

  // ── THE ANALYSIS MISSION ──
  L.push('## THE ANALYSIS MISSION');
  L.push('');
  L.push(input.analysisGoal);
  L.push('');

  // ── MEDIA SPEC — WHAT THIS MEDIA IS (a description to VERIFY — never a script) ──
  L.push('## MEDIA DESCRIPTION — WHAT THE CALLER BELIEVES THIS MEDIA IS (VERIFY AGAINST PIXELS)');
  L.push('');
  L.push('The caller provided the following description of this media. It is a BELIEF —');
  L.push('the caller\'s expectation of what the media shows. You MUST verify it against the');
  L.push('actual pixels. If the description contradicts the pixels, THE PIXELS WIN —');
  L.push('report what you see and flag the mismatch under a "CONTEXT_MISMATCH" note.');
  L.push('');
  L.push(input.mediaContext);
  L.push('');

  // ── OUTPUT FORMAT ──
  L.push('## OUTPUT FORMAT');
  L.push('');
  L.push('Produce the analysis with EXACTLY these sections (the KEY FACTS above):');
  L.push('');
  for (const req of input.outputRequirements) {
    L.push(`### ${req.toUpperCase()}`);
    L.push('');
  }
  L.push('Target 200-600 lines depending on the media complexity. Maximum 1200 lines.');
  L.push('Be PRECISE, not CONCISE. Reference specific frame regions by position');
  L.push('("top-left HUD cluster", "center character sprite", "bottom status bar").');
  L.push('');

  // ── GROUNDING CONTRACT ──
  L.push('## GROUNDING CONTRACT');
  L.push('');
  L.push('Every element you name MUST be visible in the media or flagged as UNVERIFIED.');
  L.push('Every number you report MUST be read from the rendered pixels.');
  L.push('If the media description, the storyline, or the prior-frame chain contradicts the');
  L.push('pixels, THE PIXELS WIN — flag the mismatch under "CONTEXT_MISMATCH", never conform.');
  L.push('A wrong-but-confident number is a hallucination. An honest "UNREADABLE" is correct.');
  L.push('Unknown or unverifiable elements: label them "UNVERIFIED" — NEVER fabricate.');
  L.push('Contradictions with prior frames MUST be flagged under a "REGRESSION" note.');
  L.push('No meta-commentary. No preamble. Output ONLY the analysis sections.');
  L.push('');

  return L.join('\n');
}

/**
 * Compute a stable brief hash (for reproducibility — the brief that produced an analysis).
 */
export function briefHash(brief: string): string {
  // FNV-1a 64-bit — deterministic, dependency-free
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < brief.length; i++) {
    h ^= BigInt(brief.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
