// src/tools/wave-dispatch.ts — THE EXECUTE (Part 14) + THE BLOCK + THE PROMPT-FILE
// LOADER (Part 3.4 + Part 24). THE FORCED PIPELINE: the agents array → the shadow
// pipeline → the tmp files → the BATCH FORM (the generator-only baseline — the
// tool NEVER spawns: the orchestrator dispatches the returned batch of task calls
// via the batch tool, the runtime's canonical subtask path). The orchestrator's
// hands NEVER touch the prompt text (AP-1 — the batch entries carry the generated
// prompts verbatim; the WaveAgentSpec has no prompt field).

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
// @ts-ignore — bun:sqlite ships no type package under tsc (the bun runtime provides it; the agent-state's shadow interface is the typing boundary — the same convention as the wave-1 migration)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { tridentLog } from '../utils.js';
import { runShadowPipeline } from './shadow/shadow-runner.ts';
import { validateAgentSpec, type AgentSpec } from './trident-task-preflight.ts';
import { validateTaskPromptLines } from './trident-preflight.ts';
import { WaveTracker } from './wave-tracker.ts';
import { getOpencodeClient } from './trident-tools.ts';
import {
  TRIDENT_TMP_DIR, resolveTmpDir,
  type WaveManifest, type WaveDispatchResult,
} from './wave-constants.ts';
import { baselineEtaMs } from './wave-eta.ts';

// ═══ THE BLOCK (Part 3.4 — the castration's simplified message) ═══

export const TASK_BLOCK_MESSAGE =
  '[TRIDENT TOOL BLOCK] use trident-wave-manager for any and all subagent dispatches';

// THE WAVE CAP (Part 31.2 Q5 — the schema's max: 25 agents per wave):
export const MAX_AGENTS_PER_WAVE = 25;

/** THE BLOCK ASSESSOR — a task call with a hand-written prompt (a non-empty
 *  string) returns the block message; the promptFile form passes (the loader
 *  channel); an empty task form passes to the existing gates. THE EXACT message
 *  the hooks throw + the battery asserts. */
export function assessTaskBlock(args: Record<string, unknown>): string | null {
  if (!args || typeof args !== 'object') return null;
  if (typeof args.promptFile === 'string' && args.promptFile.trim().length > 0) {
    return null;                          // the promptFile form — the loader's channel
  }
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  const text = typeof args.text === 'string' ? args.text : '';
  if (prompt.trim().length > 0 || text.trim().length > 0) {
    return TASK_BLOCK_MESSAGE;
  }
  return null;
}

