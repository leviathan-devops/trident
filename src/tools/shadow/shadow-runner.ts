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
// THE MODEL DISCIPLINE (D-SH-2): the brain adapter is built FROM the shadow-
// brain module — SHADOW_MODEL (FROZEN deepseek-v4-flash), opencodeShadowStreamFn,
// SHADOW_TIMEOUT_MS, the OPENCODE_API_KEY secret store — never another model,
// never a fallback (AP-3). The agentic loop needs a messages-array shape
// callShadow's (prompt, system) signature cannot express, so the adapter wraps
// the brain's OWN transport with the SAME model/secret/timeout/error-encoding.
// Tests inject a mock brain.
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
import {
  SHADOW_MODEL,
  opencodeShadowStreamFn,
  SHADOW_TIMEOUT_MS,
  SHADOW_BASE_URL,
  type ShadowChatMessage,
  type ShadowStreamFn,
  type ShadowBrainResult,
} from './shadow-brain.ts';
import { resolveShadowApiKey } from './shadow-secrets.ts';
// F2 (2026-08-14 — the backoff retry): the measured window for the 2× retry.
import { measuredShadowWindowMs } from './shadow-health.ts';
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

// ── THE FROZEN CONSTANTS ──

/** THE L4 SUPREMACY CONTRACT — the FROZEN text (the spec §3.2: "The supremacy
 *  contract's text is FROZEN (the L4 law) — a paraphrase in the code is a
 *  violation"). PREPENDED to every generated prompt. */
export const SUPREMACY_CONTRACT =
  'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST ' +
  'THE FILES. A context arg that contradicts the file contents MUST be flagged, never ' +
  'conformed to. Every claim about the files must be READ from them, never assumed.';

/** The PI loop's rounds cap (the spec §4 step 8: "the rounds capped at 4"). */
export const PI_MAX_ROUNDS = 6;

/** The token budget per PI round — THE OPERATOR'S RULING (2026-08-07):
 *  "MAX TOKENS 300K ACROSS THE FUCKING BOARD ANYWHERE DEEPSEEK IS THE MODEL"
 *  → corrected: "380k actually. deepseek has a max tokens of 384,000" →
 *  "purge all this fuckin 8k max tokens slop". The OLD value (8192) was the
 *  TRUNCATION ROOT CAUSE: the model writes toward the 250-350-line target
 *  (the numbered prefixes were it counting lines) and the 8192 max_tokens
 *  cap CUT the completion mid-bullet (finish_reason 'length' — the observed
 *  "- READ-" dangling bullet at ~123 lines). The 250-350-line deliverable
 *  needs ~15-30K output tokens — 8192 was smaller than the deliverable it
 *  was supposed to carry. DeepSeek's real cap is 384,000: the shadow brain's
 *  max_tokens becomes 384_000. The accumulation-loop patchwork that worked
 *  around the truncation is REMOVED (the operator: "REMOVE YOUR PATCHWORK
 *  BULLSHIT SOLUTION AND FIX THIS ROOT ISSUE") — with the real cap the model
 *  writes the COMPLETE prompt + the [SHADOW INFERENCE] brief in one pass. */
export const PI_MAX_TOKENS = 384_000;

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

/** THE RUNNER'S BRAIN — the messages-array call shape the agentic loop needs
 *  (the pi-agent's streamFn shape). The default adapter is built FROM the
 *  shadow-brain module (model/transport/secret/timeout — D-SH-2). Tests
 *  inject a mock brain. */
export interface ShadowRunnerBrain {
  call(
    messages: ShadowChatMessage[],
    maxTokens: number,
    signal?: AbortSignal,
    // F2 (2026-08-14 — the backoff retry): the stall-window override — the
    // retry passes 2× the measured window (the slow-not-dead case).
    stallTimeoutMs?: number,
  ): Promise<ShadowBrainResult>;
}

export interface PiLoopResult {
  text: string;
  lines: number;
  validated: boolean;
  roundsUsed: number;
  toolCallsMade: number;
  fileStates: FileState[];
  errors: string[];
}

