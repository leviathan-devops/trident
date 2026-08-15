// Omni Vision v5.0 — Backend Validator
// The mechanical quality gate for the omni_vision tool args.
// DP L1 pattern: every short field is NAMED in the error with the exact shortfall.
// The bare 'prompt' arg is REJECTED with a named remedy.
// NO LLM calls. Pure string arithmetic. Runs BEFORE any generation.

// ── The floors (the tool's LAW — force the caller to bring real context) ──
export const MEDIA_CONTEXT_MIN = 500;
export const ANALYSIS_GOAL_MIN = 200;
export const OUTPUT_REQ_MIN = 3;
export const STORYLINE_MIN = 200;
export const ART_DIRECTION_MIN = 100;

export interface OmniVisionContextArgs {
  media_context?: string;
  analysis_goal?: string;
  output_requirements?: string[];
  storyline?: string;
  art_direction?: string;
  prompt?: string; // legacy — REJECTED
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate the api-mode context args.
 * Returns { valid: true } or { valid: false, error } with EVERY short field named.
 */
export function validateOmniVisionInput(args: OmniVisionContextArgs): ValidationResult {
  const errors: string[] = [];

  // ── The bare-prompt legacy path — REJECTED with the named remedy ──
  const hasStructured =
    typeof args.media_context === 'string' && args.media_context.length > 0 &&
    typeof args.analysis_goal === 'string' && args.analysis_goal.length > 0 &&
    Array.isArray(args.output_requirements) && args.output_requirements.length > 0;

  if (args.prompt && !hasStructured) {
    return {
      valid: false,
      error:
        `ARGUMENT VALIDATION FAILED: the bare 'prompt' arg is REJECTED.\n` +
        `Provide the structured context args instead (Trident-style):\n` +
        `  - media_context: ${MEDIA_CONTEXT_MIN}+ chars — WHAT this media is and should contain\n` +
        `  - analysis_goal: ${ANALYSIS_GOAL_MIN}+ chars — WHAT to determine or verify\n` +
        `  - output_requirements: ${OUTPUT_REQ_MIN}+ items — the required output sections\n` +
        `  - storyline (optional after first call): ${STORYLINE_MIN}+ chars — the macro narrative\n` +
        `  - art_direction (optional): ${ART_DIRECTION_MIN}+ chars — design tokens / visual spec\n` +
        `A bare prompt gives the VLM zero grounding — it flies blind. See omni_vision_help.`,
    };
  }

  // ── Per-field floors (named shortfalls) ──
  if (typeof args.media_context !== 'string' || args.media_context.length < MEDIA_CONTEXT_MIN) {
    const len = typeof args.media_context === 'string' ? args.media_context.length : 0;
    errors.push(
      `  - 'media_context' ${len}c need ${MEDIA_CONTEXT_MIN}+. WHAT this media is and should contain: ` +
      `the scene, the asset, the frame, the shot. "A screenshot of the game" is too thin.`,
    );
  }

  if (typeof args.analysis_goal !== 'string' || args.analysis_goal.length < ANALYSIS_GOAL_MIN) {
    const len = typeof args.analysis_goal === 'string' ? args.analysis_goal.length : 0;
    errors.push(
      `  - 'analysis_goal' ${len}c need ${ANALYSIS_GOAL_MIN}+. WHAT to determine or verify — ` +
      `NOT "describe this". Example: "verify the HUD alignment against the design spec, ` +
      `identify contrast violations, confirm the sprite matches the art direction".`,
    );
  }

  if (!Array.isArray(args.output_requirements) || args.output_requirements.length < OUTPUT_REQ_MIN) {
    const count = Array.isArray(args.output_requirements) ? args.output_requirements.length : 0;
    errors.push(
      `  - 'output_requirements' ${count} items need ${OUTPUT_REQ_MIN}+. The mandatory output ` +
      `sections. Example: ["FINDINGS", "STORYLINE_ALIGNMENT", "ISSUES_BY_SEVERITY", "VERIFY_DIRECTIVE"]`,
    );
  }

  // ── Optional fields: only validated IF present ──
  if (typeof args.storyline === 'string' && args.storyline.length > 0 && args.storyline.length < STORYLINE_MIN) {
    errors.push(
      `  - 'storyline' ${args.storyline.length}c need ${STORYLINE_MIN}+ when provided. The macro ` +
      `narrative: the game world, the art direction, the characters, the intended tone, ` +
      `what "correct" looks like. (Omit it entirely to use the backend-stored bible.)`,
    );
  }

  if (typeof args.art_direction === 'string' && args.art_direction.length > 0 && args.art_direction.length < ART_DIRECTION_MIN) {
    errors.push(
      `  - 'art_direction' ${args.art_direction.length}c need ${ART_DIRECTION_MIN}+ when provided. ` +
      `The design tokens / visual spec. (Omit it entirely to use the backend-stored spec.)`,
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: `ARGUMENT VALIDATION FAILED (omni_vision api mode — the quality gate):\n${errors.join('\n')}`,
    };
  }

  return { valid: true };
}

/**
 * Build the output-requirements checklist string used in the brief.
 */
export function outputRequirementsToChecklist(reqs: string[]): string {
  return reqs.map((r) => `- ${r}`).join('\n');
}
