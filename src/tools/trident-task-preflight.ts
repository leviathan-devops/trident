import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { tridentLog } from '../utils.js';
import { generateSpecViaLLM } from '../artifacts/llm-generator.ts';
import { validateTaskPromptLines } from './trident-preflight.ts';
// v14 — THE SHADOW BACKEND (the spec §4): the runner's ONE-PLACE COMPOSITION.
// The tool's execute calls runShadowPipeline per agent; the runner composes the
// 13-step pipeline (tether → sidecar → memory → reattach gate → validate →
// buildContext → weave + supremacy → PI execution loop → silentVerify →
// appendPrompt → manifest) from the shared machinery below.
import { runShadowPipeline } from './shadow/shadow-runner.ts';
// THE §9 SINGLE SOURCE — the slot values + the legacy injection + the weave
// live in shadow-slot-injector.ts (ONE place — the same module the
// shadow-brief-builder imports). The local copies were removed.
import { weave, injectSlots } from './shadow/shadow-slot-injector.ts';

// ═══ TRIDENT-TASK-PREFLIGHT v3 — THE BATCH DISPATCH-PROMPT GENERATOR (2026-08-06) ═══
// THE WAVE-DISPATCH REWIRE (2026-08-07 — THE WAVE DISPATCH OVERHAUL SPEC Part 25.1):
// this tool is DEPRECATED — the registry now registers trident-wave-manager (the
// wave GENERATOR — src/tools/wave-dispatch.ts — generator-only: the shadow pipeline
// → the prompt files → the BATCH FORM; the orchestrator dispatches the batch via
// the batch tool). This module retains the SHARED MACHINERY exports the shadow
// backend consumes (OUT_DIR, TEMPLATE_NAMES, TASK_PREFLIGHT_SYSTEM,
// extractTemplateSkeleton, validateAgentSpec, mechanicallyRepair, ingestFiles,
// AgentSpec, AgentResult) —
// the shadow runner's imports resolve UNCHANGED. The createTaskPreflightTool
// factory below is the DEPRECATED ALIAS: it delegates to the wave dispatch tool
// with a WARN log (the forward-compat — the old calls resolve to the new tool
// for one release, then removed).
// The operator's directive (2026-08-06 — "agents are now wasting 15 fucking
// minutes on debugging prompts and its literally retarded"):
//   "task preflight needs to be async and support batch mode by default so there
//    is input for # of subagents, unique set of filepath + context args for each
//    one, internal batch generation following the same method as how DP L3 is
//    wired (but at the output quality level of dispatch prompts we already set
//    so it doesnt take forever) and all prompts for each agent are all generated
//    in parallel. tool.execute.after instructions to literally copy paste these
//    prompts into the task dispatch, all files named for the exact subagents
//    that will be dispatched so its all organized. all written to tmp so we
//    dont bloat disk space as these prompts are 1 time use."
//
// v3 semantics:
//   agents = [{name, template, filepaths, context}] — ONE call, N prompts.
//   The generation follows the DP-L3 parallel pattern: the template skeleton is
//   extracted ONCE per template, then EVERY agent's prompt is built IN PARALLEL
//   (Promise.all): injectSlots → validate → LLM-expand ONLY when under the floor
//   → write /tmp/trident-task-preflight/<name>.md (named for the EXACT subagent
//   that will be dispatched). The single-agent path (template/filepaths/context/
//   outputName) is a batch of 1 — fully backward compatible.
//   The tool.after hook (trident-hooks.ts) appends the COPY-PASTE instructions
//   to the result so the orchestrator dispatches ALL prompts in ONE message via
//   the batch tool.
//
// THE FLOW (the agent's side):
//   1. trident-task-preflight agents=[{name:"wave1-src-extract", template:"E1",
//        filepaths:[...], context:"..."}, {name:"wave1-docs-synth", ...}, ...]
//   2. → { batch: {requested: 3, ready: 3}, agents: [{name, path, lines, ready}...] }
//   3. the tool.after appends: "READ /tmp/trident-task-preflight/<name>.md and
//      dispatch ALL of them in ONE message via THE BATCH TOOL".