export interface VerifyResult {
  flags: string[];
  verified: boolean;
  repaired: string;
}

export interface ShadowRunnerOptions {
  /** The injected secret (the runner's configured store) — the brain's
   *  OPENCODE_API_KEY fallback. NEVER hardcoded, NEVER logged (AP-4). */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** The injected transport (tests stub this; the brain's own default). */
  streamFn?: ShadowStreamFn;
  /** The injected brain (tests stub this; the default is built from the
   *  shadow-brain module — the model discipline holds either way). */
  brain?: ShadowRunnerBrain;
  /** The tether override (tests pin the session; production uses the hook's
   *  globalThis → env → defaults chain via tetherSession()). */
  tether?: TetheredSession;
  /** The template skeleton (the caller's cache — falls back to extracting). */
  skeleton?: string | null;
  /** OUT_DIR override (tests sandbox the writes; production = /tmp/trident-task-preflight). */
  outDir?: string;
  /** The PI rounds cap override (default PI_MAX_ROUNDS). */
  maxRounds?: number;
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

// ── THE WIRE FORMAT (the PI loop's tool-call markers) ──
// The brain's transport (opencodeShadowStreamFn) returns TEXT content only —
// native tool_calls would be dropped by the transport's defensive read. The
// model is therefore instructed (in the PI system prompt) to emit the
// [TOOL_CALL] markers in its text; the runner parses, executes, and feeds the
// results back as [TOOL_RESULT] blocks in the next user message.
// THE BRACKET TOLERANCE (2026-08-07 — the live host-gen-a finding): the model
// emitted the call as <TOOL_CALL id=...> (angle-bracket open) while the
// parser matched only [TOOL_CALL ...] (square) — the call was NEVER EXECUTED
// (the read_file never ran — the read-before-write silently skipped) and the
// raw marker text polluted the candidate. The regex accepts BOTH open forms
// (square OR angle) + the square close.

const TOOL_CALL_RE = /[\[<]TOOL_CALL\s+id="([^"]+)"\s+name="([^"]+)"\s*[\]>]([\s\S]*?)\[\/TOOL_CALL\]/g;

function parseToolCalls(text: string): ToolCallRequest[] {
  const out: ToolCallRequest[] = [];
  for (const m of text.matchAll(TOOL_CALL_RE)) {
    let params: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(m[3].trim());
      params = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      params = { _parseError: m[3].trim().substring(0, 200) };
    }
    out.push({ id: m[1], name: m[2], params });
  }
  return out;
}

function stripToolCalls(text: string): string {
  // THE BRACKET TOLERANCE (2026-08-07 — same as the parse regex: the angle-
  // bracket open form <TOOL_CALL> must be stripped too, or the raw marker
  // text pollutes the candidate).
  return text.replace(/[\[<]TOOL_CALL\s+id="[^"]*"\s+name="[^"]*"\s*[\]>][\s\S]*?\[\/TOOL_CALL\]/g, ' ').trim();
}

// ── THE SCOPED READ-ONLY TOOLS (the spec §2: read_file/grep/stat — the
//    read-before-write, mechanically; NO write tools) ──

function makeScopedTools(filepaths: string[]): ScopedTool[] {
  return [
    {
      label: 'read_file',
      description: "Read a filepath's content (capped at " + READ_FILE_CAP + " chars). Returns the content + the line count. The read-before-write: verify the context args against the real file before writing the prompt.",
      parameters: {
        type: 'object',
        properties: { filepath: { type: 'string', description: 'the absolute path to read' } },
        required: ['filepath'],
      },
      execute(_id, params) {
        const filepath = typeof params.filepath === 'string' && params.filepath.length > 0 ? params.filepath : '';
        if (!filepath) return { content: 'ERROR: read_file requires a "filepath" string parameter', details: { isError: true } };
        let content: string;
        try {
          content = fs.readFileSync(filepath, 'utf-8');
        } catch (e) {
          return { content: 'ERROR: unreadable file ' + filepath + ': ' + (e instanceof Error ? e.message : String(e)), details: { isError: true } };
        }
        const lines = content.split('\n').length;
        const capped = content.length > READ_FILE_CAP
          ? content.substring(0, READ_FILE_CAP) + '\n...[excerpt truncated — the full file is ' + lines + ' lines, ' + content.length + ' chars]'
          : content;
        return { content: '=== FILE: ' + filepath + ' (' + lines + ' lines) ===\n' + capped, details: { lines, chars: content.length, path: filepath } };
      },
    },
    {
      label: 'grep',
      description: "grep a regex pattern over a filepath (or the task's filepaths when omitted). Returns the matching lines with their numbers, capped at 120 matches per file.",
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'the regex pattern to search' },
          filepath: { type: 'string', description: 'optional — the file to search; defaults to all the task filepaths' },
        },
        required: ['pattern'],
      },
      execute(_id, params) {
        const pattern = typeof params.pattern === 'string' && params.pattern.length > 0 ? params.pattern : '';
        if (!pattern) return { content: 'ERROR: grep requires a "pattern" string parameter', details: { isError: true } };
        const targets = typeof params.filepath === 'string' && params.filepath.length > 0 ? [params.filepath] : filepaths;
        // strip a surrounding /.../ pair if the model passed a literal regex
        const cleaned = pattern.replace(/^\/(.*)\/[a-z]*$/i, '$1');
        let re: RegExp;
        try {
          re = new RegExp(cleaned);
        } catch (e) {
          return { content: 'ERROR: invalid pattern "' + pattern + '": ' + (e instanceof Error ? e.message : String(e)), details: { isError: true } };
        }
        const out: string[] = [];
        let totalMatches = 0;
        for (const fp of targets) {
          let content: string;
          try {
            content = fs.readFileSync(fp, 'utf-8');
          } catch (e) {
            out.push('=== ' + fp + ' (unreadable: ' + (e instanceof Error ? e.message : String(e)) + ') ===');
            continue;
          }
          const matches: string[] = [];
          const linesArr = content.split('\n');
          for (let i = 0; i < linesArr.length && matches.length < 120; i++) {
            re.lastIndex = 0;
            if (re.test(linesArr[i])) matches.push(String(i + 1) + ': ' + linesArr[i].substring(0, 240));
          }
          totalMatches += matches.length;
          out.push('=== grep ' + pattern + ' in ' + fp + ' (' + matches.length + ' match(es)) ===\n' + matches.join('\n'));
        }
        return { content: out.join('\n\n'), details: { matches: totalMatches, pattern } };
      },
    },
    {
      label: 'stat',
      description: "The line count + the byte size of a filepath (or the task's filepaths when omitted).",
      parameters: {
        type: 'object',
        properties: { filepath: { type: 'string', description: 'optional — the file to stat; defaults to all the task filepaths' } },
        required: [],
      },
      execute(_id, params) {
        const targets = typeof params.filepath === 'string' && params.filepath.length > 0 ? [params.filepath] : filepaths;
        const out: string[] = [];
        let firstDetails: { lines: number; chars: number; path: string } | null = null;
        for (const fp of targets) {
          try {
            const st = fs.statSync(fp);
            const content = fs.readFileSync(fp, 'utf-8');
            const lines = content.split('\n').length;
            out.push(fp + ': ' + lines + ' lines, ' + st.size + ' bytes');
            if (!firstDetails) firstDetails = { lines, chars: content.length, path: fp };
          } catch (e) {
            out.push(fp + ': stat failed — ' + (e instanceof Error ? e.message : String(e)));
          }
        }
        return { content: out.join('\n'), details: firstDetails ?? {} };
      },
    },
  ];
}

