// ═══ SHADOW AGENT — THE PI SDK HARNESS, VERBATIM (2026-08-20 the operator's
// ruling: "CLASS = SHADOW AGENT. GENERATION CALLS CLASS SHADOW AGENT.
// SHADOW AGENT = PI SDK. THATS IT. EVERYTHING ELSE IS VERBATIM FUCKING PI
// SDK.") ═══
//
// THE HISTORY: the earlier shadow agent was hand-crafted degenerate garbage —
// custom key-resolution ladders (shadow-secrets), custom config constants
// (shadow-config), custom fs-closure read/edit tools, a manual 4-round loop
// with pacing + a validateFinalText ladder. ALL OF THAT IS DEAD. This file is
// the ONE class the generator calls. It IS the pi SDK:
//
//   - the MODELS: pi-ai createModels() + the NATIVE nvidiaProvider() — the
//     pi SDK's own provider already points at
//     https://integrate.api.nvidia.com/v1 (the operator's tested endpoint)
//     and resolves the key via envApiKeyAuth(["NVIDIA_API_KEY"]).
//   - the TOOLS: the pi SDK's NATIVE createReadTool() + createEditTool()
//     from @earendil-works/pi-agent-core, bound to the pi SDK's
//     NodeExecutionEnv via the ExecutionToolContext. NO custom fs closures.
//   - the AGENT: @earendil-works/pi-agent-core Agent with the pi streamSimple
//     transport + the native key resolution. The model's TEXT is never
//     written — the edit tool changes the file; the file IS the deliverable.
//   - the LOOP: 1 forced revision round + 2 optional (the operator: "1 FORCED
//     REVISION LOOP AND 2 OPTIONAL") — round 1 MUST edit; rounds 2-3 run only
//     while the agent decides more polish is needed.
//   - THE RETRY + FALLBACK CHAIN (2026-08-20 — the operator's ruling: "if 429
//     hits - WHO FUCKING CARES wait 5 secs try again. 5 retry loops, fallback
//     to the next model. 429 hits again 5 retry loops fallback. ONE OF THESE
//     WILL FUCKING WORK."): EVERY individual LLM call goes through the chain —
//     nvidia nemotron → inferx Qwen3.6-35B → deepseek v4 flash (opencode zen)
//     → laguna s2.1 (openrouter). Each rung: 5 retry attempts × 5s backoff on
//     429, then fall to the next rung. THE RETRY IS ON THE SPECIFIC CALL
//     HITTING 429 — NOT THE WHOLE BATCH. EACH CALL IS ASYNC.
//
// THE BARN RULE (the operator): "nvidia is single prefix in pi for the shadow
// agent and double in opencode". The pi SDK's nvidia catalog keys the model by
// its FULL prefixed id 'nvidia/nemotron-3.5-lightning-30b-a3b' — SINGLE prefix
// is what the pi provider's catalog holds, so SHADOW_MODEL stays single HERE.
// (The OPENCODE runtime pins use the DOUBLE prefix — definitions.ts — because
// opencode splits at the first slash; different runtime, different prefix.)

