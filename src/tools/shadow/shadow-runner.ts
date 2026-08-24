// ============================================================================
// file: src/tools/shadow/shadow-runner.ts
//
// THE ONE-PLACE COMPOSITION (the macro spec's rule: "Never scatter the stages
// across the codebase. One runner holds the composition — that IS the
// architecture"). runShadowPipeline() executes the SHADOW-ENHANCED
// TASK-PREFLIGHT spec's 13-step pipeline (§4) for ONE agent:
//
//   1.  the tether: sessionKey/projectId/parentSessionId/pid (globalThis → env → defaults)
//   2.  the sidecar lifecycle: register → touch → handleSessionSwitch
//   3.  shadow-memory.open({project}, {sessionKey})
//   4.  the REATTACH GATE (3 checks; FAIL = the ERROR string, never a log line)
//   5.  validate(spec) — the CTX_FLOORS + the path existence (the shared validators)
//   6.  buildContext(memory, spec, sessionStream) → { chain, inference } (Stage 4)
//   7.  buildBrief(spec, skeleton, inference) — the 84-slot weave + THE SUPREMACY
//       CONTRACT + the [SHADOW INFERENCE] section (Stage 3)
//   8.  THE PI EXECUTION LOOP (Stage 5): prompt → stream (flash max, the secret,
//       the 240s timeout) → the scoped tool-calls (read_file/grep/stat on the
//       filepaths — the read-before-write, MECHANICALLY) → the results fed back
//       into the loop → continue until the 200+ acceptance / the 250-350-line
//       target / the rounds cap (4) — the best content ALWAYS written (the
//       v10c partial-save). The dead-LLM safety: the v13 expansion path +
//       the mechanical repair are the FALLBACK when the loop fails.
//   9.  silentVerify — the markers/structure/verbatim-doctrine/freshness/
//       [SHADOW INFERENCE]-presence; the repair on the unmet floors (Stage 6)
//   10. appendPrompt — the sqlite row + the JSON mirror (Stage 7a)
//   11. void syncPrompt — SKIP unless a remote exists (Stage 7b, §3.8)
//   12. the manifest — the STRING return (the g.split bypass), the per-agent
//       { name, path, lines, sha256, validated, ready, subagentType, error?,
//       notes? } + the [SHADOW INFERENCE] presence
//   13. the tool.after COPY-PASTE hook delivers the per-agent files (the caller)
//
// THE MODEL DISCIPLINE (2026-08-19 — the operator: "WHAT FUCKING MOCK BRAIN"):
// the headless pi Agent (read + edit ONLY) uses the REAL 5-provider transport
// (the pi Models.streamSimple). NO brain adapter, NO mock. The tests inject a
// scripted stream via the streamFn option.
//
// THE FIREWALL: the backend writes ONLY OUT_DIR + the memory root — the PI
// loop's tools are READ-ONLY (read_file/grep/stat).
//
// THE L4 SUPREMACY: THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE
// BELIEF — VERIFY AGAINST THE FILES. A context arg that contradicts the file
// contents MUST be flagged, never conformed to. (The frozen contract text.)
// ============================================================================

import { tridentLog } from '../../utils.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { SHADOW_MODEL } from './shadow-config.ts';
import type { ShadowStreamFn } from './shadow-config.ts';
// F2 (2026-08-14 — the backoff retry): the measured window for the 2× retry.
import { ShadowMemory, type PromptRecord } from './shadow-memory.ts';
import {
  tetherSession,
  registerSidecar,
  touchSidecar,
  handleSessionSwitch,
  verifyMemoryReattach,
  type TetheredSession,
} from './shadow-sidecar.ts';
import {
  buildContext,
  SHADOW_INFERENCE_SECTION_TITLE,
  type SessionStreamMessage,
  type FileExcerpt,
  type ShadowMemoryLike,
  type ShadowInference,
} from './shadow-context-manager.ts';
import {
  ingestFiles,
  OUT_DIR,
  TASK_PREFLIGHT_SYSTEM,
  extractTemplateSkeleton,
  validateAgentSpec,
  type AgentSpec,
} from '../trident-task-preflight.ts';
// THE ONE WEAVE (the §9 cross-consistency rule — the values map lives in ONE
// place: the brief-builder's exported weave; the runner imports it instead of
// holding a duplicate). The brief-builder's BriefSpec is structurally
// compatible with the AgentSpec the runner passes (the same 7 context args +
// the filepaths) — no cast required.
import { weave } from './shadow-brief-builder.ts';
import { validateTaskPromptLines } from '../trident-preflight.ts';
import { ShadowAgent } from './shadow-agent.ts';
import { RpmLedger } from './rpm-ledger.ts';

// ── THE FROZEN CONSTANTS ──

/** THE L4 SUPREMACY CONTRACT — the FROZEN text (the spec §3.2: "The supremacy
 *  contract's text is FROZEN (the L4 law) — a paraphrase in the code is a
 *  violation"). PREPENDED to every generated prompt. */
export const SUPREMACY_CONTRACT =
  'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST ' +
  'THE FILES. A context arg that contradicts the file contents MUST be flagged, never ' +
  'conformed to. Every claim about the files must be READ from them, never assumed.';

/** THE RUNNER ROUND CAP (2026-08-23 — THE SANITY RESTORE): this was 4 — an
 *  old-era fossil whose comment even said "2-3 typical, 4 absolute" — and it
 *  silently bypassed ShadowAgent's settled MAX_ROUNDS=2 via the runner's
 *  `options.maxRounds ?? PI_MAX_ROUNDS` default. The SETTLED doctrine is
 *  MAX_ROUNDS=2 / MIN_MANDATORY_ROUNDS=2 UNIVERSALLY: validated-break fires at
 *  R2, zero agents ever reach R3 (measured across every live wave). Both
 *  layers now agree on 2 — there is ONE round truth in this codebase. */
export const PI_MAX_ROUNDS = 2;

/** THE PER-ROUND TOKEN CAP (2026-08-17 — the operator: "WHY THE FUCK IS IT
 *  FORCING THIS WHAT THE HELL THIS IS A CEILING DONT FUCKING BURN TOKENS").
 *  PI_MAX_TOKENS (384K) is the ABSOLUTE ceiling — it was being sent as the
 *  max_tokens on EVERY round, making the provider allocate/plan for a
 *  potential 384K generation per round. A 250-350-line prompt is ~4-5K
 *  output tokens; 16K = 8x the target with generous headroom for the prompt
 *  + the [SHADOW INFERENCE] brief. THE ROUND CALLS PASS THIS — the absolute
 *  ceiling stays for the rare case that genuinely needs it. */