async function executeScopedTool(
  tools: ScopedTool[],
  tc: ToolCallRequest,
  signal?: AbortSignal,
): Promise<{ content: string; isError: boolean; details?: unknown }> {
  const tool = tools.find((t) => t.label === tc.name);
  if (!tool) {
    return { content: 'ERROR: unknown tool "' + tc.name + '" — the scoped surface is read_file, grep, stat', isError: true };
  }
  try {
    const res = await tool.execute(tc.id, tc.params, signal);
    return { content: res.content, isError: false, details: res.details };
  } catch (e) {
    return { content: 'ERROR: the tool ' + tc.name + ' threw: ' + (e instanceof Error ? e.message : String(e)), isError: true };
  }
}

/** Record the freshness ground truth from a read_file/stat result. */
function recordFileState(fileStates: FileState[], details: unknown): void {
  if (details && typeof details === 'object') {
    const d = details as Record<string, unknown>;
    if (typeof d.path === 'string' && typeof d.lines === 'number') {
      const idx = fileStates.findIndex((f) => f.path === d.path);
      const state: FileState = { path: d.path, lines: d.lines, chars: typeof d.chars === 'number' ? d.chars : 0 };
      if (idx >= 0) fileStates[idx] = state; else fileStates.push(state);
    }
  }
}