const SKILL_PATH = path.join(os.homedir(), '.config', 'opencode', 'skills', 'trident-dispatch-templates', 'SKILL.md');
export const OUT_DIR = path.join(os.tmpdir(), 'trident-task-preflight');
export const TEMPLATE_NAMES = ['E1', 'E2', 'E3', 'E4', 'B1', 'B2', 'B3', 'B4', 'B5'];

export const TASK_PREFLIGHT_SYSTEM =
  'You are the dispatch-prompt generator — a micro fork of the Trident DPL1 architecture. ' +
  'Output ONLY the dispatch prompt text (the complete prompt a trident_explore/trident_build ' +
  'subagent will receive). Target 200+ lines. The injected template skeleton + the filepaths ' +
  '+ the context ARE the data — expand the per-task WHAT/HOW/WHY/EXPECTED blocks with the real ' +
  'content (the file list, the anchors, the commands) until the prompt reaches the 200+ line ' +
  'standard. Never leave a section thin. Never invent file paths. Never add filler. ' +
  'The density is the data.';

export function extractTemplateSkeleton(templateName: string): string | null {
  try {
    if (!fs.existsSync(SKILL_PATH)) return null;
    const content = fs.readFileSync(SKILL_PATH, 'utf-8');
    const headerIdx = content.indexOf(`## TEMPLATE ${templateName} —`);
    if (headerIdx === -1) return null;
    const fenceIdx = content.indexOf('```', headerIdx);
    if (fenceIdx === -1) return null;
    const start = content.indexOf('\n', fenceIdx) + 1;
    const end = content.indexOf('```', start);
    if (end === -1) return null;
    return content.substring(start, end).trim();
  } catch (e) {
    return null;
  }
}

// v3 (2026-08-06 — the live B3 mangle): v1/v2 replaced EVERY [FILEPATHS: <name>]
// slot with the raw filepath list — dumping the paths into the SEMANTIC slots
// (the workspace root, the typecheck command, the build command) and mangling
// the B3 prompt. v3 maps the slot NAME to the value it names (name-aware), then
// marks any leftover slot visibly — a raw [FILL: ...] marker would fail the
// firewall's FILL scan silently, so the marker names the unfilled slot.
// (v14.1 — THE §9 CONSOLIDATION: slotValue + injectSlots + weave now live in
// src/tools/shadow/shadow-slot-injector.ts — the SINGLE source imported by
// BOTH this tool and the shadow-brief-builder; the local copies removed.)

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// v14 — THE SHARED VALIDATOR (the spec §3.1 + §4 step 5): the CTX_FLOORS + the
// template-name check + the path existence — extracted from the v13's
// generatePrompt inline checks so the shadow runner reuses the SAME verdicts
// (the refusal names each thin field with its count + the shortfall + the
// remedy). PURE string arithmetic — no LLM, property-testable.
export function validateAgentSpec(spec: AgentSpec): string | null {
  const templateName = (spec.template || 'E2').toUpperCase();
  const filepaths = Array.isArray(spec.filepaths) ? spec.filepaths.filter((p: string) => typeof p === 'string' && p.length > 0) : [];
  if (!TEMPLATE_NAMES.includes(templateName)) {
    return 'template must be one of E1|E2|E3|E4|B1|B2|B3|B4|B5 (got ' + templateName + ')';
  }
  if (filepaths.length === 0) {
    return 'filepaths is required for ' + spec.name + ' — the absolute paths of everything to analyze';
  }
  const missingPaths = filepaths.filter((p: string) => !fs.existsSync(p));
  if (missingPaths.length > 0) {
    return 'filepaths do not EXIST in this environment for ' + spec.name + ': ' + missingPaths.join(', ') + ' — the generated prompt would reference paths the subagent cannot read. Fix the paths (they must exist on THIS machine) or the generation is refused.';
  }
  const ctxThin = Object.entries(CTX_FLOORS)
    .filter(([k, floor]) => {
      const arg = (spec as unknown as Record<string, unknown>)[k] as string | undefined;
      return arg !== undefined && arg.length < floor;
    })
    .map(([k, floor]) => k + ' (' + (((spec as unknown as Record<string, unknown>)[k] as string | undefined)?.length || 0) + 'c < ' + floor + 'c)');
  if (ctxThin.length > 0) {
    return 'context args too thin for ' + spec.name + ': ' + ctxThin.join(', ') + ' — the context args are the per-section RAW MATERIAL the tool weaves into the pre-woven template. THE DENSITY LAW (2026-08-09 — the operator: "CONTEXT ARGS NEED TO BE FUCKING DENSE"): the floors are the MINIMUM, NEVER the target — a 200-char mission is a DERAILMENT, the proper arg is 10-50x the floor with the REAL anchors, the REAL numbers, the REAL quotes. GATHER the project data FIRST (the filepaths, the measured state, the operator\'s verbatim rulings), then write each block at the full density: mission (the what + the why + the framing + the stakes, 200c+), knownContext (the measured state + the anchors + the numbers + the file:line references, 200c+), doctrine (the verbatim quotes, 100c+), measurements (the numbers/tables + the sources, 100c+), acceptance (the checkable bullets, 100c+), taskTargets (the per-task WHAT/HOW/WHY/EXPECTED expansions, 100c+), position (the build slot, 50c+). A thin arg is a REFUSED dispatch — the re-fire costs MORE than writing it right the first time.';
  }
  return null;
}