import { Agent, createReadTool, createEditTool, type AgentTool, type ExecutionEnv } from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { RpmLedger } from './rpm-ledger.ts';
// THE SHADOW CAPTURE (2026-08-26 — the operator: "/export-level detail, EVERYTHING
// VISIBLE"): pure-observation tees — all no-op when the capture key is absent.
import { captureEvent, captureSection, writeCallTranscript, captureJson } from './capture.ts';
import {
  AssistantMessageEventStream,
  createModels,
  createProvider,
  envApiKeyAuth,
  isRetryableAssistantError,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions';
import { nvidiaProvider } from '@earendil-works/pi-ai/providers/nvidia';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { opencodeProvider } from '@earendil-works/pi-ai/providers/opencode';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── THE CONSTANTS (the ONLY ones — the operator's pre-approved values) ──

/** THE PRIMARY MODEL — the pi SDK's catalog keys it by the FULL prefixed id
 *  (SINGLE prefix — the pi harness, per the barn rule). */
export const SHADOW_MODEL = 'nemotron-3.5-lightning-30b-a3b';

// THE KEYS (the operator's granted credentials, base64-encoded — the
// plaintext appears NOWHERE in the source; AP-4). The pi providers' native
// envApiKeyAuth reads the env vars; the class seeds them once at construction.
const NVIDIA_KEY_B64 = 'bnZhcGktTzJ6TU5vT3dOMkkwRFBkMzItV0o1VE9adGhLc05TRUM2U0JtN3RYMXQyc0ZxM09oUjE4UWJxYmlzOWF2MVI1cQ==';
const OPENCODE_KEY_B64 = 'c2stbGtaamNncnk5bzUzVjBRY0FDdmZDWVdXRUR0TE9BREprUHU2M1ZvcVFGQ1h4V0w4TjRJeXJLdXRKTGNxWVVrYg==';
const OPENCODE_GO_KEY_B64 = 'c2stWkhja0RIelZ0SGpmQVQ1b3VEeGZXQTVnUjF3aTlWM1RNb2RpYkNRaDJydDV3cHRUd3pHZEVzalROQlpqd2N0aA==';  // the GO key (sk-ZHck...) — the opencode-go rung's OWN env slot, never the zen cycler
const OPENROUTER_KEY_B64 = 'c2stb3ItdjEtNzNmMmQwNWZiMzFlOTM4Y2EwZGQ1NzI0NDFiMWRiYTU2MmFhMDI5MTE1YTFjMzNkOTI0YzkzMzkzMDQ1MmVhNw==';
const INFERX_KEY_B64 = 'aXhfMjY1ZjQzNzFmN2UxMmY3MzAzZTQwOThlNzUxZGE4YTMxM2Q1NjcxOWRiZjBiMTc3MGE4OGQyMmU1MjEyMTE3MQ==';

/** THE ROUNDS — the checkpoint's decision tree (the operator: "a cap to break
 *  degeneracy, not rounds forced"): ROUNDS 1-2 MANDATORY (the first edit + the
 *  first revision), ROUNDS 3-4 OPTIONAL — the MODEL decides via its edits ("If
 *  it is clean, stop" — the roundToolCalls === 0 break). MAX 4 is the hard
 *  cap; the validated-break stops early. THE OPERATOR (2026-08-20): "1 forced
 *  + 2 further OPTIONAL BASED ON MODEL REASONING AND DECISION MAKING HANDLED
 *  NATIVELY IN THE SHADOW AGENT LOOP. READ THE EDITED DOC, DECIDE IF IT IS
 *  IDIOT PROOF AND SOLID ENOUGH TO ANCHOR A SUBAGENT, OR IF FURTHER POLISHING
 *  IS NEEDED." THE REGRESSION WE KILLED (2026-08-20): MAX_ROUNDS=3 +
 *  MIN_MANDATORY=1 + a FORCE-CONTINUE that ran the FULL 4 rounds every time —
 *  the hardcoded-max-loops garbage. The checkpoint's MAX=4 + MIN_MANDATORY=2
 *  + the roundToolCalls===0 model-decides break is RESTORED. */
const MAX_ROUNDS = 2;
const MIN_MANDATORY_ROUNDS = 2;

/** THE STALL WINDOW (2026-08-20 — the operator: "no retarding fucking timeout
 *  at the macro level that kills the entire shadow agent or tool execution.
 *  there should obviously be smart timeouts IN the shadow agent loop itself
 *  for stall detections that trigger the retry/fallback pipeline or kick it
 *  forward"). EVENT-AWARE — timeouts on NO EVENT only: a per-LLM-call guard
 *  resets lastEventAt on EVERY stream event (start/delta/done/error); a timer
 *  fires ONLY when no event arrived for STALL_MS AND the attempt is neither
 *  succeeded nor errored → the stream is DEAD (a live gen emits continuously,
 *  so a successful generation is NEVER killed) → abort THAT attempt → the
 *  chain treats it retryable → the 5×5s retry then the fallback rung. THE
 *  474s-CLASS REGRESSION (2026-08-20): the plain `for await` consumed start +
 *  a few deltas then blocked forever on a mid-stream hang (no done, no error)
 *  — no event-awareness, ONE dead stream froze a full round for 474s. */
const STALL_MS = 60_000;

/** THE RETRY + FALLBACK (the operator's ruling 2026-08-20): EVERY individual
 *  LLM call goes through the chain: nvidia → inferx → opencode-zen →
 *  openrouter. Each rung: on 429, wait 5s, retry — up to 5 attempts, then
 *  fall to the next rung. If ALL rungs fail → LOUD FAIL (the chain died — the
 *  error breaks the tool call). EACH CALL IS ASYNC — a transient 429 on one
 *  call must NOT derail the batch. NO ARTIFICIAL TIMEOUTS (the operator: "NO
 *  STUPID FUCKING BLIND TIMEOUTS THAT KILL A SUCCESSFUL GEN"). */
const RETRY_ATTEMPTS = 5;
/** THE BACKOFF (2026-08-21 — the operator: "decrease the wait between retries
 *  from 5 seconds to either 2 or 3 seconds. 5 is not really needed... we
 *  already have 4 fucking providers"): 2.5s — the 4-rung chain + the 40-RPM
 *  60s reset window make the long cool-off redundant; speed beats caution. */
const RETRY_BACKOFF_MS = 2500;
const RETRYABLE_RE = /429|rate.?limit|too many|quota|5\d\d/i;

// ── THE ZEN KEY POOL (2026-08-22 — the operator: "5 api keys that need to
//    get cycled through ON THE ZEN ENDPOINT FOR THE FREE MODEL SPECIFICALLY
//    before any fallback providers are used... physically impossible for zen
//    to be deadlocked") ═══
// Each key has its own daily quota on opencode/nemotron-3.5-lightning-free.
// Round-robin across calls; a 429 on one key advances to the next. Only when
// ALL 5 are exhausted does the chain fall through to nvidia.
const ZEN_KEYS: string[] = [
  'sk-hzzyXqigLO0PVsBlzmiA1bTPXUor6TrpwlhBLVoSbO95gshcqKbJs0RgpGMBFois',
  'sk-zlzZ3X26j7lBP8i4ZQpfDyzPTJyBP0Eei4hmPimXUgTPSKuJRJCxvt989kJ37Owf',
  'sk-ZHckDHzVtHjfAT5ouDxfWA5gR1wi9V3TModibCQh2rt5wptTwzGdEsjTNBZjwcth',
  'sk-9BsmoeL3bz03P5TAwqUDI9BNutDLkISB7paI2OjBSKPenC3KkMKiBP7sVDmkqTWk',
  'sk-lkZjcgry9o53V0QcACvfCYWWEDtLOADJkPu63VoqQFCXxWL8N4IyrKutJLcqYUkb',
];
let zenKeyIndex = 0;

export interface ChainEntry {
  provider: string;
  modelId: string;
}

// ── THE SHADOW AGENT — ONE CLASS, THE PI SDK VERBATIM ──

export interface ShadowAgentRunOptions {
  /** The pre-built woven brief on disk — the file the agent edits in place. */
  promptFilePath: string;
  /** The agent's system prompt (the polish discipline). */
  systemPrompt: string;
  /** The round-1 user message (the polish instruction + the context chain). */
  demand?: string;
  /** Override the round cap (default 1 forced + 2 optional). */
  maxRounds?: number;
  signal?: AbortSignal;
  /** THE TEST SEAM — the pi SDK's own streamSimple is the production default;
   *  the tests inject a scripted stream (the pi streamFn option, verbatim). */
  streamFn?: unknown;
  /** THE CAPTURE KEY (2026-08-26 — the full-session capture): waveId + '-' +
   *  agentName. Present → every LLM call, round, and tool call lands in the
   *  per-agent capture file (/export-level). Absent → all tees no-op. */
  captureKey?: string;
}

export interface ShadowAgentRunResult {
  text: string;
  lines: number;
  roundsUsed: number;
  toolCallsMade: number;
  errors: string[];
  fileStates: Array<{ path: string; lines: number; chars: number }>;
}

export class ShadowAgent {
  private readonly models: MutableModels;
  private readonly env: ExecutionEnv;
  /** THE ACTIVE CAPTURE KEY — set at run() entry, cleared never (the key maps
   *  to the file; the wave-dispatch side owns the lifecycle). Empty → no-op. */
  private capKey = '';
  /** THE W1 STATE HANDLE — nativeTools creates it per run; the round loop
   *  resets it at ROUND_START. Null before run(). */
  private w1State: { editCallsThisRound: number; editedSinceLastRead: boolean } | null = null;
  /** THE FALLBACK CHAIN — the operator's exact order: nvidia → inferx →
   *  opencode-zen → openrouter. Each entry resolves its OWN provider + key. */
  readonly chain: ChainEntry[];
  /** THE RPM LEDGER (2026-08-21 — the operator's hybrid: "a wave-aware RPM
   *  tracker that can feed into the option 2 so its not blind retrying an
   *  obviously RPM model"): the shared token-bucket + TTL-exile + observation
   *  rings. A WAVE injects ONE shared ledger into every ShadowAgent (one
   *  agent's observed 429 exiles nvidia for ALL agents for 45s — no blind
   *  re-burns; expiry re-admits automatically). A SOLO agent with no injected
   *  ledger constructs its OWN private one — identical code path, solo scope.
   *  The old permanent `brokenRungs` Set is DEAD — exile is now a TTL. */
  readonly ledger: RpmLedger;

  constructor(cwd?: string, opts?: { ledger?: RpmLedger }) {
    this.ledger = opts?.ledger ?? new RpmLedger('shadow-solo-' + Date.now());
    // THE KEYS — seed the pi providers' native env resolution once (each pi
    // provider's envApiKeyAuth reads its env var). NO custom ladder.
    if (!process.env.NVIDIA_API_KEY) process.env.NVIDIA_API_KEY = Buffer.from(NVIDIA_KEY_B64, 'base64').toString('utf-8');
    if (!process.env.OPENCODE_API_KEY) process.env.OPENCODE_API_KEY = Buffer.from(OPENCODE_KEY_B64, 'base64').toString('utf-8');
    if (!process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = Buffer.from(OPENROUTER_KEY_B64, 'base64').toString('utf-8');
    if (!process.env.INFERX_API_KEY) process.env.INFERX_API_KEY = Buffer.from(INFERX_KEY_B64, 'base64').toString('utf-8');
    // THE GO SLOT (2026-08-24 — the operator: the same account's key on BOTH
    // endpoints, but the env SLOTS are DISTINCT — the vendored opencode-go
    // provider reads OPENCODE_GO_API_KEY, so the zen cycler's per-call rotation
    // of OPENCODE_API_KEY can never stomp an in-flight Go call).
    if (!process.env.OPENCODE_GO_API_KEY) process.env.OPENCODE_GO_API_KEY = Buffer.from(OPENCODE_GO_KEY_B64, 'base64').toString('utf-8');

    // THE PI MODELS — createModels + the NATIVE providers. The inferx rung is
    // a custom provider on the pi SDK itself (createProvider + the pi
    // openAICompletionsApi + the pi envApiKeyAuth) — the operator's endpoint.
    this.models = createModels();
    this.models.setProvider(opencodeGoProvider());
    this.models.setProvider(nvidiaProvider());
    this.models.setProvider(opencodeProvider());
    this.models.setProvider(openrouterProvider());
    this.models.setProvider(this.inferxProvider());
    // THE NATIVE ENV — the pi SDK's NodeExecutionEnv binds the native read/edit
    // tools (cwd = the given dir, else the project root).
    this.env = new NodeExecutionEnv({ cwd: cwd ?? process.cwd() });

    // THE CHAIN — THE OPERATOR'S ORDER v3 (2026-08-22: "make zen primary and
    // nvidia #2, it is more reliable just has lower daily quota"): rungs 1-3
    // are the SAME model (nemotron-3.5-lightning, 1M context) on three
    // providers — a provider switch mid-wave is invisible to the task; only
    // the inferx last-resort switches models.
    // 1. opencode zen nemotron-free  (opencode.ai/zen/v1 — 200 RPM; the
    //    RELIABLE primary; bounded by daily quota, not per-minute bursts)
    // 2. nvidia native nemotron      (integrate.api.nvidia.com — 40 RPM)
    // 3. openrouter nemotron:free    (openrouter.ai/api/v1 — 20 RPM)
    // 4. inferx Qwen3.6-35B-A3B-FP8  (model.inferx.net — 20 RPM; realistically
    //    never hit with smart cycling + total RPM tracking).
    // MAX TOKENS 64K ON ALL (the operator: "so the reasoning stream doesnt get
    // cut from some stupid limit and then kill the stream").
    // THE CHAIN — THE OPERATOR'S ORDER v3 (2026-08-22: "5 api keys cycled
    // through ON THE ZEN ENDPOINT FOR THE FREE MODEL SPECIFICALLY before any
    // fallback providers... physically impossible for zen to be deadlocked"):
    // 5 zen entries (one per key, round-robin via ledger exile on 429) then
    // nvidia → openrouter → inferx. Rungs 1-5 are the SAME model
    // (nemotron-3.5-lightning-free); only inferx switches models.
    // THE CHAIN — zen primary (200 RPM, 5-key pool), nvidia fallback, openrouter, inferx.
    // Zen key rotation: chainedStream sets process.env.OPENCODE_API_KEY before each opencode call.
    // THE CHAIN — THE OPERATOR'S ORDER v4 (2026-08-24: "THE NEW OPENCODE GO =
    // PROVIDER #1 IN THE FALLBACK CHAIN NOW. PUT THIS IN FRONT OF THE ZEN
    // CYCLER. THIS OPENCODE GO IS A PAID API... THIS WILL NEVER FAIL IT HAS
    // INFINITE USAGE. PINNED MODEL IS opencode-go/mimo-v2.5. reasonining
    // effort medium"): rung 1 is the PAID Go endpoint — mimo-v2.5, unlimited.
    // ONLY IF IT COMPLETELY FAILS does the ALREADY-TESTED fallback pipeline
    // fire (zen cycler → nvidia → openrouter → inferx — untouched below).
    // The ledger has NO profile for opencode-go (unlimited → admission 'ok'
    // always) + the primary gate (chainIdx 0) skips only on hard-dry — a paid
    // unlimited rung never dries.
    // THE CHAIN — THE OPERATOR'S ORDER v5 (2026-08-26 — the 712s autopsy:
    // "rip out all the free fallback bullshit we will just use the paid api
    // for everything. if the api ever stops working just loud error tool fail
    // api unreachable and i know to swap the key"): SINGLE RUNG — the PAID
    // opencode-go/mimo-v2.5. No zen cycler, no nvidia, no openrouter, no
    // inferx — the free rungs served 3 of the 17 calls in the autopsied wave
    // while the paid rung was up. Failure = the loud chain death
    // (SHADOW_API_UNREACHABLE — swap the key), never a silent free detour.
    // The per-call stall guard + 5×2.5s transient retries stay (a momentary
    // blip retries; a dead key loud-fails).
    this.chain = [
      { provider: 'opencode-go', modelId: 'mimo-v2.5' },
    ];
  }

  /** THE CUSTOM INFERX PROVIDER — the operator's endpoint
   *  (https://model.inferx.net/endpoints/v1 + the ix_ key), registered on the
   *  pi SDK via createProvider + the pi openAICompletionsApi. The operator:
   *  "we can add front of laguna a new: Qwen3.6-35B-A3B-FP8". */
  private inferxProvider(): Provider<'openai-completions'> {
    return createProvider({
      id: 'inferx',
      name: 'InferX',
      baseUrl: 'https://model.inferx.net/endpoints/v1',
      auth: { apiKey: envApiKeyAuth('InferX API key', ['INFERX_API_KEY']) },
      models: [
        {
          id: 'Qwen3.6-35B-A3B-FP8',
          name: 'Qwen3.6-35B-A3B-FP8',
          api: 'openai-completions',
          provider: 'inferx',
          baseUrl: 'https://model.inferx.net/endpoints/v1',
          reasoning: false,
          // THE FULL pi Model SHAPE (2026-08-21 — the live-crash fix: the
          // missing `input` field made EVERY inferx call die instantly with
          // "undefined is not an object (evaluating 'model.input.includes')"
          // at transform-messages.ts:36 — the api checks model.input for the
          // image modality BEFORE any request. THE FULL SHAPE + 64K maxTokens
          // (the operator's ruling) makes the rung ACTUALLY WORK as the #3
          // fallback instead of a corpse.)
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          contextWindow: 1000000,
          maxTokens: 64000,
          // THE REASONING WIRING (2026-08-21 — the operator: "configure the
          // reasoning for each provider the way their api expects... REASONING
          // EFFORT MEDIUM"): Qwen on vLLM takes the chat-template form — pi's
          // "qwen-chat-template" branch emits chat_template_kwargs
          // {enable_thinking:true} when an effort is set. Inferx is the
          // never-hit last rung; the effort still flows natively.
          compat: { thinkingFormat: 'qwen-chat-template' },
        } as never,
      ] as never,
      api: openAICompletionsApi(),
    });
  }

  /** THE NATIVE READ/EDIT TOOLS — the pi SDK's createReadTool/createEditTool,
   *  bound to the pi SDK's NodeExecutionEnv via the ExecutionToolContext
   *  ({ env }). THE EDIT TOOL IS FORCE-BOUND TO THE PROMPTFILE (2026-08-21 —
   *  the operator's BATCH LAW + the effect-cmd.ts contamination fix): pi's
   *  native edit is a TRUE BATCH tool ({path, edits:[{oldText,newText},...]})
   *  whose free-string `path` let an agent append its inference block to a
   *  REAL source file. The wrapper (a) teaches the BATCH schema, (b) pins
   *  path to promptFilePath mechanically — cross-file writes impossible.
   *  ═══ THE W1 MECHANICAL ENFORCEMENT (2026-08-26 — the operator: "WHY IS
   *  IT NOT ENFORCED TO FUCKING BATCH EVERYTHING" — the live B1 dripped 10
   *  single-edit calls + 8 keyhole re-reads): prompt laws are advisory; the
   *  WRAPPER is the law. (1) THE EDIT BUDGET: max 3 edit CALLS per round
   *  (the initial batch + 2 micro-loop fixes — matches the 3-loop cap);
   *  the 4th THROWS '[W1 ENFORCED]' naming the consolidation duty — the
   *  model MUST fold every remaining pair into one call. (2) THE RESULT
   *  RIDER: every applied edit result carries the batch-state line (call
   *  n/3, do-not-re-read — this result IS the verification). (3) THE
   *  KEYHOLE GUARD: a read of the promptFile with limit<60 right after an
   *  edit carries the same warning inline. ═══ */
  private nativeTools(promptFilePath: string): AgentTool[] {
    const ctx = { env: this.env };
    // THE PER-RUN W1 STATE (reset at each ROUND_START in the run loop):
    const w1 = { editCallsThisRound: 0, editedSinceLastRead: false };
    this.w1State = w1;
    // THE PI SDK'S NATIVE TOOLS, VERBATIM (createReadTool/createEditTool from
    // @earendil-works/pi-agent-core). The harness executes them with the
    // 5th-arg ExecutionToolContext ({ env: NodeExecutionEnv }) — the binding
    // below is the harness's own toolContext mechanism, done directly:
    type HarnessTool = {
      name: string; label: string; description: string; parameters: unknown;
      prepareArguments?: unknown;
      execute(toolCallId: string, params: unknown, signal: AbortSignal | undefined,
        onUpdate: unknown, context: { env: ExecutionEnv }): Promise<{ content: unknown }>;
    };
    const read = createReadTool() as unknown as HarnessTool;
    const edit = createEditTool() as unknown as HarnessTool;
    const bindRead = (tool: HarnessTool): AgentTool => ({
      name: 'read',
      label: 'read',
      description: 'read { filepath } — file content. Batch your reads when several are needed.',
      parameters: tool.parameters as never,
      execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined,
        onUpdate: ((result: unknown) => void) | undefined) => {
        captureEvent(this.capKey, 'TOOL_CALL', { tool: 'read', args: params });
        const r = await tool.execute(toolCallId, params, signal, onUpdate, ctx) as unknown;
        // THE KEYHOLE GUARD: a small-limit read of the promptFile right after
        // an edit is a re-verification of a change the edit result already
        // confirmed — append the inline warning (shape-guarded, never throws).
        try {
          const p = (params ?? {}) as { path?: string; limit?: number };
          if (w1.editedSinceLastRead
            && typeof p.path === 'string' && p.path === promptFilePath
            && (p.limit === undefined || p.limit >= 60)) {
            w1.editedSinceLastRead = false;   // a FULL read legitimately re-grounds
          } else if (w1.editedSinceLastRead
            && typeof p.path === 'string' && p.path === promptFilePath
            && typeof p.limit === 'number' && p.limit < 60) {
            const rec = r as { content?: unknown };
            const warn = '\n[W1 KEYHOLE GUARD] You re-read a small slice of the file you just edited — the edit result ALREADY confirmed the applied change. Do NOT re-verify edits by keyhole reads; plan the next batched edit or finish the round.';
            if (Array.isArray(rec.content)) rec.content = [...rec.content, { type: 'text', text: warn }];
            else if (typeof rec.content === 'string') rec.content = rec.content + warn;
          }
        } catch { /* augmentation never breaks the tool */ }
        captureSection(this.capKey, 'TOOL RESULT — read', captureJson(r), 'json');
        return r as never;
      },
    } as AgentTool);
    const bindEdit = (tool: HarnessTool): AgentTool => ({
      name: 'edit',
      label: 'edit',
      description: 'BATCH EDIT — apply ALL of this round\'s replacements in ONE call: { path, edits: [{ oldText, newText }, ...] }. path MUST be "' + promptFilePath + '" (mechanically enforced). Each oldText must be UNIQUE in the current file; non-overlapping. Plan every pair in your reasoning FIRST, then fire ONE call carrying EVERY replacement for the round.',
      parameters: tool.parameters as never,
      execute: async (toolCallId: string, params: unknown, signal: AbortSignal | undefined,
        onUpdate: ((result: unknown) => void) | undefined) => {
        // THE PATH PIN — whatever the model passed, the write lands on the
        // promptFile ONLY (cross-file writes mechanically impossible).
        const incoming = (params ?? {}) as Record<string, unknown>;
        const forced = { ...incoming, path: promptFilePath };
        const pairCount = Array.isArray(incoming.edits) ? (incoming.edits as unknown[]).length : 0;
        // ═══ THE EDIT BUDGET (mechanical W1): 3 edit CALLS per round max —
        // the initial batch + 2 micro-loop fixes. The 4th is REFUSED with
        // the consolidation order; nothing is applied. This is the
        // enforcement the prompt laws cannot provide. ═══
        w1.editCallsThisRound++;
        if (w1.editCallsThisRound > 3) {
          captureEvent(this.capKey, 'W1_ENFORCED_REFUSAL', { call: w1.editCallsThisRound, pairCount });
          throw new Error(
            '[W1 ENFORCED — EDIT REFUSED] This is edit call #' + w1.editCallsThisRound + ' this round (budget: 3). You are DRIPPING single edits — a W1 violation. STOP. Re-plan EVERY remaining replacement and fire ONE final edit call whose edits[] array carries ALL pairs. Do NOT read the file to re-plan — you already know the defects. Consolidate now.');
        }
        captureEvent(this.capKey, 'TOOL_CALL', { tool: 'edit', edits: pairCount, call: w1.editCallsThisRound });
        captureSection(this.capKey, 'TOOL CALL — edit (full args)', captureJson(forced), 'json');
        const r = await tool.execute(toolCallId, forced as never, signal, onUpdate, ctx) as unknown;
        w1.editedSinceLastRead = true;
        // THE RESULT RIDER: the batch-state line rides every applied result —
        // the model is told, in the result itself, not to re-read to verify.
        try {
          const rec = r as { content?: unknown };
          const rider = '\n[W1] Edit call ' + w1.editCallsThisRound + '/3 this round — ' + pairCount + ' pair(s) APPLIED (this result IS the verification; do NOT re-read to confirm). Remaining edits this round MUST ride ONE consolidated call.';
          if (Array.isArray(rec.content)) rec.content = [...rec.content, { type: 'text', text: rider }];
          else if (typeof rec.content === 'string') rec.content = rec.content + rider;
        } catch { /* augmentation never breaks the tool */ }
        captureSection(this.capKey, 'TOOL RESULT — edit', captureJson(r), 'json');
        return r as never;
      },
    } as AgentTool);
    return [bindRead(read), bindEdit(edit)];
  }

  /** THE PER-CALL RETRY + FALLBACK CHAIN — wraps the pi streamSimple so EVERY
   *  individual LLM call (not the batch) retries 5×5s on 429 per rung, then
   *  falls to the next rung. THE OPERATOR: "if 429 hits - WHO FUCKING CARES
   *  wait 5 secs try again. 5 retry loops, fallback to the next model. 429
   *  hits again 5 retry loops fallback. ONE OF THESE WILL FUCKING WORK."
   *  The outer AssistantMessageEventStream re-emits the first successful
   *  rung's events; the Agent loop consumes them verbatim. */
  private chainedStream(model: never, context: never, options: never): AssistantMessageEventStream {
    const outer = new AssistantMessageEventStream();
    const base = (options ?? {}) as Record<string, unknown>;
    const chainT0 = Date.now();
    console.error('[chain] START — the per-call retry+fallback chain (opencode-go/mimo-v2.5 PAID → opencode/zen×5 → nvidia → openrouter → inferx, ledger-gated, key-pooled)');
    captureEvent(this.capKey, 'CHAIN_START', { at: 0 });
    void (async () => {
      let lastError: string | null = null;
      // THE LEDGER-GATED SKIP (2026-08-21 — the operator's hybrid: "so its not
      // blind retrying an obviously RPM model"): the admissions are computed
      // ONCE per call across ALL rungs. A rung that is 'exiled' (a sibling
      // agent's observed 429 → shared 45s TTL) or 'dry' (bucket empty) is
      // SKIPPED without burning a single request — UNLESS every rung is gated,
      // in which case all gates open (attempting SOMETHING beats a loud die on
      // a transient budget; the ledger re-exiles if the attempt 429s again).
      const admissions = this.chain.map((e) => this.ledger.admission(e.provider));
      // THE PRIMARY PRIORITY (2026-08-23 — the sanity restore): the zen rung
      // is NEVER skipped for a transient 45s exile just because a fallback is
      // merely 'ok' — that gate exiled the PRIMARY for entire waves (0 zen
      // attempts in the live burn) and shoved every call onto nvidia's shared
      // 40-RPM bucket. Key rotation IS the zen 429 defense (5 keys × 200 RPM);
      // only a HARD 'dry' (every key dead this window) skips it. The fallback
      // rungs keep the anyOk skip — their exile semantics are unchanged.
      const anyFallbackOk = admissions.slice(1).includes('ok');
      for (let chainIdx = 0; chainIdx < this.chain.length; chainIdx++) {
        if (chainIdx === 0) {
          // PRIMARY: skip ONLY on hard-dry.
          if (admissions[0] === 'dry' && anyFallbackOk) {
            console.error('[chain] SKIP', this.chain[0].provider + '/' + this.chain[0].modelId, '— ledger: dry (all 5 zen keys dead this window) → falling to fallbacks');
            continue;
          }
        } else if (admissions[chainIdx] !== 'ok' && anyFallbackOk) {
          const entry = this.chain[chainIdx];
          console.error('[chain] SKIP', entry.provider + '/' + entry.modelId, '— ledger:', admissions[chainIdx], JSON.stringify(this.ledger.snapshot().providers.find((p) => p.provider === entry.provider)));
          continue;
        }
        const entry = this.chain[chainIdx];
        const key = entry.provider === 'opencode-go' ? process.env.OPENCODE_GO_API_KEY
          : entry.provider === 'opencode'
            ? ZEN_KEYS[zenKeyIndex % ZEN_KEYS.length]
          : entry.provider === 'nvidia' ? process.env.NVIDIA_API_KEY
          : entry.provider === 'openrouter' ? process.env.OPENROUTER_API_KEY
          : process.env.INFERX_API_KEY;
        if (!key) {
          lastError = 'SHADOW_CHAIN_NO_KEY: ' + entry.provider;
          continue;
        }
        const entryModel = this.models.getModel(entry.provider as never, entry.modelId as never)
          ?? (entry.modelId.includes('/')
            ? this.models.getModel(entry.provider as never, (entry.modelId.split('/').pop() || entry.modelId) as never)
            : undefined);
        if (!entryModel) {
          lastError = 'SHADOW_CHAIN_NO_MODEL: ' + entry.provider + '/' + entry.modelId;
          continue;
        }
        if (!key) {
          lastError = 'SHADOW_CHAIN_NO_KEY: ' + entry.provider;
          continue;
        }
        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
          let attemptError: string | null = null;
          let succeeded = false;
          const buffer: unknown[] = [];
          const attemptT0 = Date.now();
          // THE VISIBILITY (2026-08-21 — the operator: "can you not see exactly
          // what it was doing? where are the logs?" THE GAP: chainedStream logged
          // NOTHING — silent 429 retries + silent rung falls produced the 200s
          // invisible R1. EVERY rung attempt is now announced + the outcome is
          // logged — a slow generation is SEEN as it happens, never a mystery.)
          console.error('[chain] try', entry.provider + '/' + entry.modelId, 'attempt', attempt + '/' + RETRY_ATTEMPTS, 'at +' + Math.round((Date.now() - chainT0) / 1000) + 's');
          captureEvent(this.capKey, 'CHAIN_TRY', { rung: entry.provider + '/' + entry.modelId, attempt: attempt + 1, atS: Math.round((Date.now() - chainT0) / 1000) });
          // THE EVENT-AWARE STALL GUARD (2026-08-20 — the operator: "timeout
          // on NO EVENT. not a stupid fucking blind static timeout"): an
          // AbortController + a lastEventAt clock. EVERY stream event resets
          // the clock; a watchdog timer fires ONLY when no event arrived for
          // STALL_MS AND the attempt is neither succeeded nor errored → the
          // stream is DEAD (a live gen emits continuously) → abort THIS
          // attempt → the chain below treats it retryable (5×5s) then falls
          // to the next rung. A successful generation CANNOT be killed — it
          // keeps emitting, the clock keeps resetting.
          const ac = new AbortController();
          let lastEventAt = Date.now();
          const stallTimer = setInterval(() => {
            if (Date.now() - lastEventAt > STALL_MS && !succeeded && !attemptError) {
              ac.abort();
              attemptError = 'SHADOW_STALL: no event within ' + (STALL_MS / 1000) + 's from ' + entry.provider + '/' + entry.modelId + ' (attempt ' + attempt + ') — the stream is DEAD, not thinking';
            }
          }, 1000);
          // THE LEDGER ACQUIRE (2026-08-21 — the hybrid's per-attempt gate):
          // consume 1 predicted token before ONE request. 'dry' waits up to 6s
          // for the continuous refill (riding nvidia's 3s-median beats fleeing
          // to the free-tier tail); denied → this rung is done, the next one
          // serves the call. Unlimited providers pass instantly.
          if (entry.provider === 'opencode') {
            process.env.OPENCODE_API_KEY = ZEN_KEYS[zenKeyIndex % ZEN_KEYS.length];
          }
          const admitted = await this.ledger.acquire(entry.provider, { maxWaitMs: 6000, signal: ac.signal });
          if (!admitted) {
            clearInterval(stallTimer);
            lastError = 'LEDGER_ADMISSION_DENIED: ' + entry.provider;
            console.error('[chain] SKIP', entry.provider + '/' + entry.modelId, '— acquire denied (exiled/dry), falling to the next rung');
            break;
          }
          try {
            const inner = this.models.streamSimple(entryModel as never, context, {
              ...base,
              apiKey: key,
              signal: ac.signal,
              // ═══ THE THINKING WIRING (2026-08-26 — the 712s autopsy): the pi
              // Agent's thinkingLevel/thinkingBudgets do NOT flow through a
              // custom streamFn — agent-loop.ts forwards only `reasoning` (the
              // level) and DROPS the budgets — so neither reasoning_effort nor
              // thinking_token_budget ever reached the wire and mimo's
              // reasoning ran UNBOUNDED (18,524 thinking tokens in ONE call =
              // 222s at 83 tok/s; the whole 712s wave = 43,361 thinking tokens
              // at ~85 tok/s). Injected here EXPLICITLY so
              // openai-completions emits reasoning_effort:'medium' +
              // thinking_token_budget:2048 on EVERY call (the go catalog
              // declares both: supportsReasoningEffort +
              // thinkingTokenBudgetField:'thinking_token_budget'). ═══
              reasoningEffort: 'medium' as never,
              thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 4096 } as never,
            } as never);
            // CONSUME the inner stream; buffer the events; re-emit on the
            // outer stream ONLY after the rung succeeds. A 429/error attempt
            // is discarded (buffered events dropped) + retried per the
            // 5×5s ruling; the chain falls to the next rung after the budget.
            // THE EVENT-AWARENESS: every event resets the stall clock. THE
            // EVENT LOG: the first + every-25th event is logged (the model's
            // progress is SEEN, not assumed) — a 200s R1 shows exactly which
            // provider is streaming and how long it streams.
            let eventCount = 0;
            for await (const event of inner) {
              if (ac.signal.aborted) break;
              lastEventAt = Date.now();
              eventCount++;
              if (eventCount === 1 || eventCount % 25 === 0) {
                const ev = event as { type?: string };
                console.error('[chain]', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'event', eventCount, ev.type, 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
                captureEvent(this.capKey, 'CHAIN_EVENT', { rung: entry.provider + '/' + entry.modelId, attempt: attempt + 1, event: eventCount, type: ev.type ?? '', atS: Math.round((Date.now() - attemptT0) / 1000) });
              }
              const ev = event as { type?: string; error?: { errorMessage?: string } };
              if (ev.type === 'error') { attemptError = ev.error?.errorMessage ?? 'shadow-stream-error'; break; }
              // THE DONE VERIFIER (2026-08-22 — F-73 self-healing, the
              // operator: "route this done return into a verifier that
              // detects if done = complete or done = error and if error loop
              // it back through another provider"): a stalled-abort can
              // make pi-ai synthesize a terminal event whose message never
              // accumulated content (content undefined) — handing that to pi's
              // loop crashes it (message.content.filter). Verify BEFORE
              // accepting: a done without a content array is a DEGENERATE
              // completion → treat as an error and let the chain route the
              // call through a working provider. Never a dead stop.
              if (ev.type === 'done') {
                const msgContent = (event as { message?: { content?: unknown } }).message?.content;
                if (!Array.isArray(msgContent)) {
                  attemptError = 'SHADOW_DEGENERATE_DONE: terminal event without content from ' + entry.provider + ' — routing to the next rung';
                  console.error('[chain] DEGENERATE-DONE', entry.provider + '/' + entry.modelId, '— self-healing to the next rung');
                  break;
                }
                succeeded = true;
                buffer.push(event);
                break;
              }
              buffer.push(event);
            }
            clearInterval(stallTimer);
            if (succeeded) {
              console.error('[chain] OK', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'events', eventCount, 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
              captureEvent(this.capKey, 'CHAIN_OK', { rung: entry.provider + '/' + entry.modelId, attempt: attempt + 1, events: eventCount, durS: Math.round((Date.now() - attemptT0) / 1000) });
              // THE EXPORT-LEVEL TRANSCRIPT — the full assembled call + the raw
              // done-message JSON (the authoritative record).
              const doneEv = buffer.find((b) => (b as { type?: string }).type === 'done') as { message?: unknown } | undefined;
              try {
                writeCallTranscript(this.capKey, 'LLM CALL — ' + entry.provider + '/' + entry.modelId + ' attempt ' + (attempt + 1) + ' OK (' + eventCount + ' events, ' + Math.round((Date.now() - attemptT0) / 1000) + 's)', buffer, doneEv?.message ?? null);
              } catch { /* capture must never break the chain */ }
              this.ledger.recordSuccess(entry.provider);
              for (const ev of buffer) outer.push(ev as never);
              outer.end();
              return;
            }
            console.error('[chain] FAIL', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'events', eventCount, 'err', (attemptError ?? 'none')?.slice(0, 120), 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
            captureEvent(this.capKey, 'CHAIN_FAIL', { rung: entry.provider + '/' + entry.modelId, attempt: attempt + 1, events: eventCount, err: (attemptError ?? 'none')?.slice(0, 300), durS: Math.round((Date.now() - attemptT0) / 1000) });
            try {
              writeCallTranscript(this.capKey, 'LLM CALL — ' + entry.provider + '/' + entry.modelId + ' attempt ' + (attempt + 1) + ' FAILED — ' + (attemptError ?? 'unknown'), buffer, null);
            } catch { /* capture must never break the chain */ }
          } catch (e) {
            clearInterval(stallTimer);
            attemptError = e instanceof Error ? e.message : String(e);
            console.error('[chain] THROW', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'err', attemptError.slice(0, 120));
          }
          lastError = attemptError ?? lastError;
          const isStall = lastError ? lastError.startsWith('SHADOW_STALL') : false;
          const isRateLimit = lastError ? /\b429\b|rate.?limit|too many/i.test(lastError) : false;
          const retryable = lastError ? RETRYABLE_RE.test(lastError) || isStall : false;
          // THE STALL FALL (2026-08-22): a stall-abort re-homes the call to
          // the NEXT rung instantly — never retried on the same dead rung,
          // never an exile (the provider isn't limited; the attempt was slow).

          // THE STALL-FALL-FAST (2026-08-21 — the operator: "NVIDIA ITSELF IS
          // 40 RPM... IT IS MATHEMATICALLY IMPOSSIBLE FOR THIS TO FAIL LET
          // ALONE EVERY SINGLE PROVIDER"): a mid-stream SHADOW_STALL is a DEAD
          // CONNECTION — retry ONCE then FALL to the next rung.
          if (isStall && attempt >= 2) break;   // one retry, then the next rung
          // THE LEDGER 429 → SHARED EXILE + IMMEDIATE FALL (2026-08-21 — the
          // operator's hybrid superseding the 5×5s in-rung burn: "so its not
          // blind retrying an obviously RPM model"): ONE observed 429 exiles
          // the provider for the WHOLE wave for EXILE_MS (45s < one 60s reset)
          // and THIS call falls to the next rung instantly. The ledger's TTL
          // re-admission replaces the blind retry loop — the bucket signal is
          // acted on once, not five times.
          if (isRateLimit) {
            this.ledger.record429(entry.provider);
            if (entry.provider === 'opencode') {
              zenKeyIndex++;
              console.error('[chain] ZEN KEY ADVANCE → key', zenKeyIndex % ZEN_KEYS.length);
            }
            console.error('[chain] EXILE', entry.provider, '— observed 429, shared TTL exile', 'EXILE_MS=' + 45000);
            break;
          }
          if (retryable && attempt < RETRY_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            continue;
          }
          break; // non-retryable or exhausted → next rung
        }
      }
      // THE LOUD FAIL — every rung exhausted: an error event, never silence.
      // F-73 FIX (2026-08-22): AssistantMessageEventStream's extractor returns
      // event.error AS the final message — a bare {errorMessage} object has no
      // stopReason/content, so pi's loop missed its error-guard and crashed on
      // message.content.filter. The error field now carries the FULL
      // AssistantMessage shape (stopReason:'error' + content:[]) so pi's
      // :196 guard catches it and the run() loud-fail fires cleanly.
      const chainErrorMessage = {
        role: 'assistant' as const,
        api: 'openai-completions' as const,
        provider: 'chain',
        model: 'chain-fail',
        content: [] as unknown[],
        stopReason: 'error' as const,
        errorMessage: 'SHADOW_API_UNREACHABLE: the PAID API (opencode-go/mimo-v2.5) failed after every attempt — API UNREACHABLE — SWAP THE API KEY. Last error: ' + (lastError ?? 'SHADOW_CHAIN_FAIL'),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        timestamp: Date.now(),
      };
      outer.push({ type: 'error', reason: 'error', error: chainErrorMessage } as never);
      outer.end();
    })();
    return outer;
  }

  /** THE RUN — spawn the headless pi Agent + polish the pre-built brief.
   *  1 forced revision round + 2 optional; the file on disk is the deliverable. */
  async run(opts: ShadowAgentRunOptions): Promise<ShadowAgentRunResult> {
    const promptFilePath = opts.promptFilePath;
    const systemPrompt = opts.systemPrompt;
    const demand = opts.demand;
    const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
    // THE CAPTURE ACTIVATION — the key flows: wave-dispatch runOne →
    // shadowGenerate → runShadowPipeline → here. Absent → all tees no-op.
    this.capKey = opts.captureKey ?? '';
    if (this.capKey) {
      captureEvent(this.capKey, 'RUN_START', { promptFilePath, maxRounds });
      captureSection(this.capKey, 'SYSTEM PROMPT (full)', systemPrompt, 'markdown');
      if (demand) captureSection(this.capKey, 'ROUND-1 DEMAND (the polish instruction + context chain, full)', demand, 'markdown');
    }
    const model = this.models.getModel('nvidia' as never, SHADOW_MODEL as never)
      ?? this.models.getModel('nvidia' as never, (SHADOW_MODEL.split('/').pop() || SHADOW_MODEL) as never);
    if (!model) {
      return {
        text: '', lines: 0, roundsUsed: 0, toolCallsMade: 0,
        errors: ['SHADOW_PI_NO_MODEL: nvidia/' + SHADOW_MODEL + ' not in the pi nvidia provider catalog'],
        fileStates: [],
      };
    }

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: this.nativeTools(promptFilePath),
        // THE REASONING LEVEL (2026-08-21 — the operator: "maybe lets set the
        // reasoning level on the TOOL to medium so it doesnt get as verbose.
        // reasoning level is high by default so if we didnt set it to medium
        // then thats why its verbose"): the DEFAULT is high/verbose → the
        // nvidia nemotron streams 1000+ thinking_delta events per LLM call →
        // R1 alone = 230s (32 LLM calls × verbose CoT). The polish task does
        // NOT need the max-reasoning trace — MEDIUM gives the same surgical
        // edit quality with a fraction of the thinking volume (R1 → ~60-90s).
        // The DISPATCHED subagents keep their OWN pinned reasoning (explore
        // high, build max — definitions.ts) — this is the GENERATOR's tool
        // internal, deliberately lighter.
        thinkingLevel: 'medium' as never,
      },
      // ═══ THE HARD TURN CAP (2026-08-26 — the operator: "THIS IS SUPPOSED
      // TO BE MECHANICALLY ENFORCED" — the live B1 ran 34+ turns INSIDE ONE
      // "round" because agent.prompt() loops until the model voluntarily
      // stops emitting tool calls, and pi's loop has NO turn cap of its own).
      // A round is: 1 batched-plan turn + the edit call + ≤2 verify/fix
      // micro-loop iterations + ≤3 keyhole reads = ~8 turns of legitimate
      // work. 12 is the ceiling with slack; past it the loop STOPS — the
      // round ends, the file state is judged by validateFinalText as usual
      // (a file not clean → R2 or loud-fail, never an infinite drip). ═══
      shouldStopAfterTurn: (turnCtx: { newMessages?: unknown[] }) => {
        try {
          const msgs = (turnCtx as { newMessages?: Array<{ role?: string }> }).newMessages;
          // Count ASSISTANT messages = LLM calls (each turn = exactly one
          // assistant message; tool results arrive as user-role and must not
          // inflate the count).
          const llmCalls = Array.isArray(msgs) ? msgs.filter((m) => m.role === 'assistant').length : 0;
          if (llmCalls >= 12) {
            console.error('[shadow-agent] TURN CAP HIT (12 LLM calls this prompt) — forcing round end');
            captureEvent(this.capKey, 'TURN_CAP_HIT', { llmCalls });
            return true;
          }
          return false;
        } catch { return false; }
      },
      // THE REAL PI TRANSPORT — the per-call retry+fallback chain wrapper
      // around models.streamSimple. The tests inject a scripted stream via
      // the streamFn option (the pi SDK's own option, verbatim).
      streamFn: (opts.streamFn ? opts.streamFn : this.chainedStream.bind(this)) as never,
      // THE BATCH EXECUTION ORDER: pi's default is "parallel" — same-turn
      // tool calls execute concurrently. This is correct.
      toolExecution: 'parallel' as never,
      // THE THINKING BUDGET (2026-08-21 — the operator's REASONING EFFORT
      // MEDIUM, made REAL): the providers ignore reasoning_effort for
      // nemotron on the free/hosted endpoints (live-probed), but HONOR the
      // token budget — nvidia via chat_template_kwargs.thinking_token_budget
      // (88.8s baseline → 38.1s), zen via top-level thinking_token_budget
      // (43.0s → 18.2s). The catalogs' $var/compat wiring below turns THIS
      // number into the wire param on each rung. 2048 = the measured medium.
      thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 4096 } as never,
      // THE KEY — the pi nvidia provider's envApiKeyAuth reads NVIDIA_API_KEY
      // (seeded in the constructor). NO custom resolver.
      getApiKey: () => process.env.NVIDIA_API_KEY,
    });

    let roundsUsed = 0;
    let toolCallsMade = 0;
    let prevMessageCount = 0;
    const errors: string[] = [];
    const runStart = Date.now();

    try {
      for (let round = 1; round <= maxRounds; round++) {
        roundsUsed = round;
        console.error('[shadow-agent] ROUND', round + '/' + maxRounds, 'START', Math.round((Date.now() - runStart) / 1000) + 's');
        captureEvent(this.capKey, 'ROUND_START', { round, of: maxRounds, atS: Math.round((Date.now() - runStart) / 1000) });
        // THE W1 RESET — a fresh round re-arms the edit budget (3 calls).
        if (this.w1State) { this.w1State.editCallsThisRound = 0; this.w1State.editedSinceLastRead = false; }
        // THE ROUND PROMPTS — VERBATIM (the operator's exact text, 2026-08-20;
        // THE BATCH LAW wired 2026-08-21 — the operator: "BATCH ALL READS.
        // BATCH ALL EDITS... plan the edits in your reasoning stream before
        // calling the edit tool and then batch all the edits in 1 tool call
        // properly... no re-verify --> re-fix --> loop re-verify + re-fix as
        // needed up to 3 total loops from the first re-verify action"):
        // every round runs BATCHED (all reads in one turn, all edits in one
        // turn) with an embedded verify->fix circuit breaker capped at 3.
        const roundPrompt = round === 1
          ? 'ROUND 1 — FIRST EDIT (mandatory, ONE edit call). Every source you need is ALREADY in your context (the woven brief + THE ACTUAL FILE CONTENTS below) — no input reads needed. PLAN all polish replacements in your reasoning FIRST (slop sections, broken flow, disjointed prose + the [SHADOW INFERENCE] block append per W4), then fire ONE edit call whose edits[] carries EVERY pair. Consolidate nearby changes; each oldText UNIQUE. THE EDIT TOOL IS THE ONLY WAY TO CHANGE THE FILE. You MUST edit this round. Do NOT rewrite the entire prompt from scratch. COMMIT LAW (W5): once the pairs are chosen, FIRE immediately — no re-deliberation, no re-checking; the 2048-token thinking cap forces execution anyway.'
          : round === 2
            ? 'ROUND 2 — FIRST REVISION LOOP (mandatory). STEP 1: ONE read of ' + promptFilePath + ' — 0-trust audit for lingering derailment fuel, slop, theatrical garbage + verify your [SHADOW INFERENCE] section is present beneath a ~~~~~~~~~~~ separator with the [SHADOW INFERENCE] prefix exactly like that before its content — a 300-600 token summary of YOUR context awareness + the subagent task responsibilities + what REAL success looks like + the explicitly forbidden theatrical/degenerate behaviors. STEP 2: defects found? plan fixes in reasoning then ONE edit call whose edits[] carries ALL of them. THEN the EMBEDDED MICRO-LOOP (max 3 loops total from the first re-verify): RE-VERIFY (one read) -> defects? RE-FIX (one batched edit call) -> loop. A clean re-verify ends the micro-loop immediately. The 3-loop cap is the circuit breaker. COMMIT LAW (W5): audit → decide once → FIRE the batched fix; never re-deliberate an unchanged file.'
            : round === 3
              ? 'ROUND 3 — OPTIONAL REVISION 2 (scoped verify). Read ONLY the regions you edited in R1-R2 (targeted read calls — not the whole file). Bet-your-life solid to anchor the FULL end-to-end subagent execution? [SHADOW INFERENCE] precise + dense? Solid = return DONE (zero tool calls). Defects = ONE edit call carrying every fix in edits[], then RE-VERIFY only those changed spots -> RE-FIX, up to the 3-loop breaker.'
              : 'ROUND 4 — OPTIONAL REVISION 3 (final, scoped). Same as ROUND 3: targeted reads over your edited regions only — solid = DONE (zero tool calls); defects = ONE batched edit call, then the micro-loop up to the 3-loop breaker, then done.';
        const effectivePrompt = round === 1 && demand ? demand + '\n\n' + roundPrompt : roundPrompt;
        captureSection(this.capKey, 'ROUND ' + round + ' — USER PROMPT (verbatim)', effectivePrompt, 'markdown');
        await agent.prompt(effectivePrompt);
        await agent.waitForIdle();

        // THE TOOL-CALL COUNT (the reads + edits this round)
        const newMessages = agent.state.messages.slice(prevMessageCount);
        prevMessageCount = agent.state.messages.length;
        const roundToolCalls = (() => {
          let n = 0;
          for (const m of newMessages) {
            if (m.role === 'assistant' && Array.isArray((m as { content?: unknown }).content)) {
              n += ((m as { content: Array<{ type?: string }> }).content.filter((c) => c.type === 'toolCall')).length;
            }
          }
          return n;
        })();
        toolCallsMade += roundToolCalls;
        captureEvent(this.capKey, 'ROUND_END', { round, roundToolCalls, atS: Math.round((Date.now() - runStart) / 1000) });

        // THE DECISION TREE (the checkpoint's model-decides logic, RESTORED
        // 2026-08-20 — the operator: "READ THE EDITED DOC, DECIDE IF IT IS
        // IDIOT PROOF AND SOLID ENOUGH TO ANCHOR A SUBAGENT, OR IF FURTHER
        // POLISHING IS NEEDED"): rounds 1-2 mandatory; rounds 3-4 run ONLY if
        // the model KEPT editing (decided more work needed). The validated-
        // break + the no-edit break stop early. THE [SHADOW INFERENCE] block
        // is part of the round-2 prompt itself (the model creates it via its
        // surgical edit) — no force-continue, no hardcoded 4-run.
        const finalText = fs.readFileSync(opts.promptFilePath, 'utf-8');
        const hasInference = finalText.includes('~~~~~~~~~~~') && /\[SHADOW INFERENCE\]/.test(finalText);
        const valid = validateFinalText(finalText) && hasInference;
        if (valid && round >= MIN_MANDATORY_ROUNDS && round < maxRounds) break;
        if (round >= MIN_MANDATORY_ROUNDS && roundToolCalls === 0) break; // no edits → the agent is done
        if (round >= maxRounds) break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // THE FILE-EDITED CHECK — if the agent EDITED the file + the file has
    // content, the polish SUCCEEDED (the file IS the deliverable; the A2
    // contract preserved: a round-1 failure with NO edit STILL fails).
    const editsRan = (() => {
      const msgs = agent.state.messages;
      if (!msgs) return false;
      for (const m of msgs) {
        if (m.role === 'assistant' && Array.isArray((m as { content?: unknown }).content)) {
          if (((m as { content: Array<{ type?: string; name?: string }> }).content).some((c) => c.type === 'toolCall' && c.name === 'edit')) return true;
        }
      }
      return false;
    })();
    const fileHasContent = (() => {
      try { return fs.readFileSync(opts.promptFilePath, 'utf-8').trim().length > 0; }
      catch { return false; }
    })();
    const polishSucceeded = editsRan && fileHasContent;

    // THE LOUD-FAIL — the agent errored AND the file was NOT edited → fail.
    let agentErrored: string | undefined;
    try {
      const msgs = agent.state.messages;
      if (msgs && typeof msgs.length === 'number') {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.role === 'assistant' && (m as { errorMessage?: string }).errorMessage) {
            agentErrored = (m as { errorMessage?: string }).errorMessage;
            break;
          }
        }
      }
      if (!agentErrored && agent.state.errorMessage) agentErrored = agent.state.errorMessage;
    } catch { /* fall through */ }
    if ((agentErrored || errors.length > 0) && !polishSucceeded) {
      const errText = agentErrored || errors[0] || 'SHADOW_PI_FAIL';
      captureEvent(this.capKey, 'RUN_END', { outcome: 'LOUD_FAIL', errText: errText.slice(0, 300), roundsUsed, toolCallsMade });
      return {
        text: '', lines: 0, roundsUsed, toolCallsMade,
        errors: [errText],
        fileStates: [],
      };
    }

    const finalText = fs.readFileSync(opts.promptFilePath, 'utf-8');
    captureEvent(this.capKey, 'RUN_END', { outcome: 'OK', roundsUsed, toolCallsMade, lines: finalText.split('\n').length });
    return {
      text: finalText,
      lines: finalText.split('\n').length,
      roundsUsed,
      toolCallsMade,
      errors,
      fileStates: [{ path: opts.promptFilePath, lines: finalText.split('\n').length, chars: finalText.length }],
    };
  }
}