// ── THE BRAIN ADAPTER (D-SH-2 — built from the shadow-brain module) ──

function defaultRunnerBrain(options: { apiKey?: string; baseUrl?: string; timeoutMs?: number; streamFn?: ShadowStreamFn } = {}): ShadowRunnerBrain {
  return {
    async call(messages: ShadowChatMessage[], maxTokens: number, signal?: AbortSignal, stallTimeoutMs?: number): Promise<ShadowBrainResult> {
      // THE SECRET (D-SH-2 / AP-4): the injected configured secret first, then
      // the env — NEVER hardcoded, NEVER logged.
      const apiKey = options.apiKey && options.apiKey.length > 0 ? options.apiKey : resolveShadowApiKey();
      if (apiKey.length === 0) {
        // THE LOUD ERROR — no fallback model, no silent empty content (AP-3)
        void tridentLog('ERROR', 'shadow-runner', 'SHADOW_RUNNER_NO_KEY — the OPENCODE_API_KEY secret is absent; the shadow brain REFUSES (no fallback)');
        return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_NO_KEY' };
      }
      const streamFn = options.streamFn ?? opencodeShadowStreamFn;
      const timeoutMs = options.timeoutMs ?? SHADOW_TIMEOUT_MS;
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let rejectTimeout: ((err: Error) => void) | null = null;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        rejectTimeout = reject;
      });
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        if (rejectTimeout) rejectTimeout(new Error('SHADOW_BRAIN_TIMEOUT'));
      }, timeoutMs);
      const onExternalAbort = (): void => {
        controller.abort();
      };
      try {
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', onExternalAbort, { once: true });
        }
        const resultPromise = streamFn({
          model: SHADOW_MODEL,
          messages,
          apiKey,
          baseUrl: options.baseUrl ?? SHADOW_BASE_URL,
          maxTokens,
          signal: controller.signal,
          // F2 (2026-08-14 — the backoff retry): the retry's 2×-window override
          // flows through to the transport's stall detector.
          stallTimeoutMs,
        });
        resultPromise.catch((err: unknown) => {
          void tridentLog('WARN', 'shadow-runner', 'the streamFn promise rejected after the race settled: ' + (err instanceof Error ? err.message : String(err)));
        });
        let sr;
        try {
          sr = await Promise.race([resultPromise, timeoutPromise]);
        } catch (raceErr) {
          if (timedOut) {
            void tridentLog('ERROR', 'shadow-runner', 'SHADOW_BRAIN_TIMEOUT — the LLM call stalled past ' + timeoutMs + 'ms');
            return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_TIMEOUT: the LLM call stalled past ' + timeoutMs + 'ms' };
          }
          if (signal?.aborted) return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' };
          const message = raceErr instanceof Error ? raceErr.message : String(raceErr);
          void tridentLog('ERROR', 'shadow-runner', 'SHADOW_BRAIN_FAIL: ' + message);
          return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_FAIL: ' + message };
        }
        if (sr.stopReason === 'aborted') {
          if (timedOut) {
            void tridentLog('ERROR', 'shadow-runner', 'SHADOW_BRAIN_TIMEOUT — the transport aborted past ' + timeoutMs + 'ms');
            return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_TIMEOUT: the LLM call stalled past ' + timeoutMs + 'ms' };
          }
          return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' };
        }
        if (sr.stopReason === 'error') {
          void tridentLog('ERROR', 'shadow-runner', sr.errorMessage || 'SHADOW_BRAIN_FAIL');
          return { content: '', model: SHADOW_MODEL, ok: false, error: sr.errorMessage || 'SHADOW_BRAIN_FAIL' };
        }
        if (sr.content.length === 0) {
          void tridentLog('ERROR', 'shadow-runner', 'SHADOW_BRAIN_EMPTY — the completion returned no content');
          return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_EMPTY: the completion returned no content' };
        }
        return { content: sr.content, model: SHADOW_MODEL, ok: true };
      } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