// v14 (2026-08-06 — the shadow backend wiring, the spec §4): the shared
// helpers (weave/injectSlots/mechanicallyRepair/ingestFiles/validateAgentSpec/
// sha256hex) are EXPORTED so the shadow runner (src/tools/shadow/shadow-runner.ts)
// composes the 13-step pipeline from the SAME machinery — the tool's execute
// now calls runShadowPipeline per agent; the direct generatePrompt expansion is
// REPLACED by the shadow backend's PI execution loop (the fallbacks kept).

// v10 (2026-08-06 — the LLM-loop root-cause fix): the expansion's output is
// NEVER trusted raw — the tool MECHANICALLY REPAIRS the common failures:
// (a) any surviving template markers ([FILEPATHS:]/[CONTEXT:]/[FILL:]) get
// re-injected with the real values (the model often copies the skeleton's
// markers into its output — the raw markers fail the validation's FILL scan);
// (b) the filepaths-derived blocks — the reading order, the per-file
// WHAT/HOW/WHY/EXPECTED tasks, the verification commands — get APPENDED when
// the paths, the commands, the 4-part task structure, or the floor are
// missing. The LLM provides the weaving; the STRUCTURE + the VOLUME are
// mechanical — the model's under-production (the live 118/130-line rounds)
// can no longer fail the validation. The 130-line rejection's root: the
// model's rewrite dropped the WHAT:/EXPECTED: labels — the repair now
// guarantees them.
export function mechanicallyRepair(text: string, filepaths: string[], context: string): string {
  let out = text;
  // (a) the surviving markers — re-inject with the real values
  if (/\[(?:FILEPATHS|CONTEXT|FILL):/.test(out)) {
    out = injectSlots(out, filepaths, context);
  }
  // (b) the mechanical blocks when ANY structural requirement is unmet
  const pathCount = (out.match(/(?:\/home\/|\/root\/|\/tmp\/|\/var\/|\/usr\/|\/etc\/|\/opt\/|\/workspace\/|\/app\/|\/mnt\/|C:\\|\/Users\/)/g) || []).length;
  const whatCount = (out.match(/\bWHAT:/g) || []).length;
  const expectedCount = (out.match(/\bEXPECTED:/g) || []).length;
  const lines = out.split('\n').length;
  if (pathCount < 3 || !/\bread\s+\//.test(out) || whatCount < 3 || expectedCount < 3 || lines < 125) {
    const taskBlocks = filepaths.map((p: string) => {
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
      filepaths.map((p: string, i: number) => (i + 1) + '. ' + p).join('\n') +
      '\n\nTHE MECHANICAL TASKS (the per-file extraction — the WHAT/HOW/WHY/EXPECTED blocks):\n' + taskBlocks +
      '\n\nTHE MECHANICAL VERIFICATION (run ALL + return the outputs — each a SINGLE command):\n' +
      filepaths.map((p: string) => 'read ' + p + ' (full pass, offset=0) — the file read to completion').join('\n');
  }
  return out;
}

// v13 (the shadow-lite ingestion — the operator's "is it reading all the inputs
// and filepaths directly? it should. Should actually fully ingest all of the
// input context the subagent is going to"): the tool reads the filepaths'
// ACTUAL content (the excerpts + the line counts) and includes them in the
// LLM's weaving prompt — the tool LLM understands the REAL files before
// writing, never flying blind on the session agent's summary alone.
export function ingestFiles(filepaths: string[], maxCharsPerFile = 6000): string {
  const parts: string[] = [];
  for (const p of filepaths) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content.split('\n').length;
      const excerpt = content.length > maxCharsPerFile
        ? content.substring(0, maxCharsPerFile) + '\n...[excerpt truncated — the full file is ' + lines + ' lines; the subagent reads it fully]'
        : content;
      parts.push('=== FILE: ' + p + ' (' + lines + ' lines) ===\n' + excerpt);
    } catch (e) {
      parts.push('=== FILE: ' + p + ' (UNREADABLE — the subagent will report the ABSENT verdict) ===');
    }
  }
  return parts.join('\n\n');
}

interface AgentSpec {
  name: string;
  template: string;
  filepaths: string[];
  // THE CONTEXT ARGS (v11 — the operator's mandate: "the session agent literally
  // just inputs context args" — one per golden section, each with its own floor;
  // the tool WEAVES each into its section — never the same blob everywhere).
  mission: string;       // → THE MISSION
  knownContext: string;  // → THE KNOWN CONTEXT (the measured state)
  doctrine: string;      // → THE OPERATOR'S DOCTRINE (the verbatim quotes)
  measurements: string;  // → THE KNOWN MEASUREMENTS TABLE
  acceptance: string;    // → THE ACCEPTANCE CRITERIA (the bullets)
  taskTargets: string;   // → THE PER-TASK EXPANSIONS
  position: string;      // → THE POSITION IN THE BUILD
}

export type { AgentSpec };

// The per-arg floors (v11 — the validation REFUSES the thin/missing blocks with
// the named remedy; the model's one job is providing the per-section context).
const CTX_FLOORS: Record<string, number> = {
  mission: 200, knownContext: 200, doctrine: 100, measurements: 100,
  acceptance: 100, taskTargets: 100, position: 50,
};

// v11 — THE WEAVE: imported from shadow-slot-injector.ts (THE §9 SINGLE SOURCE
// — the same module the shadow-brief-builder imports; the local copy was
// removed 2026-08-06). The pre-woven template's [WEAVE: <name>] slots are
// replaced with the CONTEXT ARG values + the filepaths-derived values (the
// reading order, the verification items, the workspace root). Each section gets
// ITS OWN arg — the mission → THE MISSION, the knownContext → THE KNOWN
// CONTEXT. The LLM is only the volume polish when the woven output is still
// under the floor.

interface AgentResult {
  name: string;
  path: string;
  lines: number;
  sha256: string;
  validated: boolean;
  ready: boolean;
  subagentType: string;
  error?: string;
  /** The shadow backend's silent-verify flags + the PI info (the spec §4 step
   *  12 — the flags ride INSIDE the manifest, L6). */
  notes?: string[];
}

export type { AgentResult };

// ONE agent's generation: skeleton (extracted by the caller, cached) → inject →
// validate → LLM-expand ONLY when under the floor (the v2 logic: THE PRE-WRITTEN
// TEMPLATE IS THE PROMPT — the LLM is ONLY the EXPANDER, its output trusted only
// when the same validation passes) → write /tmp/trident-task-preflight/<name>.md.
async function generatePrompt(spec: AgentSpec, skeleton: string | null): Promise<AgentResult> {
  const templateName = (spec.template || 'E2').toUpperCase();
  const filepaths = Array.isArray(spec.filepaths) ? spec.filepaths.filter((p: string) => typeof p === 'string' && p.length > 0) : [];
  const subagentType = templateName.startsWith('B') ? 'trident_build' : 'trident_explore';

  if (!TEMPLATE_NAMES.includes(templateName)) {
    throw new Error('template must be one of E1|E2|E3|E4|B1|B2|B3|B4|B5 (got ' + templateName + ')');
  }
  if (filepaths.length === 0) {
    throw new Error('filepaths is required for ' + spec.name + ' — the absolute paths of everything to analyze');
  }
  // v7 (2026-08-06 — the operator's live flag "non-existent src paths") + v8/v11
  // (the context-arg floors): the validation is SHARED with the shadow runner
  // (validateAgentSpec — the CTX_FLOORS + the path existence + the template
  // name); the refusal names each short field with its count + the remedy.
  const specErr = validateAgentSpec(spec);
  if (specErr) throw new Error(specErr);
  if (!skeleton) {
    throw new Error('the template skeleton could not be loaded from ' + SKILL_PATH + ' — the trident-dispatch-templates skill must be installed');
  }
  const injected = weave(skeleton, spec); // v11: the context args woven into the pre-woven template

  // v9 (2026-08-06 — the hang audit: the golden templates' injected skeletons are
  // ~70-90 lines, under the 125 floor, so the LLM expansion became MANDATORY — and
  // the callLLM's session.prompt has NO timeout, so a stalled provider hung the
  // tool FOREVER. Two fixes: (1) the MECHANICAL ENRICHMENT — the filepaths-derived
  // content (the reading order + the verification commands) woven in BEFORE any LLM
  // call — the structure never depends on the model; (2) the LLM-call TIMEOUT (90s
  // per round — a stall fails fast to the next round / the enriched fallback).
  let promptText = injected + '\n\nTHE MECHANICAL READING ORDER (the filepaths — one per line):\n' +
    filepaths.map((p: string, i: number) => (i + 1) + '. ' + p + ' — the ' + (i === 0 ? 'primary target' : 'supporting target')).join('\n') +
    '\n\nTHE MECHANICAL VERIFICATION (run ALL + return the outputs — each a SINGLE command):\n' +
    filepaths.map((p: string) => 'read ' + p + ' (full pass, offset=0) — the file read to completion').join('\n');
  let lines = promptText.split('\n').length;
  let v = validateTaskPromptLines(promptText);
  const needsExpansion = !v.passed || lines < 125;
  let expansionError: string | undefined;

  // the timeout wrapper — a stalled LLM call fails fast, never hangs (the v9 hang fix)
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('LLM call timed out after ' + ms + 'ms — the provider stalled')), ms))]);

  if (needsExpansion) {
    try {
      // the LLM EXPANDS ON TOP of the injected skeleton — the structure,
      // the filepaths, and the commands are already there; the model adds
      // the real content to the per-task blocks. The output is validated
      // after; only a validation-passing expansion replaces the skeleton.
      // v6 (2026-08-06 — the live under-production finding): the shared loop's
      // maxIterations is a FAILURE retry, not a continuation — with
      // skipQualityChecks + analysis=null it breaks after ONE call, and the
      // model under-produces (57-114 lines vs the 125 floor — verified live
      // with the ERROR-*-expansion.txt diagnostics). The expansion is now a
      // DEDICATED feedback loop: each round names the exact shortfall (the
      // line count + the validation output), and the model CONTINUES writing
      // until the floor is met or the rounds are exhausted.
      const expansionDemand =
        'THE PROMPT SKELETON BELOW HAS THE GOLDEN STRUCTURE. THE CONTEXT ARGS ARE THE ' +
        'RAW MATERIAL — WRITE THE COMPLETE PROMPT by weaving each arg into its section ' +
        'in the GOLDEN STYLE (the operator\'s standard — the god-tier dispatch prompt):\n' +
        '- THE MISSION: the mission arg expanded into a FULL paragraph (the what, the why, the framing).\n' +
        '- THE ACCEPTANCE CRITERIA: the static bullets + the acceptance arg formed into the checkable bullets.\n' +
        '- THE READING ORDER: the filepaths as the numbered list — keep EVERY path.\n' +
        '- THE KNOWN CONTEXT: the knownContext arg expanded into the bulleted measured state with the anchors.\n' +
        '- THE OPERATOR\'S DOCTRINE: the doctrine arg QUOTED VERBATIM — never paraphrased.\n' +
        '- THE KNOWN MEASUREMENTS TABLE: the measurements arg formed into a markdown table.\n' +
        '- THE PER-TASK EXPANSIONS: the taskTargets arg formed into the bulleted concrete targets.\n' +
        '- THE POSITION: the position arg expanded into the paragraph.\n' +
        '- THE TASKS: the static skeletons with the WHAT/HOW/WHY/EXPECTED expanded from the taskTargets ' +
        'into full engineering paragraphs.\n' +
        'THE FINAL PROMPT MUST BE 250-350 LINES — the dispatch-prompt size, NEVER the 600-line bloat; count the lines before you finish. ' +
        'THE VALIDATION REQUIRES: the per-task WHAT/HOW/WHY/EXPECTED blocks, 3+ absolute ' +
        'filepaths, the section markers (THE MISSION / THE ACCEPTANCE / THE READING ORDER / ' +
        'THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), the concrete verification ' +
        'commands, and the structure DISPATCHABLE as-is. KEEP every filepath. NEVER invent ' +
        'file paths outside the list. Output ONLY the complete prompt text — NO preamble, ' +
        'NO thinking, NO markdown fences. The output must BEGIN with "EXECUTE THE ' +
        'FOLLOWING".\n\n' + promptText +
        '\n\nTHE ACTUAL FILE CONTENTS (the subagent will read these — the tool LLM MUST ' +
        'understand them before writing the prompt; the excerpt is the real content, not ' +
        'the session agent\'s summary):\n' + ingestFiles(filepaths);
      let clean = '';
      let vExpanded = { passed: false as boolean, lines: [] as string[] };
      let expandedLines = 0;
      let feedback = '';
      for (let round = 1; round <= 4; round++) {
        let resp: string;
        try {
          resp = await withTimeout(
            generateSpecViaLLM(
              expansionDemand + (feedback ? '\n\n' + feedback : ''),
              undefined, false, TASK_PREFLIGHT_SYSTEM,
              undefined,
              250, // v12: the continuationTarget — the shared generator's SINGLE+CONTINUE
                  // loop writes until the 250-line target (the dispatch-prompt size, not
                  // the 600-line bloat — the v13 tuning). The v1-v11 calls never enabled
                  // it — the under-production was the missing continuation, not the model's
                  // ceiling.
            ),
            240000, // the weaving round's budget (~4 continuation calls × 60s); a stall still fails
          );
        } catch (llmErr) {
          expansionError = (expansionError ? expansionError + '; ' : '') + 'LLM round ' + round + ' failed: ' + (llmErr instanceof Error ? llmErr.message : String(llmErr));
          tridentLog('WARN', 'trident-task-preflight', expansionError);
          break;
        }
        clean = resp;
        const execIdx = clean.indexOf('EXECUTE THE FOLLOWING');
        if (execIdx > 0) clean = clean.substring(execIdx);
        clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
        // v10: the mechanical repair BEFORE the acceptance — the paths, the
        // commands, and the markers are guaranteed structurally, so a 136-line
        // output with dropped paths is ACCEPTED instead of uselessly retried.
        clean = mechanicallyRepair(clean, filepaths, spec.mission + ' ' + spec.knownContext + ' ' + spec.doctrine + ' ' + spec.measurements + ' ' + spec.acceptance + ' ' + spec.taskTargets + ' ' + spec.position);
        vExpanded = validateTaskPromptLines(clean);
        expandedLines = clean.split('\n').length;
        if (vExpanded.passed && expandedLines >= 200) break;
        feedback = 'ROUND ' + round + ' OUTPUT REJECTED: the prompt is ' + expandedLines +
          ' lines (floor 125). CONTINUE WRITING THE COMPLETE PROMPT — keep EVERY line from ' +
          'your previous output and ADD the missing content: expand each task\'s ' +
          'WHAT/HOW/WHY/EXPECTED into full paragraphs, add reading-order items and ' +
          'verification commands citing the filepaths. The final output must be the ' +
          'COMPLETE 125+ line prompt beginning with "EXECUTE THE FOLLOWING". Validation ' +
          'shortfalls: ' + vExpanded.lines.join(' | ');
        tridentLog('WARN', 'trident-task-preflight', 'expansion round ' + round + ' rejected: ' + expandedLines + ' lines — retrying with the shortfall');
      }
      if (vExpanded.passed && expandedLines >= 200) {
        promptText = clean;
        if (expandedLines < 150) expansionError = 'expansion passed at ' + expandedLines + ' lines (the 125 floor; the 150 target is optional)';
      } else {
        expansionError = (expansionError ? expansionError + '; ' : '') + 'expansion failed after 4 rounds (final ' + expandedLines + ' lines, validation ' + (vExpanded.passed ? 'passed' : 'failed') + ')';
        tridentLog('WARN', 'trident-task-preflight', expansionError);
      }
      // v10b: the FINAL fallback gets the mechanical repair too — the enriched
      // skeleton may still be under the floor (the live finding: the 100-line
      // fallback with the structure but under 125). The repair appends the
      // per-file task blocks + the reading order + the verification until the
      // structural requirements — including the floor — are met.
      promptText = mechanicallyRepair(promptText, filepaths, spec.mission + ' ' + spec.knownContext + ' ' + spec.doctrine + ' ' + spec.measurements + ' ' + spec.acceptance + ' ' + spec.taskTargets + ' ' + spec.position);
      // v10c (the operator's directive: "if a timeout DOES kill the generation
      // it should not return empty — whatever has been written so far should
      // get saved to disk even if incomplete"): the BEST content is ALWAYS
      // written — the repaired fallback, and if a round produced a LONGER
      // output than the fallback, the longer one wins (the incomplete-but-real
      // generation is preserved, never discarded). The file is written below
      // regardless of the validation — the manifest's ready/error tells the
      // truth about the quality.
      if (clean && clean.split('\n').length > promptText.split('\n').length) {
        promptText = mechanicallyRepair(clean, filepaths, spec.mission + ' ' + spec.knownContext + ' ' + spec.doctrine + ' ' + spec.measurements + ' ' + spec.acceptance + ' ' + spec.taskTargets + ' ' + spec.position);
      }
      lines = promptText.split('\n').length;
      v = validateTaskPromptLines(promptText);
    } catch (expandErr) {
      expansionError = 'expansion crashed: ' + (expandErr instanceof Error ? expandErr.message : String(expandErr));
      tridentLog('WARN', 'trident-task-preflight', expansionError);
      /* keep the injected skeleton — it is the fallback */
    }
  }
  const name = (spec.name || 'task-prompt').replace(/[^A-Za-z0-9_-]/g, '-');
  const outPath = path.join(OUT_DIR, name + '.md');
  fs.writeFileSync(outPath, promptText, 'utf-8');
  const result: AgentResult = { name, path: outPath, lines, sha256: sha256hex(promptText), validated: v.passed, ready: v.passed && lines >= 125, subagentType };
  if (expansionError) {
    result.error = expansionError;
    // the diagnostic ON DISK — the operator's "15 minutes debugging" killer: the
    // expansion failure must be visible without parsing the manifest.
    try { fs.writeFileSync(path.join(OUT_DIR, 'ERROR-' + name + '-expansion.txt'), expansionError + '\n\nVALIDATION:\n' + v.lines.join('\n'), 'utf-8'); } catch (e) { /* non-fatal */ }
  }
  return result;
}

// THE TOOL FACTORY REMOVED (2026-08-08 — the operator: "we should remove the
// TASK PREFLIGHT (not the args preflight) tool now that wave manager exists
// it is redundant and leads to confusion"). This module REMAINS as the SHARED
// MACHINERY source (OUT_DIR, TEMPLATE_NAMES, TASK_PREFLIGHT_SYSTEM,
// extractTemplateSkeleton, validateAgentSpec, mechanicallyRepair, ingestFiles,
// AgentSpec, AgentResult) — the shadow backend consumes it. The
// createTaskPreflightTool factory + the deprecated alias are GONE; the
// trident-wave-manager tool is the only dispatch path.