export const PI_ROUND_MAX_TOKENS = 16_000;

/** The acceptance bar (the spec §7.7: "the 200+ line bar for the LLM-woven
 *  outputs; the 250-350-line target" — the 200+ is the mechanical gate, the
 *  250-350 is what the model is instructed to aim for). */
export const PI_ACCEPT_LINES = 200;

/** read_file's cap (the scoped tool — the read-before-write, capped). */
export const READ_FILE_CAP = 8000;

/** The inference excerpts' cap (the v13's ingestFiles 6000-char class). */
export const EXCERPT_CAP = 6000;

// ── THE TYPES ──

/** A file state captured by the PI loop's read_file/stat — the freshness
 *  check's ground truth (never a stale summary). */
export interface FileState {
  path: string;
  lines: number;
  chars: number;
}

export interface ScopedToolResult {
  content: string;
  details?: unknown;
  terminate?: boolean;
}

/** The AgentTool shape (the spec §2: "{ label, execute(toolCallId, params,
 *  signal?) → { content, details, terminate? } }"). */
export interface ScopedTool {
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ScopedToolResult> | ScopedToolResult;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface VerifyResult {
  flags: string[];
  verified: boolean;
  repaired: string;
}

export interface ShadowRunnerOptions {
  /** The injected secret (the runner's configured store). NEVER hardcoded,
   *  NEVER logged (AP-4). */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** The injected stream (tests script the pi transport; the production
   *  default is the real 5-provider streamSimple). */
  streamFn?: ShadowStreamFn;
  /** The tether override (tests pin the session; production uses the hook's
   *  globalThis → env → defaults chain via tetherSession()). */
  tether?: TetheredSession;
  /** The template skeleton (the caller's cache — falls back to extracting). */
  skeleton?: string | null;
  /** OUT_DIR override (tests sandbox the writes; production = /tmp/trident-task-preflight). */
  outDir?: string;
  /** The PI rounds cap override (default PI_MAX_ROUNDS). */
  maxRounds?: number;
  /** THE SHARED WAVE LEDGER (2026-08-21 — the operator's hybrid: one
   *  RpmLedger per wave, injected into every ShadowAgent so a sibling's
   *  observed 429 exiles the rung for ALL agents — no blind re-burns).
   *  Absent → each ShadowAgent builds its own private ledger (solo scope). */
  ledger?: RpmLedger;
  /** The caller's abort signal. */
  signal?: AbortSignal;
}

interface Candidate {
  text: string;
  lines: number;
  validated: boolean;
}

// ── THE SMALL HELPERS ──

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function sanitizeName(name: string): string {
  return (name || 'task-prompt').replace(/[^A-Za-z0-9_-]/g, '-');
}

function subagentTypeOf(spec: AgentSpec): string {
  return (spec.template || 'E2').toUpperCase().startsWith('B') ? 'trident_build' : 'trident_explore';
}

function ctxBlob(spec: AgentSpec): string {
  return spec.mission + ' ' + spec.knownContext + ' ' + spec.doctrine + ' ' +
    spec.measurements + ' ' + spec.acceptance + ' ' + spec.taskTargets + ' ' + spec.position;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('LLM call timed out after ' + ms + 'ms — the provider stalled')), ms)),
  ]);
}

function normalizeStream(stream: SessionStreamMessage[] | string[]): SessionStreamMessage[] {
  if (!Array.isArray(stream) || stream.length === 0) return [];
  if (typeof stream[0] === 'string') {
    return (stream as string[]).map((s) => ({ role: 'user', content: s }));
  }
  return stream as SessionStreamMessage[];
}

/** The ShadowMemoryLike adapter — shadow-memory's epochSummary() returns the
 *  EpochSummary OBJECT while the context manager's contract wants a STRING
 *  summary. The adapter renders the object without touching the Wave-1 files. */
function memoryAdapter(memory: ShadowMemory): ShadowMemoryLike {
  return {
    lastPrompts(n: number): PromptRecord[] {
      return memory.lastPrompts(n);
    },
    epochSummary(): string {
      const e = memory.epochSummary();
      return 'count ' + e.count + ', avgLines ' + Math.round(e.avgLines) +
        ', readyRate ' + Math.round(e.readyRate * 100) + '%';
    },
  };
}

/** The mechanical pre-read (the v13's ingestFiles class): the excerpts the
 *  inference is built from — the L4 verification ground truth. */
function preReadExcerpts(filepaths: string[]): FileExcerpt[] {
  const out: FileExcerpt[] = [];
  for (const p of filepaths) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content.split('\n').length;
      const excerpt = content.length > EXCERPT_CAP
        ? content.substring(0, EXCERPT_CAP) + '\n...[excerpt truncated — the full file is ' + lines + ' lines; the subagent reads it fully]'
        : content;
      out.push({ path: p, content: excerpt, lines });
    } catch (e) {
      out.push({ path: p, content: '', lines: 0 });
    }
  }
  return out;
}

/** THE REAL TEMPLATE OPENERS (all 9 templates — E1-E4, B1-B5 — the forms
 *  "EXECUTE THE FOLLOWING <TYPE> VERBATIM"). The thinking's quotes of the
 *  output contract ("EXECUTE THE FOLLOWING", include section markers") never
 *  match the full pattern — only an actual draft's opening line does. */
export const TEMPLATE_OPENER_RE =
  /EXECUTE THE FOLLOWING (?:FORENSIC CONTEXT EXTRACTION|CONTEXT SYNTHESIS|RESEARCH TASK|FAILURE INVESTIGATION|BUILD PLAN|DEBUGGING PLAN|SURGICAL EDIT PLAN|TEST IMPLEMENTATION|PIPELINE BUILD) VERBATIM/;