// ── THE CANDIDATE EVALUATION (the v10 repair + the validation) ──
// ═══ THE REASONING-TOKEN EXTRACTION (2026-08-07 — THE CONTAMINATION FIX) ═══
// THE BUG (the operator's catch, live): the shadow brain's output contained its
// chain-of-thought — the model QUOTED the output contract early ("EXECUTE THE
// FOLLOWING", include section markers...) so the OLD extraction (the FIRST
// indexOf('EXECUTE THE FOLLOWING')) cut at position 0 inside the THINKING and
// the entire drafting session (planning, multiple drafts, meta-commentary)
// rode along as "the prompt". The structural gates PASSED because the
// contamination CONTAINS the markers. The fix = the LAST real template opener
// (the "... VERBATIM" form — the thinking's bare quotes never match the full
// pattern) + the fence stripping + the trailing-meta stripping. The detector
// (detectThinkingLeak) + the verifier flag catch any residual leak; the
// manifest carries the flag so the orchestrator sees it (L6).

/** THE REAL TEMPLATE OPENERS (all 9 templates — E1-E4, B1-B5 — the forms
 *  "EXECUTE THE FOLLOWING <TYPE> VERBATIM"). The thinking's quotes of the
 *  output contract ("EXECUTE THE FOLLOWING\", include section markers") never
 *  match the full pattern — only an actual draft's opening line does. */
export const TEMPLATE_OPENER_RE =
  /EXECUTE THE FOLLOWING (?:FORENSIC CONTEXT EXTRACTION|CONTEXT SYNTHESIS|RESEARCH TASK|FAILURE INVESTIGATION|BUILD PLAN|DEBUGGING PLAN|SURGICAL EDIT PLAN|TEST IMPLEMENTATION|PIPELINE BUILD) VERBATIM/;

/** THE DETERMINISTIC EXTRACTION — the LAST real opener + the fence/meta strip.
 *  Idempotent on clean prompts (a single opener at position 0 → unchanged). */
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

// ── THE PI EXECUTION LOOP (Stage 5 — the agentic loop: prompt → stream →
//    scoped tool-calls → results fed back → continue) ──