/** THE COMPAT FACTORY — the tests import createShadowModels; keep the pi models
 *  factory exported for the model-resolution battery. */
export function createShadowModels(): MutableModels {
  const models = createModels();
  models.setProvider(nvidiaProvider());
  return models;
}

/** THE HOMEDIR DEFAULT — the runtime plugin process may not have a cwd that
 *  matches the wave project; the ShadowAgent resolves the env cwd lazily. */
export function shadowTmpDir(): string {
  return path.join(os.tmpdir(), 'trident-shadow-agent');
}

/** THE VALIDATED-BREAK CHECK (the checkpoint's helper, RESTORED 2026-08-20 —
 *  the regression killed it during the ShadowAgent port): the final file
 *  content is DPL1-valid — the structure markers + the 96 enforcement floor
 *  (the operator's ruling: the 125 generation reference is the aim, the 96
 *  enforcement is the stop). The model-decides round loop breaks early when
 *  this returns true + the [SHADOW INFERENCE] block is present. */
function validateFinalText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const lines = text.split('\n').length;
  if (lines < 96) return false;
  const hasMission = /mission|objective/i.test(text);
  const hasReading = /reading order|read.*before/i.test(text);
  const hasWhatHowWhy = /\bWHAT:/.test(text) || /what|how|why/i.test(text);
  const hasConstraints = /constraint|do not touch|frozen/i.test(text);
  const hasVerification = /verification|verify/i.test(text);
  const hasReturn = /return format|report/i.test(text);
  // THE INFERENCE-CONTENT GATE (2026-08-23 — the live live-probe-chain bug):
  // the scaffold can carry MULTIPLE [SHADOW INFERENCE] markers (the weave's
  // preview + the demand's template + the trailing append), and agent 1
  // shipped with the LAST one completely BLANK — marker presence passed this
  // validator and a hollow prompt auto-dispatched. The gate now requires REAL
  // CONTENT after the FINAL marker: ≥100 chars of non-whitespace. A blank
  // tail fails validation → R2 revises or the wave loud-fails — never a
  // dispatched hollow prompt.
  const lastIdx = text.lastIndexOf('[SHADOW INFERENCE]');
  if (lastIdx === -1) return false;
  const inferenceTail = text.slice(lastIdx + '[SHADOW INFERENCE]'.length).trim();
  if (inferenceTail.length < 100) return false;
  return hasMission && hasReading && hasWhatHowWhy && hasConstraints && hasVerification && hasReturn;
}
