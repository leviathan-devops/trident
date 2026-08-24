// ============================================================================
// file: src/tools/shadow/shadow-brief-builder.ts
//
// §3.2 of SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md — THE BRIEF + THE SUPREMACY.
//
// buildBrief(spec, skeleton, inference) → string — the Stage-3 assembly:
//   (a) PREPENDS THE SUPREMACY CONTRACT (L4 — THE FILES ARE THE ONLY GROUND
//       TRUTH) — the FROZEN text from the spec §3.2, exported as
//       SUPREMACY_CONTRACT. The contract's framing IS the behavior (the M5
//       lesson): a context arg that contradicts the file contents MUST be
//       flagged, never conformed to. A paraphrase in the code is a violation
//       of the §9 cross-consistency rule — the constant is the single source.
//   (b) WEAVES the 84 slots ([WEAVE: mission|knownContext|doctrine|...])
//       from the values map — the same values the trident-task-preflight's
//       weave uses (the operator's "the module's own weave with the same
//       values"). The legacy [FILEPATHS:]/[CONTEXT:]/[FILL:] slots are filled
//       by the injectSlots fallback (the pre-v11 templates).
//   (c) EMBEDS THE [SHADOW INFERENCE] section (D-SH-3 — the operator's "just
//       title this [SHADOW INFERENCE] though") — the inference text, titled
//       EXACTLY "[SHADOW INFERENCE]", inserted AFTER the supremacy contract
//       and BEFORE the woven skeleton. The subagent receives the inference
//       PRE-INFERENCED — the shadow's understanding written on top of the
//       inference, so the prompt is significantly more targeted.
//
// THE COMPOSITION ORDER (the architecture): supremacy → inference → skeleton.
// The supremacy is FIRST because the brief's framing decides whether the
// model conforms to belief or reports truth (the macro spec Part 1 Stage 3).
// ============================================================================

// THE §9 SINGLE SOURCE — the slot values + the legacy injection + the weave
// live in shadow-slot-injector.ts (ONE place); this module imports + re-exports
// them so the existing consumers (shadow-verify, the tests) stay green.
export { injectSlots, weave } from './shadow-slot-injector.ts';
import { injectSlots, weave } from './shadow-slot-injector.ts';
import { SHADOW_INFERENCE_SECTION_TITLE, type ShadowInference } from './shadow-context-manager.ts';

/** THE FROZEN L4 SUPREMACY CONTRACT — the spec §3.2's exact wording. THE
 *  §9 cross-consistency rule: this text is FROZEN — a paraphrase in the code
 *  is a violation. The tests assert the built brief contains this EXACT
 *  string. */
export const SUPREMACY_CONTRACT =
  'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST ' +
  'THE FILES. A context arg that contradicts the file contents MUST be flagged, never ' +
  'conformed to. Every claim about the files must be READ from them, never assumed.';

/** THE CONTEXT ARGS — the brief's spec surface. Structurally compatible with
 *  BOTH the trident-task-preflight AgentSpec (name/template/filepaths + the 7
 *  context args) AND the shadow-context-manager ContextArgs (filepaths + the 7
 *  context args) — the runner passes whichever it holds; the brief builder
 *  consumes ONLY the fields it needs. */
export interface BriefSpec {
  name?: string;
  template?: string;
  filepaths: string[];
  mission: string;
  knownContext: string;
  doctrine: string;
  measurements: string;
  acceptance: string;
  taskTargets: string;
  position: string;
}

/** THE INFERENCE EMBEDDING GUARD — the section must carry the EXACT
 *  "## [SHADOW INFERENCE]" title (D-SH-3). The context-manager's assembled
 *  inference text already starts with the title; a raw inference body (or an
 *  empty one) gets the title PREPENDED — the section marker is guaranteed. */
function ensureInferenceTitle(text: string): string {
  const trimmed = (text ?? '').trim();
  if (trimmed.startsWith(SHADOW_INFERENCE_SECTION_TITLE) || trimmed.startsWith('## [SHADOW INFERENCE]')) return trimmed;
  return SHADOW_INFERENCE_SECTION_TITLE + '\n' + trimmed;
}

/** THE BRIEF BUILDER (Stage 3 — the brief + the supremacy). buildBrief(spec,
 *  skeleton, inference) → the COMPLETE prompt the subagent receives:
 *  the supremacy contract FIRST, the [SHADOW INFERENCE] second, the woven
 *  skeleton third. The section order IS the architecture (the macro spec
 *  Part 1 Stage 3) — the supremacy frames the context as BELIEF so the model
 *  reports truth, never conforms. */
export function buildBrief(spec: BriefSpec, skeleton: string, inference: ShadowInference): string {
  const L: string[] = [];
  // (a) THE SUPREMACY CONTRACT — PREPENDED, the frozen L4 text (verbatim)
  L.push('## THE SUPREMACY CONTRACT — THE ULTIMATE LAW OF THIS DISPATCH (L4)');
  L.push('');
  L.push(SUPREMACY_CONTRACT);
  L.push('');
  // (c) THE [SHADOW INFERENCE] — inserted AFTER the supremacy, BEFORE the
  //     woven skeleton (the subagent receives the inference pre-inferenced)
  L.push(ensureInferenceTitle(inference.text));
  L.push('');
  // (b) THE WEAVE — the 84-slot skeleton woven from the values map
  L.push(weave(skeleton, spec));
  return L.join('\n');
}