async function runPiLoop(opts: {
  brain: ShadowRunnerBrain;
  systemPrompt: string;
  demand: string;
  filepaths: string[];
  context: string;
  maxRounds: number;
  signal?: AbortSignal;
}): Promise<PiLoopResult> {
  const messages: ShadowChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.demand },
  ];
  const fileStates: FileState[] = [];
  const errors: string[] = [];
  const tools = makeScopedTools(opts.filepaths);
  let bestValidated: Candidate = { text: '', lines: 0, validated: false };
  let bestRaw: Candidate = { text: '', lines: 0, validated: false };
  let toolCallsMade = 0;
  let roundsUsed = 0;

  for (let round = 1; round <= opts.maxRounds; round++) {
    roundsUsed = round;
    let r = await opts.brain.call(messages, PI_MAX_TOKENS, opts.signal);
    // THE PI-ROUND RETRY (2026-08-12 — the "should never stall" ruling): a
    // round-1 failure on the TRANSIENT class (timeout/500 — the provider
    // stall/overload, NOT an input error) is retried ONCE. The live proof: the
    // identical wave input failed at 180s then succeeded on retry in 361s. The
    // retry produces what the primary produces — never a substitute artifact.
    // THE BACKOFF (F2 — 2026-08-14, the slow-not-dead distinction): a timeout
    // means the provider is SLOW (the documented 35-50s first-event for the
    // 384K shape), not dead. The retry waits a 3s breathing gap (the load
    // case) + passes the 2× measured window (the slow case) — the SAME
    // window retry under load stalls identically. NO provider/model switching
    // (the operator: "no model switching ever. provider as well only backup is
    // direct deepseek api but this should NEVER BE USED unless there is a
    // legit server failure of opencode go").
    if (!r.ok && round === 1 && typeof r.error === 'string' &&
        (r.error.indexOf('SHADOW_BRAIN_TIMEOUT') !== -1 || r.error.indexOf('SHADOW_BRAIN_HTTP_500') !== -1)) {
      void tridentLog('WARN', 'shadow-runner', 'PI round ' + round + ' transient failure (' + r.error + ') — the round retries ONCE at 2× the measured window after a 3s gap');
      // THE 3S BREATHING GAP (the load case — a loaded provider needs the queue to drain):
      await new Promise<void>((res) => setTimeout(res, 3000));
      r = await opts.brain.call(messages, PI_MAX_TOKENS, opts.signal, measuredShadowWindowMs() * 2);
    }
    if (!r.ok) {
      errors.push('PI round ' + round + ': ' + (r.error || 'SHADOW_BRAIN_FAIL'));
      void tridentLog('WARN', 'shadow-runner', errors[errors.length - 1]);
      break; // the dead-LLM — the caller's fallback takes over
    }
    const content = r.content;
    const toolCalls = parseToolCalls(content);
    const cleanText = stripToolCalls(content);
    // the candidate — the model's written portion of this round. THE CLEAN
    // EVALUATION (2026-08-07 — the patchwork REMOVED per the operator: the
    // accumulation-append hack is gone; with PI_MAX_TOKENS = 300K the model
    // writes the COMPLETE prompt + the [SHADOW INFERENCE] brief in ONE pass
    // — the truncation root cause (the 8192 cap) is fixed at the source, so
    // no fragment-append machinery is needed).
    const cand = evaluateCandidate(cleanText, opts.filepaths, opts.context);
    // THE VALIDATION-FEEDBACK LOOP (2026-08-10 — the AGENT PARTIAL fix): the
    // old continuation told the model "keep EVERY line + ADD" — it never named
    // the validator's ACTUAL failures, so the drafting stayed, the structure
    // stayed broken, all the rounds failed, and the bestRaw fallback shipped
    // the partial. THE FIX: the candidate's named deficiencies (the missing
    // markers + the structural failures) feed the next continuation, which
    // demands the REWRITE of the structure, not more content.
    let candFeedback = '';
    if (!cand.validated) {
      const v = validateTaskPromptLines(cand.text);
      candFeedback = v.lines.join('; ');
    }
    if (cand.validated) {
      if (cand.lines > bestValidated.lines) bestValidated = cand;
    } else if (cand.text.length > bestRaw.text.length) {
      bestRaw = cand;
    }
    const acceptanceMet = bestValidated.lines >= PI_ACCEPT_LINES;

    if (toolCalls.length > 0) {
      // THE READ-BEFORE-WRITE, MECHANICALLY: execute the scoped read-only tools
      // and feed the results back into the loop
      toolCallsMade += toolCalls.length;
      const results: string[] = [];
      for (const tc of toolCalls) {
        const res = await executeScopedTool(tools, tc, opts.signal);
        recordFileState(fileStates, res.details);
        results.push('[TOOL_RESULT id="' + tc.id + '" name="' + tc.name + '" is_error="' + (res.isError ? 'true' : 'false') + '"]\n' + res.content + '\n[/TOOL_RESULT]');
      }
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: results.join('\n\n') + '\n\nContinue. When you have read what you need, WRITE THE COMPLETE PROMPT (250-350 lines, beginning with "EXECUTE THE FOLLOWING"). ' + INFERENCE_BRIEF_INSTRUCTION });
      if (acceptanceMet) break;
      continue;
    }

    // the model stopped writing — no tool calls this round
    messages.push({ role: 'assistant', content });
    if (acceptanceMet) break;
    if (bestValidated.lines >= 250) break; // the target
    // under the target — the continuation round (the model writes the FULL
    // prompt again, improved — with 300K the truncation is gone, so the
    // continuation only fires on genuine under-production)
    messages.push({
      role: 'user',
      content: 'ROUND ' + round + ' OUTPUT: ' + bestValidated.lines + ' validated lines' +
        ' (the last candidate ' + cand.lines + ' lines, validation ' + (cand.validated ? 'PASSED' : 'FAILED') + ').' +
        (candFeedback ? ' THE VALIDATION FAILURES: ' + candFeedback + '. ' : '') +
        ' REWRITE THE COMPLETE PROMPT with the template structure — the mission, the acceptance criteria, the reading order (3+ absolute paths), the per-task WHAT/HOW/WHY/EXPECTED blocks (3+ tasks), the constraints/do-not-touch, the concrete verification commands (grep/bun/sha256sum), the return format. Begin with "EXECUTE THE FOLLOWING". Do NOT include drafting, line-counting, or tool-planning notes in the prompt body. ' + INFERENCE_BRIEF_INSTRUCTION,
    });
  }

  const best = bestValidated.text.length > 0 ? bestValidated : bestRaw;
  return {
    text: best.text,
    lines: best.lines,
    validated: best.validated,
    roundsUsed,
    toolCallsMade,
    fileStates,
    errors,
  };
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
    'You are the SHADOW BRAIN of the trident-task-preflight tool — the dispatch-prompt generator\'s inference backend. DeepSeek V4 Flash, effort max. You are NOT an agent with your own goals; you are the tool\'s inference layer, and your only output is the COMPLETE dispatch prompt.',
    '',
    'THE SCOPED TOOLS (READ-ONLY — the read-before-write, mechanically):',
    '- read_file { filepath } — the content of a file (capped).',
    '- grep { pattern, filepath? } — the lines matching the pattern (filepath optional — defaults to the task filepaths).',
    '- stat { filepath? } — the line count + the byte size.',
    'When you need to VERIFY a claim about a file — call the tool FIRST, then write from what you read. THE FILES ARE THE ONLY GROUND TRUTH.',
    '',
    'THE TOOL-CALL FORMAT — to call a tool, emit EXACTLY (in your text):',
    '[TOOL_CALL id="<a unique id>" name="<the tool>"]',
    '{ "filepath": "...", "pattern": "..." }',
    '[/TOOL_CALL]',
    'The results return in the next message as [TOOL_RESULT] blocks. After you have read what you need, WRITE THE COMPLETE PROMPT — do NOT leave [TOOL_CALL] blocks in the final prompt.',
    '',
    SUPREMACY_CONTRACT,
    '',
    'THE OUTPUT CONTRACT: the complete dispatch prompt text ONLY — NO preamble, NO thinking, NO markdown fences, NO [TOOL_CALL] blocks in the final output. The output must BEGIN with "EXECUTE THE FOLLOWING". The prompt must include: the per-task WHAT/HOW/WHY/EXPECTED blocks (3+ tasks), 3+ absolute filepaths, the section markers (THE MISSION / THE ACCEPTANCE / THE READING ORDER / THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), the concrete verification commands, the doctrine QUOTED VERBATIM, and 250-350 lines. NEVER invent file paths outside the task filepaths.',
    '',
    INFERENCE_BRIEF_INSTRUCTION,
  ].join('\n');
}