// THE TMP-FOLDER CONFINEMENT (Part 19's adversarial: the promptFile pointing
// outside the tmp folder is REFUSED — a file-loaded prompt must come from the
// closed loop, never an arbitrary path):
export function isInsideTmpDir(filePath: string, tmpDir = TRIDENT_TMP_DIR): boolean {
  const resolved = path.resolve(filePath);
  const root = path.resolve(tmpDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** THE PROMPT-FILE LOADER (Part 24 — the fallback channel): loads + DPL1-
 *  validates the loaded content before the injection. Refuses paths outside the
 *  tmp folder. Returns the content or throws the named remedy. */
export function loadPromptFileForDispatch(
  filePath: string,
  tmpDir = TRIDENT_TMP_DIR,
): string {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('[TRIDENT PROMPT FILE] promptFile is required — pass the path of a prompt file inside ' + tmpDir);
  }
  if (!isInsideTmpDir(filePath, tmpDir)) {
    throw new Error('[TRIDENT PROMPT FILE] the promptFile must live inside ' + tmpDir + ' — a path outside the closed loop is refused: ' + path.resolve(filePath));
  }
  let content: string;
  try {
    content = fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch (fErr) {
    throw new Error('[TRIDENT PROMPT FILE] unreadable promptFile ' + filePath + ': ' + (fErr instanceof Error ? fErr.message : String(fErr)));
  }
  if (!content || content.trim().length === 0) {
    throw new Error('[TRIDENT PROMPT FILE] the promptFile ' + filePath + ' is empty — the loaded content must pass the DPL1 checks before any injection');
  }
  const v = validateTaskPromptLines(content);
  if (!v.passed) {
    throw new Error('[TRIDENT PROMPT FILE] the loaded prompt fails the DPL1 checks: ' + v.lines.join(' | ') + ' — the promptFile form carries the SAME structure bar as the generated prompts');
  }
  return content;
}

// ═══ THE SPAWN CONSTRUCTION (Part 3.2 — the pure shape, testable in-process) ═══

export function resolveSubagentType(template: string): 'trident_explore' | 'trident_build' {
  return (template || 'E2').toUpperCase().startsWith('B') ? 'trident_build' : 'trident_explore';
}

export interface SpawnCreateBody {
  parentID?: string;
  title: string;
}

export interface SubtaskPartShape {
  type: 'subtask';
  prompt: string;
  description: string;
  agent: string;
}

export interface SpawnCall {
  name: string;
  type: 'trident_explore' | 'trident_build';
  createBody: SpawnCreateBody;
  promptBody: { agent: string; parts: SubtaskPartShape[] };
}

/** THE SPAWN-CALL CONSTRUCTION (Part 3.2) — the create (parentID) + the
 *  promptAsync (the subtask part). The prompt comes from the FILE's content
 *  (never the args). The parentID is omitted when the main session ID is
 *  unavailable (the rootless fallback). */
export function buildSpawnCall(
  spec: { name: string; template: string },
  mainSessionId: string | null,
  promptText: string,
): SpawnCall {
  const type = resolveSubagentType(spec.template);
  const createBody: SpawnCreateBody = mainSessionId
    ? { parentID: mainSessionId, title: spec.name }
    : { title: spec.name };
  const part: SubtaskPartShape = {
    type: 'subtask',
    prompt: promptText,                   // THE FILE'S FULL CONTENT — verbatim
    description: spec.name,
    agent: type,
  };
  return { name: spec.name, type, createBody, promptBody: { agent: type, parts: [part] } };
}

// THE SPAWN CLIENT SURFACE (the live client's session.create + promptAsync):
export interface WaveDispatchClient {
  session: {
    create(opts: { body: SpawnCreateBody }): Promise<{ data: { id: string; parentID?: string } }>;
    promptAsync(opts: { path: { id: string }; body: SpawnCall['promptBody'] }): Promise<unknown>;
  };
}

export interface DispatchedAgent {
  name: string;
  sessionId: string;
  type: 'trident_explore' | 'trident_build';
  // 'ready' = the generator produced the prompt (NOTHING spawned — the
  // generator-only baseline); the orchestrator's batch dispatch flips it to
  // 'running' when the child session exists.
  status: 'running' | 'ready';
}

// THE GENERATOR SURFACE (the shadow pipeline's prompt production — injectable
// for the battery; production = runShadowPipeline):
export interface PromptGeneratorResult {
  prompt: string;
  notes?: string[];
}
export type PromptGenerator = (spec: AgentSpec) => Promise<PromptGeneratorResult>;

// THE DEFAULT GENERATOR — the v7.3 shadow pipeline (Part 14 STEP 2). The runner
// returns the manifest STRING; the dispatch parses it + reads the file.
// THE ERROR-MANIFEST DETECTION (2026-08-07 — the container-test finding: the
// runner's loud-fail errorManifest carries agents[0].path pointing at a file
// that is NEVER WRITTEN (the loud-fail writes no file) — the OLD code read the
// path blindly → ENOENT MASKED the real failure (the ct-final-b container run:
// the failed list showed "ENOENT ... ct-final-b.md" instead of the actual
// generation error). The loud-fail law demands the REAL named error: the
// manifest's ready:false + error fields are checked BEFORE any file read, and
// the real error is thrown.)
async function shadowGenerate(spec: AgentSpec, tmpDir: string): Promise<PromptGeneratorResult> {
  const manifestStr = await runShadowPipeline(spec, undefined, { outDir: tmpDir });
  const parsed = JSON.parse(manifestStr) as { agents?: Array<{ path?: string; notes?: string[]; ready?: boolean; error?: string; validated?: boolean }> };
  const agent = parsed.agents && parsed.agents.length > 0 ? parsed.agents[0] : null;
  if (!agent || !agent.path) {
    throw new Error('the shadow pipeline returned an unparseable manifest for ' + spec.name);
  }
  // THE LOUD-FAIL CHECK (2026-08-07): the errorManifest's agent carries
  // ready:false + the error — the file was NEVER written. Throw the REAL
  // error, never the ENOENT mask.
  if (agent.ready === false || (typeof agent.error === 'string' && agent.error.length > 0)) {
    throw new Error(agent.error && agent.error.length > 0
      ? agent.error
      : 'the shadow pipeline reported the generation failed for ' + spec.name + ' (ready:false, no error text)');
  }
  const prompt = fs.readFileSync(agent.path, 'utf-8');
  return { prompt, notes: agent.notes ?? [] };
}

// THE CHECK-IN TEXT (Part 3.5 — the return's anti-forget).
// THE HALLUCINATION-FUEL PURGE (2026-08-08 — the operator: "have you properly
// removed all hallucination fuel from the wave manager tool that makes
// agents think invisible subagents have been dispatched"): the OLD text said
// "the streams are live in the child sessions" — a LIE (the generator spawns
// NOTHING; there ARE no child sessions until the orchestrator dispatches the
// returned batch). The text now states the generator-only reality: the batch
// form must be DISPATCHED, and only then do the child sessions exist.
export function buildCheckInText(waveId: string, count: number, etaMs: number): string {
  const m = Math.round(etaMs / 60000);
  const t = new Date().toTimeString().slice(0, 5);
  return 'WAVE CHECK-IN: ' + waveId + ' (' + count + ' agents) generated at ' + t +
    ' — NO subagents have been dispatched (the generator does NOT spawn). ' +
    'DISPATCH the returned batch form NOW — THE BATCH PROCESS: ALL ' + count + ' agents\' task calls as the parts of ONE message (the runtime executes them in one concurrent pass; the batch is the message, never a tool) — ' +
    'ONE batch call (the returned tools array, 0 ignore, 0 hand-picking) — the child sessions ' +
    'exist only after that dispatch. THE [WAVE VERBATIM] + [WAVE BATCH] FIREWALLS (2026-08-09): ' +
    'a compressed/condensed prompt is BLOCKED (the SHA mismatch) + a single task dispatch of a ' +
    'multi-agent wave is BLOCKED (the full batch is the only sanctioned channel). ADD the wave ' +
    'row to the todowrite: \'WAVE ' + waveId +
    ' — ' + count + ' agents — batch ready since ' + t +
    ' — ETA ~' + m + 'm after the dispatch\' (high, in_progress). The cron will ' +
    'remind you when the wave completes or the ETA passes. Update the row on every ' +
    'check until ALL agents are complete.';
}

// THE NORMALIZATION (the front-end freeze — the flat single-agent args are a
// batch of 1, the same as the retired tool):
// THE WAVE-ID-SCOPED FALLBACK (2026-08-10 — THE NAME-COLLISION FIX): the old
// 'agent-N' fallback was wave-INDEX-scoped only — two name-less waves in the
// same tmp dir both wrote 'agent-1.md' (the second OVERWROTE the first, the
// first wave's manifest sha went stale → the [WAVE VERBATIM] false-block or
// the wrong content dispatch — the live finding). The waveId (created before
// the normalization in executeWaveDispatch) scopes the fallback: 'agent-wave-
// <ts>-N' is unique per wave by construction. The name field still wins when
// provided (the caller's explicit label unchanged).
export function normalizeAgents(args: Record<string, unknown>, waveId?: string): AgentSpec[] {
  if (Array.isArray(args.agents) && args.agents.length > 0) {
    return args.agents.map((a, i) => {
      const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
      const base = {
        name: (typeof rec.name === 'string' ? rec.name : (waveId ? 'agent-' + waveId + '-' + (i + 1) : 'agent-' + (i + 1))).replace(/[^A-Za-z0-9_-]/g, '-'),
        template: typeof rec.template === 'string' ? rec.template : 'E2',
        filepaths: Array.isArray(rec.filepaths) ? rec.filepaths.filter((p): p is string => typeof p === 'string') : [],
      };
      const hasSpecific = typeof rec.mission === 'string' || typeof rec.knownContext === 'string';
      const legacyCtx = typeof rec.context === 'string' ? rec.context : '';
      return {
        ...base,
        mission: typeof rec.mission === 'string' ? rec.mission : legacyCtx,
        knownContext: typeof rec.knownContext === 'string' ? rec.knownContext : legacyCtx,
        doctrine: typeof rec.doctrine === 'string' ? rec.doctrine : (legacyCtx.length > 0 ? legacyCtx : ''),
        measurements: typeof rec.measurements === 'string' ? rec.measurements : (legacyCtx.length > 0 ? legacyCtx : ''),
        acceptance: typeof rec.acceptance === 'string' ? rec.acceptance : (legacyCtx.length > 0 ? legacyCtx : ''),
        taskTargets: typeof rec.taskTargets === 'string' ? rec.taskTargets : (legacyCtx.length > 0 ? legacyCtx : ''),
        position: typeof rec.position === 'string' ? rec.position : (legacyCtx.length > 0 ? legacyCtx : ''),
      } as AgentSpec;
    });
  }
  const legacyCtx = typeof args.context === 'string' ? args.context : '';
  return [{
    name: (typeof args.outputName === 'string' ? args.outputName : (waveId ? 'task-prompt-' + waveId : 'task-prompt')).replace(/[^A-Za-z0-9_-]/g, '-'),
    template: typeof args.template === 'string' ? args.template : 'E2',
    filepaths: Array.isArray(args.filepaths) ? args.filepaths.filter((p): p is string => typeof p === 'string') : [],
    mission: legacyCtx,
    knownContext: legacyCtx,
    doctrine: legacyCtx.length > 0 ? legacyCtx : '',
    measurements: legacyCtx.length > 0 ? legacyCtx : '',
    acceptance: legacyCtx.length > 0 ? legacyCtx : '',
    taskTargets: legacyCtx.length > 0 ? legacyCtx : '',
    position: legacyCtx.length > 0 ? legacyCtx : '',
  } as AgentSpec];
}

// ═══ THE EXECUTE (Part 14 — the full flow) ═══

export interface ExecuteWaveDispatchOptions {
  client?: WaveDispatchClient | null;
  generator?: PromptGenerator | null;
  tmpDir?: string;
  waveId?: string;
}

export async function executeWaveDispatch(
  args: Record<string, unknown>,
  mainSessionId: string | null,
  opts: ExecuteWaveDispatchOptions = {},
): Promise<WaveDispatchResult> {
  // ── STEP 1 — THE VALIDATION (the shared validator — the named remedies) ──
  // The waveId is created BEFORE the normalization (2026-08-10 — the
  // name-collision fix): the name fallback needs the waveId to be unique.
  const waveId = 'wave-' + Date.now();
  const specs = normalizeAgents(args, waveId);
  if (specs.length === 0) {
    throw new Error('the agents array is empty — pass at least one agent spec');
  }
  if (specs.length > MAX_AGENTS_PER_WAVE) {
    throw new Error('a single wave is capped at ' + MAX_AGENTS_PER_WAVE + ' agents (got ' + specs.length + ')');
  }
  for (const spec of specs) {
    const err = validateAgentSpec(spec);
    if (err) throw new Error(err);        // the refusal names each thin field
  }

  const tmpDir = resolveTmpDir(typeof args.dispatchDir === 'string' ? args.dispatchDir : opts.tmpDir);
  // THE CLIENT RESOLUTION (the 2026-08-07 container-test finding): the caller
  // may pass the client via opts — the FALLBACK is the plugin's global
  // (getOpencodeClient — set at the plugin load from input.client). The
  // container's first run showed the opts.client null + the global unset in
  // that context — this fallback + the tracker-registration-even-on-failure
  // fix keep the wave's state consistent regardless.
  const client = opts.client ?? getOpencodeClient() ?? null;
  const generator = opts.generator ?? null;

  // ── STEP 3 — THE TMP WRITE (the durable record) ──
  fs.mkdirSync(tmpDir, { recursive: true });
  const manifest: WaveManifest = {
    wave: waveId,
    dispatchedAt: new Date().toISOString(),
    agents: [],
  };

  // ── STEP 2 — THE SHADOW PIPELINE (per agent — the v7.3 machinery) ──
  // ═══ THE BOUNDED-CONCURRENCY GENERATION (2026-08-09 — the plutus forensics:
  // the all-at-once Promise.allSettled put N simultaneous 384K requests on the
  // shared provider — the queue pushed the stragglers past the stall window
  // (5/10 generations failed: SHADOW_BRAIN_HTTP_500 ×2 + SHADOW_BRAIN_TIMEOUT
  // ×3 — the per-call lottery against the same flaky endpoint). The INTELLIGENT
  // async (the operator's law: "async/parallel is the DEFAULT... INTELLIGENT
  // async systems"): a bounded pool (CONCURRENT_GENERATIONS = 3) keeps the
  // wave's total ≈ the slowest agent AND caps the self-inflicted provider load
  // (the 2026-08-08 live probes: the provider's latency grows with the queue
  // depth — 35-50s per non-streamed 384K request). The per-agent telemetry
  // (startedAt/finishedAt/durationMs) makes the async-parallel PROVABLE in the
  // returned output (the forensics' fix #1: "the tool exposes NO telemetry to
  // prove it"). Each agent's failures land in the manifest's failed list + the
  // ERROR-* files (never a silent skip), exactly as before. ═══
  const CONCURRENT_GENERATIONS = 3;
  const generated: Array<{ spec: AgentSpec; prompt: string; notes: string[]; startedAt: string; finishedAt: string; durationMs: number }> = [];
  const generationFailures: Array<{ name: string; error: string; startedAt?: string; durationMs?: number }> = [];
  const runOne = async (spec: AgentSpec): Promise<void> => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let result: PromptGeneratorResult;
    try {
      result = generator
        ? await generator(spec)
        : await shadowGenerate(spec, tmpDir);
    } catch (genErr) {
      const msg = genErr instanceof Error ? genErr.message : String(genErr);
      tridentLog('WARN', 'wave-dispatch', 'generation failed for ' + spec.name + ': ' + msg);
      try {
        fs.writeFileSync(path.join(tmpDir, 'ERROR-' + spec.name + '.txt'), msg, 'utf-8');
      } catch (wErr) {
        tridentLog('WARN', 'wave-dispatch', 'the ERROR file could not be written for ' + spec.name + ': ' + (wErr instanceof Error ? wErr.message : String(wErr)));
      }
      // THE LOUD-FAIL (2026-08-07 — the operator's law: a failure is LOUD, never
      // a silent empty prompt in the batch form). The failed agent lands in the
      // generationFailures list (→ the return's `failed`) AND the batch form
      // SKIPS it — the orchestrator sees the named error, never an empty prompt.
      generationFailures.push({ name: spec.name, error: msg, startedAt, durationMs: Date.now() - t0 });
      return;
    }
    const filePath = path.join(tmpDir, spec.name + '.md');
    try {
      fs.writeFileSync(filePath, result.prompt, 'utf-8');
    } catch (wErr) {
      const msg = 'the tmp write failed for ' + spec.name + ': ' + (wErr instanceof Error ? wErr.message : String(wErr));
      tridentLog('ERROR', 'wave-dispatch', msg);
      generationFailures.push({ name: spec.name, error: msg, startedAt, durationMs: Date.now() - t0 });
      return;
    }
    generated.push({
      spec, prompt: result.prompt, notes: result.notes ?? [],
      startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
    });
  };
  // THE BOUNDED POOL: the specs process in slices of CONCURRENT_GENERATIONS;
  // the per-slice allSettled keeps the per-unit failure capture (the runs
  // never reject — the failures land in the generationFailures list inside
  // runOne; the .catch is the defensive net).
  const specsQueue = [...specs];
  while (specsQueue.length > 0) {
    const slice = specsQueue.splice(0, CONCURRENT_GENERATIONS);
    await Promise.allSettled(slice.map((spec) => runOne(spec).catch((reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      tridentLog('ERROR', 'wave-dispatch', 'generation threw for ' + spec.name + ': ' + msg);
      generationFailures.push({ name: spec.name, error: msg });
    })));
  }

  for (const { spec, prompt, startedAt, finishedAt, durationMs } of generated) {
    manifest.agents.push({
      name: spec.name,
      type: resolveSubagentType(spec.template),
      lines: prompt.split('\n').length,
      sha256: createHash('sha256').update(prompt).digest('hex'),
      status: 'running',
      startedAt, finishedAt, durationMs,   // the generation telemetry (2026-08-09)
    });
  }
  try {
    fs.writeFileSync(path.join(tmpDir, '.wave-manifest-' + waveId + '.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (mErr) {
    tridentLog('WARN', 'wave-dispatch', 'the manifest write failed: ' + (mErr instanceof Error ? mErr.message : String(mErr)));
  }

  // ── STEP 4 — THE ETA (NON-BLOCKING — Part 14 STEP-4 NOTE) ──
  // The eta promise is fired WITHOUT awaiting it in the spawn path; the tracker
  // entry awaits it asynchronously; the execute returns with the default ETA
  // placeholder (the tracker's adaptive recalc corrects).
  const etaPlaceholderMs = baselineEtaMs(specs.map((s) => ({ template: s.template, filepaths: s.filepaths })));

  // ── STEP 5 — THE SPAWN (all in parallel, allSettled) ──
  const failed: Array<{ name: string; error: string }> = generationFailures;
  // ═══ THE BASELINE (2026-08-07 — THE SUBAGENT-RECURSION CATASTROPHE FIX) ═══
  // THE DIRECT SPAWN IS REMOVED. The wave dispatch is the GENERATOR ONLY:
  // it produces the prompt files + the manifest + the BATCH FORM — the
  // dispatch itself happens through THE BATCH TOOL of task calls (the
  // runtime's CANONICAL subtask path: the assistant's tool-call message →
  // the handleSubtask → the child WITH the prompt + the leaf-node
  // enforcement). The direct user-message subtask parts (the previous
  // design) created EMPTY SHELL children (the prompt never propagated) +
  // re-triggered the spawn on every subsequent turn (the 15-deep nesting +
  // the primary stream kill). The batch-of-task-calls path is EXACTLY how
  // the native task tool dispatches — the children get the prompts, the
  // gates apply, the recursion is impossible (the leaf gate blocks the
  // subagents from calling the dispatch tools — F1).
  // The manifest's agents record the PROMPT FILES (the batch's source) —
  // the orchestrator dispatches the batch + the t.e.a. wipes the tmp.
  // THE FAILED AGENTS (2026-08-07 — the loud-fail law): a generation failure
  // NEVER ships an empty prompt — the failed agents are EXCLUDED from the
  // dispatched list + the batch form and land in the return's `failed` with
  // the named error. The orchestrator sees the failure, never a fake.
  const dispatched: DispatchedAgent[] = [];
  for (let i = 0; i < generated.length; i++) {
    const spec = generated[i].spec;
    manifest.agents[i].lines = generated[i].prompt.split('\n').length;
    manifest.agents[i].sha256 = createHash('sha256').update(generated[i].prompt).digest('hex');
    dispatched.push({
      name: spec.name,
      sessionId: '',   // set by the batch dispatch (the runtime's child creation)
      type: spec.template.startsWith('B') ? 'trident_build' : 'trident_explore',
      status: 'ready',
    });
  }
  try {
    fs.writeFileSync(path.join(tmpDir, '.wave-manifest-' + waveId + '.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (mErr) {
    tridentLog('WARN', 'wave-dispatch', 'the manifest write failed: ' + (mErr instanceof Error ? mErr.message : String(mErr)));
  }
  // THE PER-AGENT RECORDS (2026-08-10 — THE WAVE_BATCH_GATE_FALSE_POSITIVE FIX):
  // the [WAVE BATCH] gate's passing shape = one manifest file per agent, exactly
  // 1 agent each. The wave-level record above carries the wave's structure (the
  // tracker/status/ETA); the per-agent records carry the dispatch AUTHORIZATION:
  // the gate's per-call evaluation matches the agent's record → 1 agent → the
  // single task call of the parallel batch is the sanctioned channel (the
  // per-call hook cannot observe the message's sibling parts). WITHOUT them,
  // EVERY call of a legit N-agent batch matches the N-agent wave record → ALL
  // blocked (the live false positive — the ADM build: 15 blocks, 3 attempts,
  // zero dispatches).
  for (let i = 0; i < generated.length; i++) {
    const g = generated[i];
    const oneAgentRecord = {
      wave: waveId,
      dispatchedAt: new Date().toISOString(),
      agents: [manifest.agents[i]],
    };
    try {
      fs.writeFileSync(path.join(tmpDir, '.wave-manifest-' + waveId + '-' + g.spec.name + '.json'), JSON.stringify(oneAgentRecord, null, 2), 'utf-8');
    } catch (pErr) {
      tridentLog('WARN', 'wave-dispatch', 'the per-agent manifest write failed for ' + g.spec.name + ': ' + (pErr instanceof Error ? pErr.message : String(pErr)));
    }
  }
  // THE WAVE-DISPATCH REGISTRY (2026-08-10 — THE WAVE_BATCH FALSE-POSITIVE
  // CLASS fix, the FINAL design): the per-call hook CANNOT observe the
  // message's sibling task parts (the InputMessage carries no parts — proven
  // by the live ADM failure: the 5-call batch blocked per call). The batch-ness
  // is enforced by the ATOMIC registry: { wave, total, calls, windowStart }.
  // The gate's SYNCHRONOUS read-modify-write (no awaits between the readFileSync
  // + writeFileSync) is atomic on the event loop — the batch's N calls each
  // append their key + pass within the window; the one-at-a-time derailment's
  // NEXT-TURN call hits the expired window → the block; a wave without the
  // registry (generated pre-fix) → the REGENERATE directive (never the
  // dead-loop the old message created). THE WINDOW opens on the FIRST DISPATCH
  // CALL (windowStart: null here — the gate sets it), never on the generation:
  // the batch's dispatch happens minutes after the generation — a
  // generation-time window would block the legit batch.
  const waveRegistry = {
    wave: waveId,
    total: generated.length,
    calls: [] as string[],
    windowStart: null as number | null,
  };
  try {
    fs.writeFileSync(path.join(tmpDir, '.wave-registry-' + waveId + '.json'), JSON.stringify(waveRegistry, null, 2), 'utf-8');
  } catch (rErr) {
    tridentLog('WARN', 'wave-dispatch', 'the wave registry write failed: ' + (rErr instanceof Error ? rErr.message : String(rErr)));
  }

  // ── STEP 6 — THE TRACKER + THE WAVE ROW ──
  const respawnWaveId = typeof args.waveId === 'string' ? args.waveId : opts.waveId ?? null;
  if (respawnWaveId) {
    // THE RESPAWN PATH (Part 4.3): the waveId + the name matching — the tracker
    // updates the EXISTING wave's agents IN PLACE (the lineage).
    for (const d of dispatched) {
      WaveTracker.respawnAgent(respawnWaveId, d.name, d.sessionId, 'ORCHESTRATOR_ABORT');
    }
  } else {
    // THE TRACKER REGISTERS ALWAYS (the 2026-08-07 container-test finding):
    // the wave's state must be consistent even when ALL spawns fail — the
    // wave-status tool shows the wave with the failed agents instead of
    // unknown_wave. The agents' track rows include the failed entries.
    const track = {
      wave: waveId,
      names: specs.map((s) => s.name),
      sessionIds: dispatched.map((d) => d.sessionId),
      dispatchedAt: Date.now(),
      etaMs: etaPlaceholderMs,
      etaConfidence: 0,
      agents: Object.fromEntries(specs.map((s) => {
        const d = dispatched.find((x) => x.name === s.name);
        return [s.name, d ? {
          sessionIds: [d.sessionId], state: 'running' as const,
          respawnCount: 0, lastKillReason: null,
          spawnTimes: { spawnedAt: Date.now() },
          lastActivityAt: Date.now(), lastBytes: 0, errorCodes: [],
        } : {
          sessionIds: [], state: 'failed' as const,
          respawnCount: 0, lastKillReason: null,
          spawnTimes: { spawnedAt: Date.now() },
          lastActivityAt: null, lastBytes: 0, errorCodes: [],
        }];
      })),
    };
    WaveTracker.registerWave(track);
  }

  // ── STEP 7 — THE RETURN (IMMEDIATE) — the BATCH FORM ═══
  // THE BASELINE (2026-08-07): the wave dispatch is the GENERATOR — the
  // return carries the BATCH FORM (the exact prompts' dispatch instructions:
  // the task calls with the prompts from the tmp files). The orchestrator
  // dispatches the batch via THE BATCH TOOL (the runtime's canonical subtask
  // path) — the children get the prompts + the leaf-node enforcement. The
  // t.e.a. wipe runs after the return (the prompts' lifetime = the batch).
  const checkIn = buildCheckInText(waveId, dispatched.length, etaPlaceholderMs);
  // THE BACKGROUND DIRECTIVE (2026-08-12 — the background-only ruling): the
  // batch dispatches background — the orchestrator continues working.
  const finalCheckIn = checkIn + '\nThe wave runs in the BACKGROUND — dispatch the batch form as ONE message; the task calls return immediately with task_ids. CHECK IN every 5-10 minutes — POLL task_status(taskId) + READ the part stream (trident-wave-status sessionId); COLLECT if complete, and STEER a derailing agent (trident-wave-steer) wherever you have free space or deem it relevant. Manage the waves like a senior engineer. Continue with the rest of your tasks after dispatching this wave.';
  // THE EXACT PROMPTS — the batch entries carry the generated content VERBATIM
  // (the operator: "batch the task tool of the exact prompts with 0 ignore"):
  const promptByAgent = new Map<string, string>(generated.map((g) => [g.spec.name, g.prompt]));
  const batchForm: WaveDispatchResult['batch'] = {
    tool: 'batch',
    parameters: {
      tools: dispatched.map((d) => ({
        tool: 'task',
        parameters: {
          description: d.name,
          prompt: promptByAgent.get(d.name) ?? 'EXECUTE THE FOLLOWING: the prompt file is missing — report the failure.',
          subagent_type: d.type,
          // THE PROMPTFILE CHANNEL (2026-08-09 — the operator: 'agents STOP
          // COMPRESSING/CONDENSING the fucking prompts'). The inline prompt
          // requires the orchestrator to REPRODUCE the 30K-char text exactly —
          // the model's output budget forces the compression. THE FIX: the
          // promptFile param references the generated prompt's FILE — the task
          // tool loads the EXACT content (no reproduction, no truncation, no
          // condensation — the SHA verification confirms it). The t.e.a. wipe
          // preserves the prompt files for the dispatch window.
          promptFile: path.join(tmpDir, d.name + '.md'),
          // NEW (2026-08-12 — the background-only ruling): the batch ALWAYS
          // dispatches background — the task calls return immediately with
          // task_ids; the orchestrator polls task_status + the part streams and
          // CONTINUES. task_status(task_id, wait=true) = sync-on-demand.
          background: true,
        },
      })),
    },
  };
  // THE GENERATION TELEMETRY (2026-08-09 — the forensics' fix #1): the
  // per-agent startedAt/finishedAt/durationMs/status in the returned output —
  // the async-parallel generation is PROVABLE, never claimed.
  const telemetry: Record<string, { startedAt: string; finishedAt?: string; durationMs?: number; status: 'ok' | 'failed' }> = {};
  for (const g of generated) {
    telemetry[g.spec.name] = { startedAt: g.startedAt, finishedAt: g.finishedAt, durationMs: g.durationMs, status: 'ok' };
  }
  for (const f of generationFailures) {
    telemetry[f.name] = { startedAt: f.startedAt ?? new Date().toISOString(), durationMs: f.durationMs, status: 'failed' };
  }
  return {
    wave: waveId,
    dispatched,
    failed,
    tmpDir,
    checkIn: finalCheckIn,
    telemetry,
    batch: batchForm,
  };
}

// ═══ THE RESUME HANDLER (2026-08-11 — the subagent-resume hotfix — the
// operator's design: action=resume, args=[taskIds], output=the batch-resume
// form — the agent pastes it as ONE message. THE SESSIONS PERSIST in the
// opencode.db (the session + part tables — the original prompts + the partial
// work in the parts) — the wiped prompt files don't matter. The firewall's
// resume-channel exemption (the task_id-form + the session probe) lets the
// continuations pass the dispatch checks. THE NAME TOKENS: the session row's
// title carried into the resume form's descriptions so the resumed agents are
// distinguishable (the operator's requirement). The manager NEVER spawns —
// the batch form is the output; the agent pastes it. ═══

export interface WaveResumeResult {
  action: 'resume';
  resumed: Array<{ taskId: string; name: string; verified: boolean; reason?: string }>;
  batch: { tool: 'batch'; parameters: { tools: Array<{ tool: 'task'; parameters: Record<string, unknown> }> } };
  checkIn: string;
}

// THE CONTINUATION (the resume instruction — the session's own context carries
// the original prompt + the partial work; the single word is enough — the
// operator's edit: "literally just continue is enough, dont overthink this").
function resumeContinuation(name: string): string {
  return 'continue';
}

// THE SESSION PROBE (the readonly row + the title — the name token's source).
export function resumeSessionInfo(taskId: string): { title: string } | null {
  try {
    const resumeDbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(resumeDbPath)) return null;
    const resumeDb = new Database(resumeDbPath, { readonly: true });
    try {
      const resumeRow = resumeDb.query('SELECT id, title FROM session WHERE id = ?').get(taskId) as { id?: string; title?: string } | undefined;
      return resumeRow && resumeRow.id ? { title: typeof resumeRow.title === 'string' && resumeRow.title.trim().length > 0 ? resumeRow.title : taskId } : null;
    } finally {
      resumeDb.close();
    }
  } catch (e) {
    tridentLog('WARN', 'wave-dispatch', 'resume-session probe failed for ' + taskId + ': ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

export async function executeWaveResume(
  taskIds: string[],
  names: string[],
): Promise<WaveResumeResult> {
  const unique = Array.from(new Set(taskIds.filter((t) => typeof t === 'string' && t.trim().length > 0)));
  if (unique.length === 0) {
    throw new Error('the resume requires at least one task_id — pass the interrupted sessions\' task ids (from the empty task returns or the wave-status\'s collected resume ids in .trident/resume-ids.json)');
  }
  const resumed: WaveResumeResult['resumed'] = [];
  const tools: Array<{ tool: 'task'; parameters: Record<string, unknown> }> = [];
  for (let i = 0; i < unique.length; i++) {
    const tid = unique[i];
    const fallbackName = typeof names[i] === 'string' && names[i].trim().length > 0 ? names[i].trim() : 'resume-' + (i + 1);
    let title = fallbackName;
    let ok = false;
    try {
      const info = resumeSessionInfo(tid);
      if (info) {
        ok = true;
        if (info.title !== tid) title = info.title;
      }
    } catch (e) { /* the verified:false below */ }
    const safeTitle = title.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (ok) {
      tools.push({
        tool: 'task',
        parameters: {
          description: 'resume-' + safeTitle,
          subagent_type: 'trident_build',
          task_id: tid,
          prompt: resumeContinuation(safeTitle),
        },
      });
    }
    resumed.push({
      taskId: tid,
      name: safeTitle,
      verified: ok,
      reason: ok ? undefined : 'the session row absent/unreadable — the resume excluded (the fresh generate may be needed for this agent)',
    });
  }
  const verifiedCount = resumed.filter((r) => r.verified).length;
  return {
    action: 'resume',
    resumed,
    batch: { tool: 'batch', parameters: { tools } },
    checkIn: 'RESUME CHECK-IN: ' + verifiedCount + '/' + resumed.length + ' sessions verified — NO subagents have been resumed (the manager does NOT spawn). PASTE the returned batch form as ONE message — ALL ' + tools.length + ' resume task calls as the parts of ONE message (THE BATCH PROCESS). The resume-channel exemption (the task_id-form + the session probe) lets the continuations pass the dispatch firewalls. The resumed sessions reload their original prompts + their partial work from the session parts — the continuation tells each agent to verify the completed work + continue. ' + (resumed.length - verifiedCount > 0 ? 'EXCLUDED: ' + resumed.filter((r) => !r.verified).map((r) => r.taskId).join(', ') + ' (the session rows absent — regenerate via the generate action).' : ''),
  };
}

// ═══ THE STEER (2026-08-12 — the operator: 'take the resume wiring, clone it,
// modify the input mechanism so you can send any prompt'). The resume sends a
// chat message into the existing session (task_id + a continuation); the steer
// sends ANY prompt into the existing session — the steering capability for
// derailing subagents:
//   - mode 'queue' (DEFAULT): the prompt lands in the session's message queue —
//     the subagent processes it after its current tool call completes (the
//     runtime's native queue; the latency is low — the agent is not ripped out
//     of context).
//   - mode 'interrupt' (CONDITIONAL): a hard steer — cancels the current
//     generation first, then queues the prompt. Only when the runtime exposes a
//     non-destructive cancel primitive (the TUI's esc-esc equivalent); if no
//     primitive exists, the caller should use mode 'queue' + a note.
// The task_id-form rides the firewall's resume-channel exemption (the same
// session probe the resume path uses). ═══

export interface WaveSteerResult {
  action: 'steer';
  sessionId: string;
  mode: 'queue' | 'interrupt';
  verified: boolean;
  reason?: string;
  call: { tool: 'task'; parameters: { task_id: string; prompt: string; description: string; subagent_type: string } };
  checkIn: string;
}

export async function executeWaveSteer(
  sessionId: string,
  prompt: string,
  opts: { mode?: 'queue' | 'interrupt'; subagentType?: string } = {},
): Promise<WaveSteerResult> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw new Error('[STEER] sessionId is required — the subagent session to steer');
  }
  const text = (prompt || '').trim();
  if (text.length === 0) {
    throw new Error('[STEER] prompt is required — the steer message (any text)');
  }
  const mode = opts.mode === 'interrupt' ? 'interrupt' : 'queue';
  const info = resumeSessionInfo(sessionId);   // the existing session probe (the title = the name token)
  const safeTitle = info && info.title !== sessionId
    ? info.title.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : 'steer';
  const subagentType = opts.subagentType === 'trident_build' ? 'trident_build' : 'trident_explore';
  const call = {
    tool: 'task' as const,
    parameters: { task_id: sessionId, prompt: text, description: 'steer-' + safeTitle, subagent_type: subagentType },
  };
  return {
    action: 'steer', sessionId, mode,
    verified: Boolean(info),
    reason: info ? undefined : 'the session row absent/unreadable — the steer cannot target it (the session may have ended)',
    call,
    checkIn: 'STEER CHECK-IN: ' + (info ? '' : 'UNVERIFIED — ') + mode.toUpperCase() + ' steer into ' + sessionId +
      '. DISPATCH the returned task call (task_id form — the resume-channel exemption passes the firewalls). ' +
      (mode === 'queue'
        ? 'The message QUEUES — the subagent processes it after its current tool call completes (low latency; the agent is not ripped out of context).'
        : 'INTERRUPT mode — the current generation is cancelled first (the esc-esc equivalent), then the message lands.'),
  };
}

// ═══ THE TOOL FACTORY (registered in trident-tools.ts — the front-end FREEZE:
// the agents array shape identical to the retired trident-task-preflight) ═══

export function createWaveManagerTool() {
  return tool({
    description: 'THE ONLY SUBAGENT DISPATCH PATH — the wave GENERATOR. Give agents=[{name, template, filepaths, mission, knownContext, doctrine, measurements, acceptance, taskTargets, position}] — one entry per subagent; the CONTEXT ARGS are the per-section raw material the tool WEAVES into the PRE-WOVEN golden template. Each arg has its floor (mission/knownContext 200c+, doctrine/measurements/acceptance/taskTargets 100c+, position 50c+) — thin args are REFUSED with the named remedy. THE GENERATOR DOES NOT SPAWN ANYTHING: it runs the shadow pipeline → writes the prompt files to the tmp folder → returns the MANIFEST + the BATCH FORM (the task calls with the EXACT generated prompts, 0 ignore). THE ORCHESTRATOR MUST DISPATCH THE RETURNED BATCH FORM AS ONE BATCH — THE BATCH PROCESS: ALL the task calls as the parts of ONE message (the runtime\'s native parallel channel; the batch form\'s tools array maps 1:1 to the message\'s tool parts; the batch is the message, never a separate tool) — the identical wave, 0 ignore, never sequential. THE DISPATCH IS ALWAYS BACKGROUND (the operator\'s ruling 2026-08-12): the batch form\'s task calls carry background:true — they return immediately with task_ids; the agents run in the background; the orchestrator polls task_status + the session part streams and CONTINUES. Use task_status(task_id, wait=true) when a step genuinely needs to block (synchronous-on-demand). That is the runtime\'s canonical subtask path: the children get the prompts, the leaf-node gate applies, the recursion is impossible. The tmp folder is wiped after the return (the prompts\' lifetime is the batch). E1-E4 → trident_explore, B1-B5 → trident_build. ZERO manual prompt writing — the session agent provides ONLY the context args + the filepaths, then dispatches the returned batch. THE CST2-PIPE: the wave\'s returns are the trident-context-synthesis T2 raw material — the orchestrator collects the subagent returns (the task results), writes them to a single file, then calls the T2 with the args assembled DIRECTLY from the returns (keyFacts/context/components) — the T2 knowledge file is the synthesis artifact.',
    args: {
      agents: z.array(z.object({
        name: z.string().describe('The EXACT subagent dispatch name — the prompt file is named after this (e.g. "wave1-src-extract").'),
        template: z.enum(['E1', 'E2', 'E3', 'E4', 'B1', 'B2', 'B3', 'B4', 'B5']).describe('E1=CODE extraction, E2=DOCS/deep-context, E3=research, E4=failure evidence, B1-B5=builds.'),
        filepaths: z.array(z.string()).describe('The absolute paths of EVERYTHING to analyze for THIS agent — one per line.'),
        mission: z.string().optional().describe('THE MISSION — the what + why + the framing (200c+).'),
        knownContext: z.string().optional().describe('THE KNOWN CONTEXT — the measured state, the anchors, the numbers (200c+).'),
        doctrine: z.string().optional().describe('THE OPERATOR\'S DOCTRINE — the verbatim quotes (100c+).'),
        measurements: z.string().optional().describe('THE KNOWN MEASUREMENTS TABLE — the numbers/tables the prompt must reconcile (100c+).'),
        acceptance: z.string().optional().describe('THE ACCEPTANCE CRITERIA — the checkable bullets (100c+).'),
        taskTargets: z.string().optional().describe('THE PER-TASK EXPANSIONS — the concrete extraction/implementation targets (100c+).'),
        position: z.string().optional().describe('THE POSITION IN THE BUILD — the chain slot, the consumers (50c+).'),
        context: z.string().optional().describe('LEGACY: the single context blob — split across the mission + the knownContext when the specific args are absent (1000c+).'),
      })).optional().describe('THE BATCH SPEC — one entry per subagent. ALL prompts are generated IN PARALLEL; the spawns are fired + the tool returns immediately.'),
      waveId: z.string().optional().describe('THE RESPAWN ANCHOR — pass the waveId of the wave whose agent you are respawning (the tracker updates the EXISTING wave in place — never a new wave).'),
      model: z.string().optional().describe('The per-wave model override (optional).'),
      provider: z.string().optional().describe('The per-wave provider override (optional).'),
      dispatchDir: z.string().optional().describe('The tmp-folder override (default: the shared trident-tmp constant).'),
      template: z.enum(['E1', 'E2', 'E3', 'E4', 'B1', 'B2', 'B3', 'B4', 'B5']).optional().describe('Single-agent mode: the template (same as agents[].template).'),
      filepaths: z.array(z.string()).optional().describe('Single-agent mode: the absolute paths of everything to analyze.'),
      mission: z.string().optional().describe('Single-agent mode: THE MISSION (200c+).'),
      knownContext: z.string().optional().describe('Single-agent mode: THE KNOWN CONTEXT (200c+).'),
      doctrine: z.string().optional().describe('Single-agent mode: THE DOCTRINE quotes (100c+).'),
      measurements: z.string().optional().describe('Single-agent mode: THE MEASUREMENTS (100c+).'),
      acceptance: z.string().optional().describe('Single-agent mode: THE ACCEPTANCE bullets (100c+).'),
      taskTargets: z.string().optional().describe('Single-agent mode: THE PER-TASK targets (100c+).'),
      position: z.string().optional().describe('Single-agent mode: THE POSITION (50c+).'),
      context: z.string().optional().describe('LEGACY single-agent mode: the single context blob.'),
      outputName: z.string().optional().describe('Single-agent mode: the output file name (without .md) — defaults to the semantic name.'),
      action: z.enum(['generate', 'resume']).optional().describe('THE ACTION — generate (the default: the agents array → the prompt files + the batch form) OR resume (the taskIds array → the RESUME BATCH FORM for the interrupted sessions: the task_id + the 1-2 line continuation; the sessions persist in the opencode.db — the original prompts + the partial work in the session parts; the firewall\'s resume-channel exemption lets the continuations pass).'),
      taskIds: z.array(z.string()).optional().describe('THE RESUME ANCHORS — the interrupted sessions\' task ids (from the EMPTY task returns or the wave-status\'s collected resume ids in .trident/resume-ids.json). An EMPTY task return = the provider interrupted the agent — resume it, never regenerate.'),
      names: z.array(z.string()).optional().describe('The name tokens for the resume form\'s descriptions (the session row\'s title overrides when available) — so the resumed agents are distinguishable.'),
    },
    execute: async (
      args: Record<string, unknown>,
      context: { sessionID: string },
    ): Promise<{ title: string; output: string }> => {
      const mainSessionId = (context && typeof context.sessionID === 'string' && context.sessionID) || null;
      const action = typeof args.action === 'string' ? args.action : 'generate';
      if (action === 'resume') {
        const taskIds = Array.isArray(args.taskIds) ? (args.taskIds as string[]) : [];
        const names = Array.isArray(args.names) ? (args.names as string[]) : [];
        const resumeResult = await executeWaveResume(taskIds, names);
        const verified = resumeResult.resumed.filter((r) => r.verified).length;
        return {
          title: 'WAVE RESUME — ' + verified + '/' + resumeResult.resumed.length + ' verified',
          output: JSON.stringify(resumeResult, null, 2),
        };
      }
      const result = await executeWaveDispatch(args, mainSessionId);
      return {
        title: 'WAVE ' + result.wave + ' — ' + result.dispatched.length + ' dispatched',
        output: JSON.stringify(result, null, 2),
      };
    },
  });
}