export function extractFinalPrompt(raw: string): string {
  let clean = raw || '';
  const re = new RegExp(TEMPLATE_OPENER_RE.source, 'g');
  let lastIdx = -1;
  for (const m of clean.matchAll(re)) lastIdx = (m.index as number) ?? -1;
  if (lastIdx < 0) {
    // no full opener — fall back to the bare first occurrence (the legacy
    // behavior; the THINKING-LEAK detector still flags the residual risk)
    const bare = clean.indexOf('EXECUTE THE FOLLOWING');
    if (bare > 0) lastIdx = bare;
  }
  if (lastIdx > 0) clean = clean.substring(lastIdx);
  // strip a LEADING code fence (the model wrapped its draft)
  clean = clean.replace(/^```[a-zA-Z]*\s*\n?/, '');
  // strip a fence closing the draft BEFORE the [SHADOW INFERENCE] section
  clean = clean.replace(/\n?\s*```[a-zA-Z]*\s*(?=\n\s*## \[SHADOW INFERENCE\])/, '');
  // strip a TRAILING code fence
  clean = clean.replace(/\n?\s*```[a-zA-Z]*\s*$/, '');
  // ═══ THE DRAFT-SCAFFOLDING STRIP (2026-08-07 — the Agent-3 finding: the
  // model drafts with LINE-NUMBER prefixes + (blank) placeholders — "2 You
  // do NOT write...", "3 (blank)" — and the extraction kept them, so the
  // dispatched subagent received the numbering scaffolding as content (46
  // numbered lines + 20 blanks in the live ct-wave-1 prompt). The strip:
  // (a) drop lines that are exactly "(blank)" or "N (blank)"; (b) strip a
  // bare "N " prefix BEFORE a capital letter or "(" — the legit numbered
  // content ("1. /path", "Task 1 —") never matches (a period or a word
  // follows the number). ═══
  const scaffolded = clean.split('\n').map((line) => {
    const trimmed = line.trim();
    if (/^\(\s*blank\s*\)$/i.test(trimmed)) return '';
    const numberedBlank = trimmed.match(/^\d+\s+\(\s*blank\s*\)$/i);
    if (numberedBlank) return '';
    const prefix = trimmed.match(/^(\d+)\s+(?=[A-Z(])/);
    if (prefix) return line.substring(line.indexOf(prefix[0]) + prefix[0].length);
    return line;
  });
  clean = scaffolded.join('\n');
  // ═══ THE DRAFTING-SCRATCHPAD STRIP (2026-08-10 — the AGENT PARTIAL fix, the
  // failure log's defect #1): the shadow's composition drafts WITH its internal
  // reasoning — the line-counting ("Let me now count", "I'm under by", "Too
  // short"), the tool-call planning ("Let me run", "Let me write", "The tool
  // calls"), the placeholder fragments ("... (N paths)", ".../src/"). The
  // validator rejects the structure these break, and the old loop kept them.
  // Strip the paragraphs that match the drafting lexicon — the prompt body
  // never contains "Let me now count" or "I'm under by". ═══
  const draftingRe = /(Let me now count|I['\u2019]?m under by|Too short|Let me write everything|Let me run the tool|Let me emit the tool calls|\.\.\. \(\d+ paths\)|\.\.\.\/src\/|\/home\/\.\.\.\/)/i;
  const lines2 = clean.split('\n');
  const stripped: string[] = [];
  for (const line of lines2) {
    if (draftingRe.test(line)) {
      // drop this line AND the following blank/continuation lines until a real section line
      continue;
    }
    stripped.push(line);
  }
  clean = stripped.join('\n');
  return clean.trim();
}

/** THE DRAFTING-MARKER LEXICON (the detection layer — the ISE law: the regex
 *  is a mechanical DETECTOR only; the DECISION is the verifier's flag + the
 *  repair). The markers are the model's chain-of-thought artifacts — a clean
 *  dispatch prompt NEVER contains them. */
export const DRAFTING_MARKERS: string[] = [
  'The skeleton provided in the brief',
  'Let me plan the tool calls',
  'Let me count the skeleton lines',
  'Let me write the full prompt',
  'Let me write the actual full prompt',
  'Let me examine the skeleton',
  'Let me be careful',
  'Let me start writing',
  'Let me now think',
  'Let me now craft',
  'Let me check whether',
  'Let me reconsider',
  'Let me think about',
  'Should I call the tools',
  'I need to expand',
  'I need to weave',
  'I need to be careful',
  'I can see from the file excerpts',
  'I think I can write',
  "That's roughly",
  "I'll aim for",
  'Draft:',
  'The skeleton is essentially',
  'Let me just write it',
  'Let me write it',
  'Let me carefully craft',
  'Now, about verifying',
];

/** THE THINKING-LEAK DETECTOR — returns the FIRST drafting marker found (or
 *  null when the prompt is clean). ALSO checks the first line: a clean
 *  dispatch prompt BEGINS with "EXECUTE THE FOLLOWING" — anything else means
 *  the extraction failed (the thinking rode along). THE SUPREMACY-PREFIX
 *  TOLERANCE (2026-08-07 — the Agent-3 finding): silentVerify PREPENDS the
 *  frozen L4 contract after this detector ran, so the STORED artifact's first
 *  line is the supremacy — re-running the detector on the repaired output
 *  must skip a supremacy-prefixed first line, never flag its own repair. */
export function detectThinkingLeak(promptText: string): string | null {
  if (!promptText || promptText.trim().length === 0) return null;
  for (const marker of DRAFTING_MARKERS) {
    if (promptText.includes(marker)) return marker;
  }
  const lines = promptText.split('\n');
  let firstContentLine = lines[0].trim();
  let lineIdx = 0;
  // skip a supremacy-prefixed first line (the mechanically-prepended L4
  // contract — the detector must not flag its own repair) AND any blank
  // separator lines after it
  while (
    lineIdx < lines.length - 1 &&
    (/^THE FILES ARE THE ONLY GROUND TRUTH/i.test(firstContentLine) || firstContentLine.length === 0)
  ) {
    lineIdx++;
    firstContentLine = lines[lineIdx].trim();
  }
  if (!/^EXECUTE THE FOLLOWING/.test(firstContentLine)) {
    return 'the first line is not the template opener: "' + firstContentLine.substring(0, 80) + '" (line ' + (lineIdx + 1) + ')';
  }
  return null;
}

function evaluateCandidate(raw: string, filepaths: string[], context: string): Candidate {
  // ═══ THE NO-FABRICATION CANDIDATE (2026-08-07 — the operator's loud-fail
  // law, the SECOND enforcement point): the OLD code called mechanicallyRepair
  // HERE — which APPENDED the mechanical scaffold (the reading order + the
  // tasks + the verification) to whatever the model wrote, and the scaffold
  // CONTAINED the validation markers → the fabricated candidate VALIDATED →
  // got selected as the best → shipped as the prompt (the live host-gen-a
  // artifact: the model's round-1 text + the scaffold). THE CANDIDATE SHIPS
  // AS THE MODEL WROTE IT — nothing fabricated. A structure-failing candidate
  // is bestRaw (a loud partial), never a repaired fake. ═══
  const clean = extractFinalPrompt(raw);
  const v = validateTaskPromptLines(clean);
  return { text: clean, lines: clean.split('\n').length, validated: v.passed };
}

/** THE [SHADOW INFERENCE] DELIMITER — the operator's format (2026-08-07):
 *  the LLM-written forward-map summary is separated from the prompt by a
 *  ~~~~~~~~~~~ line break + the [SHADOW INFERENCE] prefix. */
export const SHADOW_INFERENCE_DELIMITER = '~~~~~~~~~~~';

/** THE INFERENCE-BRIEF INSTRUCTION — the operator's design (2026-08-07):
 *  the shadow agent writes a DENSE, INTELLIGENT summary of what it learned
 *  from the context args + the files BEFORE writing the prompt; that brief is
 *  APPENDED to the bottom of the final prompt as pre-engineered context for
 *  the subagent to absorb (the forward-map of the subagent's context window).
 *  NOT raw reasoning tokens — the distilled understanding. */
export const INFERENCE_BRIEF_INSTRUCTION =
  'AFTER the complete prompt, add EXACTLY one line of ' + SHADOW_INFERENCE_DELIMITER +
  ', then the [SHADOW INFERENCE] section: a DENSE, INTELLIGENT summary of what you learned about ' +
  'the files and the task while preparing this prompt — the key facts, the traps, the sharp edges, ' +
  'the focus priorities, the forward-map for the subagent (what it must watch for, what matters, ' +
  'what the context args get WRONG). This section is APPENDED to the prompt as pre-engineered context ' +
  'for the subagent to absorb. REQUIREMENTS: accurate (the files are the only ground truth), ' +
  'NON-REPETITIVE (a fact appears ONCE — do NOT restate the prompt\'s own sections), NEVER include ' +
  'your planning or drafting thoughts — the distilled understanding ONLY. THE SECTION HEADER IS ' +
  'LITERALLY JUST "[SHADOW INFERENCE]" — do NOT preface it with any "the shadow backend\'s understanding" ' +
  'framing sentence; the delimiter + the header + your content, nothing else.';

/** THE ECHOED-INTRO STRIP (2026-08-07 — the operator: the [SHADOW INFERENCE]
 *  section must be LITERALLY "[SHADOW INFERENCE]" + the content — "that is
 *  the fucking point of this"). The model ECHOED the demand's old framing
 *  intro ("The shadow backend's understanding of the files and the task —
 *  assembled from the session stream...") into its own brief (the live
 *  host-final-1 artifact). The demand no longer carries the intro (the
 *  context-manager fix) AND this strip removes any residual echo from the
 *  FINAL prompt — the enforcement layer: a fact appears ONCE, the header is
 *  just the header. The supremacy contract text (a DIFFERENT sentence) is
 *  never touched. */
const ECHOED_INFERENCE_INTRO_RE =
  /(?:^|\n)\s*The shadow backend's understanding of the files and the task\s*—?\s*assembled from the session stream[^\n]*\n?/g;

export function stripEchoedInferenceIntro(promptText: string): string {
  return promptText.replace(ECHOED_INFERENCE_INTRO_RE, '\n');
}

// ── THE SILENT VERIFIER (Stage 6 — the markers/structure/verbatim-doctrine/
//    freshness/inference-presence; the flags ride inside the manifest, L6) ──

/** The doctrine's distinctive quotes (>= 20 chars inside the quotes), falling
 *  back to the whole doctrine when no quoted strings exist (>= 40 chars). */
function extractDistinctiveQuotes(doctrine: string): string[] {
  const out: string[] = [];
  const quotedRe = /"([^"]{20,})"|'([^']{20,})'/g;
  for (const m of doctrine.matchAll(quotedRe)) {
    const q = m[1] || m[2];
    if (q) out.push(q);
  }
  if (out.length === 0) {
    const trimmed = doctrine.trim();
    if (trimmed.length >= 40) out.push(trimmed);
  }
  return out;
}

/** The freshness check: the prompt's per-file line-count claims vs the states
 *  read IN the loop — a contradiction is flagged, never smoothed (L4). Only
 *  claims are checked; an absence of a claim is not a flag. */
function freshnessFlags(promptText: string, fileStates: FileState[]): string[] {
  const out: string[] = [];
  for (const st of fileStates) {
    const base = path.basename(st.path).replace(/\.[^.]+$/, '');
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\S*\\s*\\(?\\s*(\\d+)\\s+lines', 'i');
    const m = promptText.match(re);
    if (m && parseInt(m[1], 10) !== st.lines) {
      out.push('the prompt claims ' + m[1] + ' lines for ' + st.path + ' but the file read IN the loop has ' + st.lines + ' lines — the read-before-write state must win');
    }
  }
  return out;
}

function appendDoctrine(promptText: string, doctrine: string): string {
  const d = doctrine.trim();
  if (d.length === 0) return promptText;
  return promptText + "\n\nTHE OPERATOR'S DOCTRINE (VERBATIM — the L4 supremacy demands the doctrine quoted, never paraphrased):\n" + d;
}

export function silentVerify(
  promptText: string,
  spec: AgentSpec,
  fileStates: FileState[],
  inference: ShadowInference,
): VerifyResult {
  const flags: string[] = [];
  // THE THINKING-LEAK DETECTION (2026-08-07 — the contamination fix): the
  // model's chain-of-thought must NEVER ride in the final prompt. The
  // detector (the drafting-marker lexicon + the first-line opener check) is
  // the mechanical DETECTOR; the DECISION is the flag + the re-extraction
  // repair below (the ISE law — the regex flags candidates ONLY).
  const leak = detectThinkingLeak(promptText);
  if (leak) {
    flags.push('THINKING-LEAK: the prompt carries the model\'s drafting text ("' + leak + '") — the reasoning tokens are NOT part of the final prompt');
  }
  const v = validateTaskPromptLines(promptText);
  if (!v.passed) flags.push('STRUCTURE: ' + v.lines.join(' | '));
  // THE VERBATIM-DOCTRINE (the spec §3.7): the doctrine's distinctive quotes
  // MUST appear verbatim — a paraphrase fails the check
  const quotes = extractDistinctiveQuotes(spec.doctrine);
  const missingQuotes = quotes.filter((q) => !promptText.includes(q));
  if (missingQuotes.length > 0) {
    flags.push('VERBATIM-DOCTRINE: the doctrine is paraphrased or absent — the distinctive quotes must appear verbatim: ' +
      missingQuotes.map((q) => '"' + q.substring(0, 70) + '"').join(', '));
  }
  // THE [SHADOW INFERENCE] PRESENCE (the operator's design 2026-08-07 — the
  // REAL MODEL BRIEF or NOTHING: the ~~~~~~~~~~~ delimiter + the [SHADOW
  // INFERENCE] section must be the model's own dense forward-map summary.
  // THE MECHANICAL FALLBACK IS BANNED (the operator: "NO MECHANICAL FALLBACK.
  // EITHER THE REAL MODEL BRIEF WORKS OR IT IS JUST THE PROMPT") — the
  // mechanical inference.text is the brain's DEMAND input only (buildPiDemand
  // weaves it into the brief), it is NEVER appended to the final prompt. The
  // check flags a missing model brief; the repair NEVER fabricates one.)
  const hasModelBrief = promptText.includes(SHADOW_INFERENCE_DELIMITER) &&
    /\[SHADOW INFERENCE\]/.test(promptText);
  if (!hasModelBrief) {
    flags.push('SHADOW-INFERENCE: the model-written brief is missing — the ' + SHADOW_INFERENCE_SECTION_TITLE + ' section (the ' + SHADOW_INFERENCE_DELIMITER + ' delimiter + the summary) must be the shadow agent\'s OWN dense forward-map; the mechanical fallback is BANNED (the operator: the real model brief or just the prompt)');
  }
  // THE SUPREMACY CONTRACT (the L4 framing is the behavior, D2)
  if (!promptText.includes('THE FILES ARE THE ONLY GROUND TRUTH')) {
    flags.push('SUPREMACY: the frozen L4 contract is missing — the files-are-the-only-ground-truth framing must open the prompt');
  }
  // THE FRESHNESS (the spec §3.7 — the read IN the loop, never a stale summary)
  const fresh = freshnessFlags(promptText, fileStates);
  if (fresh.length > 0) flags.push('FRESHNESS: ' + fresh.join('; '));

  let repaired = promptText;
  if (flags.length > 0) {
    // THE REPAIR (2026-08-07 — the LOUD-FAIL LAW: the repair applies ONLY the
    // L4 blocks + the leak re-extraction — NEVER a mechanical structure
    // fabrication. The old mechanicallyRepair inflated a broken draft into a
    // "validated" prompt — the FALSE SUCCESS the operator banned. A failed
    // structure ships as ready:false + the flags (a LOUD partial).)
    // THE THINKING-LEAK REPAIR FIRST (2026-08-07): re-extract at the LAST real
    // template opener — the drafting text (the model's planning, the multiple
    // drafts, the meta-commentary) is DISCARDED, the final draft wins.
    if (leak) {
      const reExtracted = extractFinalPrompt(promptText);
      if (reExtracted.length > 0) repaired = reExtracted;
    }
    if (missingQuotes.length > 0) repaired = appendDoctrine(repaired, spec.doctrine);
    if (!repaired.includes('THE FILES ARE THE ONLY GROUND TRUTH')) repaired = SUPREMACY_CONTRACT + '\n\n' + repaired;
    // THE INFERENCE-APPEND IS GONE (2026-08-07 — the operator's ruling:
    // "NO MECHANICAL FALLBACK. EITHER THE REAL MODEL BRIEF WORKS OR IT IS
    // JUST THE PROMPT"). The prompt ships with the model's own brief (the
    // ~~~~~~~~~~~ delimiter form) or WITHOUT any [SHADOW INFERENCE] section —
    // the mechanical inference.text is NEVER appended to the final prompt.
  }
  return { flags, verified: flags.length === 0, repaired };
}

// ── THE DEMAND BUILDERS (the brain's context — the brief + the chain + the
//    actual file contents) ──

function buildPiSystemPrompt(): string {
  return [
    'You are the SHADOW BRAIN of the trident-task-preflight tool — the dispatch-prompt POLISHER. You operate as a headless pi Agent with TWO tools: read + edit. Your job is the SURGICAL POLISH of the pre-woven dispatch prompt on disk.',
    '',
    'THE 2 TOOLS (the pi Agent executes them natively — you never emit text markers):',
    '- read { filepath } — file content. Batch several reads into one turn when needed.',
    '- edit { path, edits: [{ oldText, newText }, ...] } — THE BATCH EDIT: ONE call applies EVERY replacement to YOUR promptFile (path is mechanically pinned to it). Each oldText must be UNIQUE in the current file, non-overlapping; nearby changes merge into one pair. This is how an entire round of polish costs exactly ONE call.',
    'THE FILES ARE THE ONLY GROUND TRUTH.',
    '',
    '═══ THE SHADOW WARHEADS (your operating identity — follow them exactly) ═══',
    '',
    'W1 — THE BATCH LAW: BATCH EVERYTHING BY DEFAULT. Sequential only what tangibly needs it.',
    '  - ALL READS IN ONE TURN: every file you need issued TOGETHER as N read calls in ONE response. NEVER one read per turn.',
    '  - ALL EDITS IN ONE CALL: PLAN every replacement fully in your reasoning FIRST (each oldText/newText pair chosen before you emit anything), then fire ONE edit call whose edits[] array carries EVERY pair for the round. NEVER drip one-edit-per-turn.',
    '  - WHY: each of your turns is one LLM round-trip (~10-30s). A dribbled round = 20+ turns = 10+ minutes. A batched round = 2-4 turns = under a minute.',
    '',
    'W2 — THE ROUND CONTRACT: rounds are the ONLY sequential boundary (2 mandatory, up to 4, stop when clean). Everything INSIDE a round is batched:',
    '  ROUND N = BATCH EXECUTE (all reads at once) -> VERIFY -> BATCH FIX -> then the EMBEDDED MICRO-LOOP: RE-VERIFY -> RE-FIX -> loop as needed, UP TO 3 LOOPS TOTAL from the first re-verify action (the circuit breaker — never loop past it) -> round done. A clean re-verify ends the micro-loop immediately.',
    '',
    'W3 — THE NO-DRIP VIOLATION: ending a turn with known pending work is a FAILED round. If 5 sections need polish and you made 1 edit call, you violated W1. Plan everything, fire everything, then verify.',
    '',
    'W4 — THE EVIDENCE LAWS: THE FILES ARE THE ONLY GROUND TRUTH — verify against them, never conform to belief. Surgical polish, NEVER a rewrite. PRESERVE: every filepath, every WHAT/HOW/WHY/EXPECTED block, the section markers (THE MISSION / THE ACCEPTANCE CRITERIA / THE READING ORDER / THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), the concrete verification commands, the doctrine quotes VERBATIM. MANDATORY FINAL STATE: the file ENDS with "~~~~~~~~~~~" then "[SHADOW INFERENCE]" then YOUR dense forward-map (≥100 chars of real content — a bare marker FAILS validation) (what files ARE from reading them, traps, priorities) — created via YOUR edit, never a mechanical paste. NEVER emit plans/self-review ("I think", "Let me", "DONE") as work — only edits change the file; when it reads clean, stop.',
    '',
    SUPREMACY_CONTRACT,
    '',
    INFERENCE_BRIEF_INSTRUCTION,
  ].join('\n');
}

function buildPiDemand(brief: string, chainText: string, ingestText: string): string {
  return [
    'THE FILE ON DISK IS THE WOVEN DISPATCH PROMPT — 70-80% DONE. THE CONTEXT ARGS ARE ALREADY WOVEN INTO IT. YOUR JOB IS THE REMAINING 20%: SURGICAL POLISH, NOT A REWRITE.',
    '',
    'DO THIS — BATCHED (per the W1/W2 warheads in your system prompt):',
    'THE SOURCES ARE ALREADY QUOTED BELOW (THE ACTUAL FILE CONTENTS + the woven brief) — you rarely need any read call for inputs.',
    'STEP 1: plan every polish replacement fully in your reasoning — each oldText/newText pair chosen before emitting anything.',
    'STEP 2: fire ONE edit call whose edits[] carries ALL pairs — slop fixes, flow fixes, AND the [SHADOW INFERENCE] block append per W4. ONE call, whole round.',
    'MICRO-LOOP (max 3 loops from first re-verify): RE-VERIFY with one read of the file -> defects? fix with ONE batched edit call -> loop. Clean re-verify = done.',
    '',
    'PRESERVE: every filepath, every WHAT/HOW/WHY/EXPECTED block, the section markers (THE MISSION / THE ACCEPTANCE CRITERIA / THE READING ORDER / THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), the concrete verification commands, the doctrine quotes VERBATIM.',
    'MANDATORY FINAL STATE: the file ENDS with a line "~~~~~~~~~~~" then "[SHADOW INFERENCE]" then YOUR dense forward-map (≥100 chars of real content — a bare marker FAILS validation) (what files ARE from READING them, traps, priorities, contradictions). If missing, CREATE it via your batched edits. A file WITHOUT this block is INCOMPLETE.',
    '',
    'DO NOT:',
    '- NEVER rewrite the whole file from scratch — the woven brief IS the doc, polish it surgically.',
    '- NEVER emit a plan or a self-review ("I think", "Let me", "DONE") — only the edit tool changes the file.',
    '- NEVER invent file paths outside the list.',
    '',
    'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES.',
    '',
    '=== THE WOVEN BRIEF (the file on disk — the source of truth) ===',
    brief,
    '',
    '=== THE CONTEXT CHAIN (the session memory — verify claims against it where you polish) ===',
    chainText,
    '',
    '=== THE ACTUAL FILE CONTENTS (the subagent will read these — the shadow brain MUST understand them before polishing; the read tool lets you read MORE) ===',
    ingestText,
  ].join('\n');
}

// ── THE ERROR MANIFEST (the STRING — the g.split bypass; the gate/validation
//    refusals return BEFORE any work, never a log line) ──

function errorManifest(spec: AgentSpec, outDir: string, error: string): string {
  const name = sanitizeName(spec.name);
  return JSON.stringify({
    batch: { requested: 1, generated: 0, ready: 0 },
    agents: [{
      name,
      path: path.join(outDir, name + '.md'),
      lines: 0,
      sha256: '',
      validated: false,
      ready: false,
      subagentType: subagentTypeOf(spec),
      error,
    }],
    next: 'GENERATION REFUSED: ' + error,
  }, null, 2);
}



// ═══ THE ONE-PLACE COMPOSITION (the spec §4 — the 13-step pipeline) ═══

/** runShadowPipeline(spec, sessionStream, options) → the manifest STRING.
 *  THE COMPOSITION — the stages live in THIS function, never scattered. The
 *  tool's execute calls it once per agent; the batch's Promise.all runs the
 *  SAME pipeline per agent, in parallel (the spec §4: "The composition rule"). */
export async function runShadowPipeline(
  spec: AgentSpec,
  sessionStream: SessionStreamMessage[] | string[] = [],
  options: ShadowRunnerOptions = {},
): Promise<string> {
  // 1. THE TETHER (Stage 1 — the spec §3.6): globalThis → env → defaults
  const tethered: TetheredSession = options.tether ?? tetherSession();

  // 2. THE SIDECAR LIFECYCLE: register → touch → handleSessionSwitch
  registerSidecar(tethered.pid, tethered.sessionKey, tethered.projectId, tethered.parentSessionId ?? undefined);
  touchSidecar(tethered.pid);
  handleSessionSwitch(tethered.pid, tethered.sessionKey);

  // 3. THE SESSION-SCOPED MEMORY (Stage 7 — the spec §3.3)
  const memory = ShadowMemory.open(tethered.projectId, tethered.sessionKey);
  try {
    const outDir = options.outDir ?? OUT_DIR;

    // 4. THE REATTACH GATE (the spec §3.6 — 3 mechanical checks; ANY FAIL =
    //    the ERROR string, never a log line)
    const gate = verifyMemoryReattach(tethered.pid, tethered.sessionKey, memory.sessionDir);
    if (!gate.ok) {
      void tridentLog('WARN', 'shadow-runner', gate.reason || 'MEMORY_REATTACH_FAILED');
      return errorManifest(spec, outDir, gate.reason || 'MEMORY_REATTACH_FAILED');
    }

    // 5. VALIDATE (Stage 2 — the CTX_FLOORS + the path existence — the shared
    //    validators; the refusal names each thin field with its count)
    const specErr = validateAgentSpec(spec);
    if (specErr) {
      void tridentLog('WARN', 'shadow-runner', specErr);
      return errorManifest(spec, outDir, specErr);
    }

    // the template skeleton (the caller's cache, else the skill extraction)
    const skeleton = options.skeleton !== undefined ? options.skeleton : extractTemplateSkeleton(spec.template.toUpperCase());
    if (!skeleton) {
      const msg = 'the template skeleton could not be loaded for ' + spec.name + ' — the trident-dispatch-templates skill must be installed';
      void tridentLog('ERROR', 'shadow-runner', msg);
      return errorManifest(spec, outDir, msg);
    }

    // the filepaths-derived content (the reading order + the verification) —
    // the structure NEVER depends on the model (the v9 mechanical enrichment)
    const readingOrder = spec.filepaths.map((p: string, i: number) => (i + 1) + '. ' + p + ' — the ' + (i === 0 ? 'primary target' : 'supporting target')).join('\n');
    const readCommands = spec.filepaths.map((p: string) => 'read ' + p + ' (full pass, offset=0) — the file read to completion').join('\n');

    // 6. BUILDCONTEXT (Stage 4 — the session stream + the memory chain + the
    //    file excerpts → the [SHADOW INFERENCE]; the pre-read supplies the L4
    //    ground truth the inference verifies the context args against)
    const excerpts: FileExcerpt[] = preReadExcerpts(spec.filepaths);
    const ctx = buildContext(memoryAdapter(memory), spec, normalizeStream(sessionStream), excerpts);

    // 7. BUILDBRIEF (Stage 3 — the 84-slot weave + THE SUPREMACY CONTRACT + the
    //    [SHADOW INFERENCE] section — the shadow's understanding, written ON
    //    TOP of the inference)
    const injected = weave(skeleton, spec);
    const brief = injected + '\n\n' + SUPREMACY_CONTRACT + '\n\n' + ctx.inference.text;
    let promptText = brief + '\n\nTHE MECHANICAL READING ORDER (the filepaths — one per line):\n' + readingOrder +
      '\n\nTHE MECHANICAL VERIFICATION (run ALL + return the outputs — each a SINGLE command):\n' + readCommands;

    const maxRounds = options.maxRounds ?? PI_MAX_ROUNDS;

    // 8. THE HEADLESS PI AGENT (2026-08-19 — the operator's EXACT design:
    //    "PREBUILT PROMPTFILE ON DISK THAT IS THE WOVEN BRIEF - HEADLESS PI
    //    AGENT JUST USES THE EDIT TOOL FOR SURGICAL EDITS" + "STRIP THIS
    //    AGENT OF ANYTHING OTHER THAN READ AND EDIT"). THE FLOW:
    //    (a) the woven brief is written to disk as THE promptFile (<name>.md);
    //    (b) the pi Agent (read + edit ONLY) surgically EDITS the existing
    //        file — the edit tool is the ONLY write path;
    //    (c) the file IS the deliverable. NO brain, NO mock, NO text-sync —
    //    the model's TEXT is never written to the file, so the CoT leak is
    //    impossible.
    const piFilePath = path.join(outDir, sanitizeName(spec.name) + '.md');
    fs.mkdirSync(outDir, { recursive: true });
    // THE EPHEMERAL PROMPTFILE (the A2 loud-fail law): the file IS <name>.md
    // — the pi Agent edits it IN PLACE. On FAILURE the file is deleted — a
    // failed generation leaves NO file on disk (lines 0, ready false).
    fs.writeFileSync(piFilePath, promptText, 'utf-8');
    // run the REAL pi Agent to polish the file (read + edit).
    // THE EPHEMERAL SPAN: the Agent + its stream exist ONLY for this call —
    // when ShadowAgent.run returns, the Agent is garbage-collected and only
    // the promptFile persists on disk. THE SHADOW AGENT = THE PI SDK
    // VERBATIM (the operator's 2026-08-20 ruling): the pi nvidia provider +
    // the native read/edit tools + the native streamSimple transport.
    const shadow = new ShadowAgent(process.cwd(), { ledger: options.ledger });
    // THE INGEST WIRE (2026-08-21 — the operator's BATCH LAW): the input file
    // contents ride IN the demand (pre-read by the runner) so the shadow brain
    // needs ZERO read calls for its sources — R1 goes straight to the ONE
    // batched edit call.
    const ingestText = excerpts
      .map((e) => '--- FILE: ' + e.path + ' (' + e.lines + ' lines) ---\n' + e.content)
      .join('\n\n');
    const pi = await shadow.run({
      promptFilePath: piFilePath,
      systemPrompt: buildPiSystemPrompt(),
      // THE ROUND-1 DEMAND (the polish instruction + the context chain).
      demand: buildPiDemand(brief, ctx.chainUsed.text, ingestText),
      maxRounds,
      signal: options.signal,
      // THE TEST STREAM OVERRIDE (the tests inject a scripted stream; the
      // production default is the pi streamSimple).
      streamFn: options.streamFn as never,
    });
    // THE LOUD-FAIL + THE EPHEMERAL CLEANUP: on success the file IS the
    // deliverable (the Agent edited it in place); on failure (empty output /
    // errors) DELETE the file — NO file for a failed generation.
    if (pi.text && pi.text.trim().length > 0) {
      promptText = pi.text;
    } else {
      try { fs.unlinkSync(piFilePath); } catch { /* non-fatal — the file may not exist */ }
      promptText = '';
    }
    // ═══ THE LOUD-FAIL LAW (2026-08-07 — the operator's directive: "NO
    // MECHANICAL FALLBACK I EXPLICITLY SAID EITHER A LOUD FUCKING ERROR OR IT
    // WORKS STOP ENGINEERING SHITTY FALLBACKS... EVERYTHING IS EITHER A LOUD
    // FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE
    // FALSE SUCCESS AND DERAIL PROJECTS") ═══
    // A generation that produced no usable prompt is a LOUD FAILURE: the
    // error manifest (ready:false, the errors named), NO file, NO fabricated
    // prompt, NO fallback.
    if (!pi.text || pi.text.trim().length === 0) {
      const why = pi.errors.length > 0
        ? pi.errors.join('; ')
        : 'the PI loop produced no usable content across ' + pi.roundsUsed + ' round(s)';
      void tridentLog('ERROR', 'shadow-runner', 'PI_LOOP_EMPTY: ' + why + ' — NO FALLBACK (the loud-fail law)');
      return errorManifest(spec, outDir, 'PI_LOOP_EMPTY: ' + why + ' — the generation FAILED; NO mechanical fallback exists (the operator: a loud fail or a clear pass)');
    }
    promptText = pi.text;

    // 9. SILENT VERIFY (Stage 6 — the markers/structure/verbatim-doctrine/
    //    freshness/inference-presence + the L4 repairs; the flags ride INSIDE
    //    the manifest, L6). THE REPAIR APPLIES ONLY THE L4 BLOCKS (the
    //    supremacy + the doctrine) + the leak re-extraction — NEVER a
    //    mechanical structure fabrication. A failed structure = ready:false +
    //    the flags (a LOUD partial, never a fabricated pass).
    const verify = silentVerify(promptText, spec, pi.fileStates, ctx.inference);
    if (!verify.verified) {
      promptText = verify.repaired;
    }
    // THE ECHOED-INTRO STRIP (2026-08-07 — the operator: the [SHADOW
    // INFERENCE] section is LITERALLY "[SHADOW INFERENCE]" + the content):
    // any residual "The shadow backend's understanding... assembled from the
    // session stream" echo the model copied is removed from the FINAL prompt.
    promptText = stripEchoedInferenceIntro(promptText);
    // THE "STRUCTURAL GUARANTEE" mechanicallyRepair IS REMOVED (2026-08-07 —
    // it fabricated structure over the model's output + inflated the broken
    // drafts; the prompt ships as the model wrote it + the L4 blocks).

    // 10. APPENDPROMPT (Stage 7a — the sqlite row + the JSON mirror + lastSeq)
    const name = sanitizeName(spec.name);
    const lines = promptText.split('\n').length;
    const v = validateTaskPromptLines(promptText);
    const sha = sha256hex(promptText);
    const outPath = path.join(outDir, name + '.md');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, promptText, 'utf-8');
    const seq = memory.appendPrompt({
      seq: 0, // IGNORED — the atomic INSERT computes the real seq (the parallel-race fix:
             // the OLD nextSeq()+INSERT TOCTOU made N parallel pipelines collide on seq=1
             // → the UNIQUE constraint killed all but one → the batch shipped EMPTY
             // prompts. The append now returns the ACTUAL seq used.)
      name, prompt_text: promptText, sha256: sha, template: spec.template.toUpperCase(),
      validated: v.passed, lines, created_at: new Date().toISOString(),
    });

    // 11. SYNC (Stage 7b — the spec §3.8: SKIP unless a remote exists)
    //     no remote is configured — the pattern explicitly allows skipping

    // 12. THE MANIFEST (the STRING return — the g.split bypass)
    // THE READY BAR (2026-08-19 — the enforcement floor relaxed to 96 per the
    // operator's ruling: the LLM reference stays 125, the MECHANICAL ready bar
    // is 96 — a structurally-complete prompt a few lines under the target is
    // dispatched. ⚠️ INTENTIONAL, NOT A REGRESSION — do NOT restore 125 here;
    // the 125 generation reference is in the polisher text + the lineShortfall
    // demand. A future session that sees 96 and "fixes" it back to 125 re-
    // breaks the host generate (118/119-line clean prompts rejected).)
    const ready = v.passed && lines >= 96;
    const notes: string[] = [];
    if (pi.roundsUsed > 0) {
      notes.push('PI: ' + pi.roundsUsed + ' round(s), ' + pi.toolCallsMade + ' scoped tool call(s) [' +
        pi.fileStates.map((f) => f.path + ':' + f.lines + 'l').join(', ') + ']');
    }
    if (pi.errors.length > 0) notes.push('PI-FAILURE: ' + pi.errors.join('; '));
    if (verify.flags.length > 0) notes.push(...verify.flags);
    notes.push('INFERENCE: ' + (ctx.inference.flags.length > 0
      ? ctx.inference.flags.length + ' L4 contradiction(s) flagged — see the prompt\'s ' + SHADOW_INFERENCE_SECTION_TITLE
      : 'no contradictions detected'));

    // the diagnostic ON DISK (the operator's "15 minutes debugging" killer)
    const diagParts: string[] = [];
    if (pi.errors.length > 0) diagParts.push('PI FAILURES:\n' + pi.errors.join('\n'));
    if (verify.flags.length > 0) diagParts.push('VERIFY FLAGS:\n' + verify.flags.join('\n'));
    if (diagParts.length > 0) {
      try {
        fs.writeFileSync(path.join(outDir, 'ERROR-' + name + '-shadow.txt'), diagParts.join('\n\n'), 'utf-8');
      } catch (e) {
        // NEVER a silent empty catch (the D8 theatrical scan): the diagnostic
        // file is best-effort — the failure is LOGGED, the manifest still
        // carries the flags (the caller sees them, never the missing file).
        void tridentLog('WARN', 'shadow-runner', 'the diagnostic file ERROR-' + name + '-shadow.txt could not be written: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    // THE NAMED-PARTIAL FIX (2026-08-09 — the live container finding: the
    // wave-ct-b2 wave returned "ready:false, no error text" — the partial
    // manifest shipped ready:false with the flags ONLY in the notes, and the
    // wave-dispatch's shadowGenerate fell back to the generic message. The
    // loud-fail law (the operator: "EITHER A LOUD FUCKING ERROR OR IT WORKS")
    // demands the NAMED shortfall: the error field is computed from the data
    // (the validation + the line count), never a hardcoded string.
    const partialReason = !v.passed
      ? 'the DPL1 structure validation failed (validateTaskPromptLines)'
      : 'the prompt is below the ready bar: ' + lines + ' lines (< 96 — the enforcement floor; the 125 generation reference is the aim. ⚠️ Intentional relaxation per the 2026-08-19 ruling — NOT a regression.)';
    const manifest = {
      batch: { requested: 1, generated: 1, ready: ready ? 1 : 0 },
      agents: [{
        name, path: outPath, lines, sha256: sha, validated: v.passed, ready,
        subagentType: subagentTypeOf(spec), notes,
        ...(ready ? {} : { error: 'AGENT PARTIAL — ' + partialReason + ' (the notes + the ERROR-* files carry the flags)' }),
      }],
      next: ready
        ? 'AGENT READY — the dispatch prompt at ' + outPath + ' (the tool.after hook appends the COPY-PASTE instructions).'
        : 'AGENT PARTIAL — ' + partialReason + ' (the notes + the ERROR-* files carry the flags).',
    };
    return JSON.stringify(manifest, null, 2);
  } finally {
    memory.close();
  }
}