function buildPiDemand(brief: string, chainText: string, ingestText: string): string {
  return [
    'THE PROMPT SKELETON BELOW HAS THE GOLDEN STRUCTURE. THE CONTEXT ARGS ARE THE RAW MATERIAL — WRITE THE COMPLETE PROMPT by weaving each arg into its section in the GOLDEN STYLE (the operator\'s standard — the god-tier dispatch prompt):',
    '- THE MISSION: the mission arg expanded into a FULL paragraph (the what, the why, the framing).',
    '- THE ACCEPTANCE CRITERIA: the static bullets + the acceptance arg formed into the checkable bullets.',
    '- THE READING ORDER: the filepaths as the numbered list — keep EVERY path.',
    '- THE KNOWN CONTEXT: the knownContext arg expanded into the bulleted measured state with the anchors.',
    '- THE OPERATOR\'S DOCTRINE: the doctrine arg QUOTED VERBATIM — never paraphrased.',
    '- THE KNOWN MEASUREMENTS TABLE: the measurements arg formed into a markdown table.',
    '- THE PER-TASK EXPANSIONS: the taskTargets arg formed into the bulleted concrete targets.',
    '- THE POSITION: the position arg expanded into the paragraph.',
    '- THE TASKS: the static skeletons with the WHAT/HOW/WHY/EXPECTED expanded from the taskTargets into full engineering paragraphs.',
    'THE FINAL PROMPT MUST BE 250-350 LINES — the dispatch-prompt size, NEVER the 600-line bloat; count the lines before you finish.',
    'THE VALIDATION REQUIRES: the per-task WHAT/HOW/WHY/EXPECTED blocks, 3+ absolute filepaths, the section markers (THE MISSION / THE ACCEPTANCE / THE READING ORDER / THE CONSTRAINTS / THE VERIFICATION / THE RETURN FORMAT), the concrete verification commands, and the structure DISPATCHABLE as-is. KEEP every filepath. NEVER invent file paths outside the list. Output ONLY the complete prompt text — NO preamble, NO thinking, NO markdown fences. The output must BEGIN with "EXECUTE THE FOLLOWING".',
    INFERENCE_BRIEF_INSTRUCTION,
    '',
    '=== THE WOVEN BRIEF (the skeleton + the L4 SUPREMACY CONTRACT + the [SHADOW INFERENCE]) ===',
    brief,
    '',
    '=== THE CONTEXT CHAIN (the session memory — the prior generations + the epoch + the recent session window) ===',
    chainText,
    '',
    '=== THE ACTUAL FILE CONTENTS (the subagent will read these — the shadow brain MUST understand them before writing; the scoped tools let you read MORE) ===',
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

    // the brain (the injected mock OR the default built from the shadow-brain
    // module — the model discipline holds either way)
    const brain = options.brain ?? defaultRunnerBrain({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      streamFn: options.streamFn,
    });
    const maxRounds = options.maxRounds ?? PI_MAX_ROUNDS;

    // 8. THE PI EXECUTION LOOP (Stage 5 — the agentic loop: prompt → stream →
    //    the scoped read_file/grep/stat → the results fed back → continue)
    const demand = buildPiDemand(brief, ctx.chainUsed.text, ingestFiles(spec.filepaths));
    const pi = await runPiLoop({
      brain,
      systemPrompt: buildPiSystemPrompt(),
      demand,
      filepaths: spec.filepaths,
      context: ctxBlob(spec),
      maxRounds,
      signal: options.signal,
    });
    // ═══ THE LOUD-FAIL LAW (2026-08-07 — the operator's directive: "NO
    // MECHANICAL FALLBACK I EXPLICITLY SAID EITHER A LOUD FUCKING ERROR OR IT
    // WORKS STOP ENGINEERING SHITTY FALLBACKS... EVERYTHING IS EITHER A LOUD
    // FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE
    // FALSE SUCCESS AND DERAIL PROJECTS") ═══
    // THE OLD DEAD-LLM SAFETY (the v13 expansion + mechanicallyRepair over the
    // mechanical brief) FABRICATED a "validated" prompt when the brain
    // produced nothing — the FALSE SUCCESS (the live ct-final-1 artifact: the
    // mechanical sections + zero model brief + validated:true). THAT MACHINERY
    // IS DEAD. A generation that produced no usable prompt is a LOUD FAILURE:
    // the error manifest (ready:false, the errors named), NO file, NO
    // fabricated prompt, NO fallback.
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
    const ready = v.passed && lines >= 125;
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
      : 'the prompt is below the ready bar: ' + lines + ' lines (< 125)';
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
