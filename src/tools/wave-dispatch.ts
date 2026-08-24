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
import { RpmLedger } from './shadow/rpm-ledger.ts';
import { checkWavePlanning, recordWaveServed } from './wave-planning-gate.ts';
import { coerceContextValue, validateWaveCount } from './wave-pipeline.ts';
import { ensureSpecFile, validateSpecFile, formatDiagnostics, resetToTemplate, WAVE_SPEC_RELATIVE_PATH } from './wave-spec.ts';
import type { TetheredSession } from './shadow/shadow-sidecar.ts';
import { validateAgentSpec, type AgentSpec } from './trident-task-preflight.ts';
import { validateTaskPromptLines } from './trident-preflight.ts';
import { WaveTracker, type WaveStatus } from './wave-tracker.ts';
import { getOpencodeClient } from './trident-tools.ts';
import {
  TRIDENT_TMP_DIR, resolveTmpDir,
  type WaveManifest, type WaveDispatchResult,
} from './wave-constants.ts';
import { baselineEtaMs } from './wave-eta.ts';
import { executeWaveStatus, readSessionStream, type WaveStatusClient, type WaveStatusArgs } from './wave-status.ts';
import {
  createWaveRegistry, releaseWaveRegistryFile,
} from './wave-registry.ts';
import { executeDispatch, type TaskDispatchFn } from './wave-pipeline.ts';

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
  promptBody: { agent: string; parts: SubtaskPartShape[]; tools?: Record<string, boolean> };
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
async function shadowGenerate(spec: AgentSpec, tmpDir: string, options?: { tether?: TetheredSession; ledger?: RpmLedger }): Promise<PromptGeneratorResult> {
  // THE PER-AGENT TETHER (2026-08-21 — the operator: "EACH SHADOW AGENT IS ITS
  // OWN FUCKING SESSION/PID IN PI. 4 SEPARATE SESSIONS. NO THEATRICAL ASYNC."):
  // the tether is now passed IN from runOne — each agent carries its OWN
  // sessionKey (waveId + agent name) so the ShadowMemory root + the sidecar
  // record are DISTINCT per agent. Without it, ShadowRunner falls back to
  // tetherSession() → ALL agents share the ONE global session key → ONE
  // sqlite → the appendPrompts serialize → the completion ladder.
  // THE LEDGER (2026-08-21 — the operator's hybrid) rides the same options:
  // ONE shared RpmLedger per wave → every ShadowAgent's chainedStream admits/
  // exiles providers on the WHOLE WAVE's observations, not its own.
  const manifestStr = await runShadowPipeline(spec, undefined, { outDir: tmpDir, tether: options?.tether, ledger: options?.ledger });
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
  // THE COMPACT CHECK-IN (2026-08-13 — the anti-derailment: the OLD text was a
  // wall of instructions (the todowrite + the poll cadence + the steer
  // directive) that build agents either ignored or over-followed. THE FIX: TWO
  // lines — the wave + the dispatch command + the tracking pointer. The wave's
  // full state lives in the tracker + is retrieved via the ONE tool
  // (action=status waveId=<id>) — the ONLY in-memory vars are the wave id + the
  // alias; nothing else bloat the context.
  // THE CLEAN T.E.A. (2026-08-20 — the operator's ruling: the DISPATCH goes
  // through the wave-manager dispatch TOOL, NOT the raw task tool. The OLD text
  // told the agent to "paste the batch form via the task tool / paste the path
  // string verbatim as the prompt contents" — that was the pre-dispatch-tool
  // era + the derailment fuel. THE ONE-TRUE-PATH: call trident-wave-manager
  // action=dispatch waveId=<id> — the tool reads the generate files + spawns
  // via extra.taskDispatch, no manual batch-form pasting, no path-string
  // transcription. The generation is ALWAYS background; the orchestrator polls
  // the SESSION STREAM (trident-wave-read), never task_status.)
  return 'WAVE ' + waveId + ' (' + count + ' agents) READY — DISPATCH via trident-wave-manager action=dispatch waveId=' + waveId + ' (THE ONLY SUBAGENT DISPATCH PATH). Do NOT paste the batch form and do NOT use the raw task tool — the dispatch tool reads the generated prompt files and spawns the subagents itself. Track it via trident-wave-manager action=status waveId=' + waveId + ' (or trident-wave-read sessionId) — the full per-agent state + the session stream is retrieved on demand (never stored in context).';
}

// THE NORMALIZATION (the front-end freeze — the flat single-agent args are a
// batch of 1, the same as the retired tool):
// THE WAVE-ID-SCOPED FALLBACK (2026-08-10 — THE NAME-COLLISION FIX): the old
// 'agent-N' fallback was wave-INDEX-scoped only — two name-less waves in the
// same tmp dir both wrote 'agent-1.md' (the second OVERWROTE the first, the
// first wave's manifest sha went stale → the [WAVE VERBATIM] false-block or
// the wrong content dispatch — the live finding). The waveId (created before
// the normalization in generateWave) scopes the fallback: 'agent-wave-
// <ts>-N' is unique per wave by construction. The name field still wins when
// provided (the caller's explicit label unchanged).
export function normalizeAgents(args: Record<string, unknown>, waveId?: string): AgentSpec[] {
  // THE COERCION ENGINE — any sane shape → canonical string (arrays join,
  // objects JSON-ify, scalars stringify); empty → legacyCtx or ''.
  const ctx = (rec: Record<string, unknown>, k: string, legacyCtx: string): string => {
    const v = coerceContextValue(rec[k]);
    if (v !== undefined && v.length > 0) return v;
    return legacyCtx;
  };
  if (Array.isArray(args.agents) && args.agents.length > 0) {
    return args.agents.map((a, i) => {
      const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
      let fps: string[] = [];
      if (typeof rec.filepaths === 'string' && rec.filepaths.trim()) fps = [rec.filepaths];
      else if (Array.isArray(rec.filepaths)) fps = rec.filepaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      const base = {
        name: (coerceContextValue(rec.name) ?? (waveId ? 'agent-' + waveId + '-' + (i + 1) : 'agent-' + (i + 1))).replace(/[^A-Za-z0-9_-]/g, '-'),
        template: coerceContextValue(rec.template) ?? 'E2',
        filepaths: fps,
      };
      const legacyCtx = coerceContextValue(rec.context) ?? '';
      return {
        ...base,
        mission: ctx(rec, 'mission', legacyCtx),
        knownContext: ctx(rec, 'knownContext', legacyCtx),
        doctrine: ctx(rec, 'doctrine', legacyCtx),
        measurements: ctx(rec, 'measurements', legacyCtx),
        acceptance: ctx(rec, 'acceptance', legacyCtx),
        taskTargets: ctx(rec, 'taskTargets', legacyCtx),
        position: ctx(rec, 'position', legacyCtx),
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
  /** THE RETRY-PASS COOL-DOWN (production default 30s; tests pass a small value). */
  retryPassMs?: number;
  /** THE AUTO-DISPATCH FUNCTION (2026-08-22): when provided, each completed agent
   *  is dispatched IMMEDIATELY after its pipeline finishes — no separate
   *  action=dispatch call needed. The orchestrator gets session IDs trickling
   *  back as agents complete instead of waiting for the slowest agent. */
  taskDispatch?: TaskDispatchFn;
  /** THE INTERNAL SPEC CHANNEL (2026-08-22 — the ONLY-input-file enforcement):
   *  programmatic/test callers inject agent specs here. This channel is NOT in
   *  the zod schema — the MODEL can never reach it. The model's ONLY input path
   *  is .trident/wave-spec.json on disk. The inline args.agents fallback is GONE. */
  inlineAgents?: Record<string, unknown>[];
}

/** THE SESSION-AUTO-SCOPED STATE ROOT (2026-08-24 — the operator: "NOT a stupid
 *  fucking single global file... AUTO SCOPE TO THE SAME WORKSPACE DIR AS THE
 *  CODEBASE BEING WORKED ON IN THE SESSION"). THE CONCURRENT-SESSION FIX: the
 *  OLD code resolved every sidecar to process.cwd()/.trident — ONE SHARED global
 *  that two sessions clobbered (session A reset the spec to template while
 *  session B was mid-edit). NOW the root is DERIVED from THIS session's own file
 *  activity: read the session stream, collect the absolute filepaths the tools
 *  touched, walk up each to the nearest project marker (.trident/package.json/
 *  .git/), and take the deepest common project root. A concurrent session on a
 *  DIFFERENT codebase resolves a DIFFERENT root — zero collision. An explicit
 *  projectToken absolute path wins; process.cwd() is only the last-resort fallback.
 *  All three sidecars (wave-spec.json, wave-plan.md, wave-planning-state.json)
 *  derive from this root, so they stay lockstep with the codebase under work. */
// THE SESSION-SCOPE CACHE (2026-08-24 — the operator: "MAKE SURE THIS IS
// FULLY CLEAN. EVERYTHING IS PROJECT WORKSPACE SCOPED"): the FIRST successful
// auto-detection for a session PINS that root for the session's lifetime.
// The 200-part window was FLUSHABLE — a run of workdir-less log greps pushed
// the project anchors out and the resolver grabbed a foreign .trident (the
// live misfire: the stale workspace-global spec loaded + a COUNT MISMATCH).
// STICKY = the session's codebase root, resolved once from its real project
// activity, NEVER re-derived mid-session. projectToken still overrides; the
// cache is per-process (a restart re-resolves from the fresh stream).
const SESSION_SCOPE_CACHE = new Map<string, string>();

function resolveScopeRoot(sessionId: string | null, projectToken?: unknown): string {
  // 1) EXPLICIT projectToken absolute path wins (the strongest signal).
  if (typeof projectToken === 'string' && projectToken.trim().length > 0) {
    const tok = projectToken.trim();
    if (fs.existsSync(tok)) {
      SESSION_SCOPE_CACHE.set(sessionId ?? 'default', tok);
      return tok;
    }
    return process.cwd();
  }
  // 2) THE STICKY CACHE — a session that already resolved its root NEVER
  // re-derives (the flush-proof guarantee).
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    const cached = SESSION_SCOPE_CACHE.get(sessionId);
    if (cached && fs.existsSync(cached)) return cached;
  }
  // 3) AUTO-DETECT from the session's own file activity (concurrency-safe).
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    try {
      const page = readSessionStream(sessionId, { limit: 200 });
      if (page.ok && page.parts.length > 0) {
        const abs = new Map<string, number>();
        for (const part of page.parts) {
          if (typeof part.input !== 'object' || part.input === null) continue;
          const cmd = String((part.input as Record<string, unknown>).command ?? '');
          // THE WORKDIR ANCHOR (2026-08-24 — the live scope-probe fix): bash
          // commands carry RELATIVE paths + the workdir field IS the project
          // anchor — a session driving its codebase via workdir-relative
          // commands (the normal pattern) is INVISIBLE to the cmd-regex (it
          // captures junk fragments like /index.js). The workdir ascends
          // straight to the real project root. Without it, the scorer falls
          // to ANY .trident-owning ancestor visible in the stream (the
          // workspace-root GLOBAL or the archive — the live misfire that
          // validated the stale 3-agent template).
          const wd = (part.input as Record<string, unknown>).workdir;
          if (typeof wd === 'string' && wd.startsWith('/') && wd.length > 3) {
            abs.set(wd, (abs.get(wd) ?? 0) + 2);   // weighted: the deliberate anchor
          }
          const cands = (part.input as Record<string, unknown>).filepath
            ?? (part.input as Record<string, unknown>).filepaths
            ?? (cmd.match(/\/[^\s;]+/g) ?? []);
          const list = Array.isArray(cands) ? cands : [cands];
          for (const c of list) {
            const s = String(c);
            if (!s.startsWith('/')) continue;
            const base = s.slice(0, s.indexOf('?') === -1 ? s.length : s.indexOf('?'));
            if (base.length < 3) continue;
            abs.set(base, (abs.get(base) ?? 0) + 1);
          }
        }
        const scored = scoreProjectRoots(abs);
        if (scored) {
          // PIN THE RESOLUTION (the sticky cache): this session's root is now
          // fixed — later workdir-less activity (log greps etc.) can never
          // flush the window and re-resolve to a foreign root.
          SESSION_SCOPE_CACHE.set(sessionId, scored);
          return scored;
        }
      }
    } catch { /* stream read failure → fall through to cwd */ }
  }
  // 3) LAST RESORT — the current dir (never the parent-workspace hardcode).
  return process.cwd();
}

/** Given candidate absolute filepaths → the project root to scope .trident to.
 *  Selection rules (fixes from the 2026-08-24 baseline probe):
 *  1. A candidate is a root when it has .trident, .git, OR package.json — but
 *     NOT bare `src` (a .ts file LIVES under .../src, so src matched its own
 *     ascent, the ''src'' false-root class).
 *  2. `.trident` presence DOMINATES: the wave state lives in the root that
 *     actually has .trident, even when a DEEPER nested sub-package
 *     (e.g. src/package.json in a monorepo) also matches at greater depth.
 *  3. Among same-.trident-status candidates, the deeper (more specific) wins —
 *     a sub-package that also owns a .trident is the real scope. */
function scoreProjectRoots(paths: Map<string, number>): string | null {
  function has(d: string, name: string): boolean {
    try { return fs.existsSync(path.join(d, name)); } catch { return false; }
  }
  function isRoot(d: string): boolean {
    return has(d, '.git') || has(d, '.trident') || has(d, 'package.json');
  }
  // COLLECT EVERY root ancestor per path — NOT just the first. A nested
  // src/package.json (the ''src-shadow'' class) must not mask the outer
  // project root where .trident actually lives.
  const candidates: Array<{ d: string; depth: number; hasTrident: boolean }> = [];
  const seen = new Set<string>();
  for (const [p] of paths) {
    // THE PATH-AS-ROOT (2026-08-24 — the workdir companion fix): a candidate
    // may itself BE the project root (the workdir anchor points AT the root,
    // not into it) — test the path BEFORE ascending, else the walk starts at
    // the parent and a shallower ancestor steals the scope.
    let d = isRoot(p) ? p : path.dirname(p);
    let guard = 0;
    while (guard++ < 32 && d.length > 1) {
      if (isRoot(d) && !seen.has(d)) {
        seen.add(d);
        candidates.push({ d, depth: d.split('/').length, hasTrident: has(d, '.trident') });
      }
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  if (candidates.length === 0) return null;
  // select: any root OWNING .trident beats a deeper package-without-state;
  // among trident-owners take the deepest (the most specific codebase scope);
  // if none owns .trident, take the deepest package root.
  const tridentOwners = candidates.filter((c) => c.hasTrident);
  const pool = tridentOwners.length > 0 ? tridentOwners : candidates;
  pool.sort((a, b) => b.depth - a.depth);
  return pool[0].d;
}

export async function generateWave(
  args: Record<string, unknown>,
  mainSessionId: string | null,
  opts: ExecuteWaveDispatchOptions = {},
): Promise<WaveDispatchResult> {
  // ── STEP 1 — THE VALIDATION (the shared validator — the named remedies) ──
  // THE WAVE-ID NAMING (2026-08-13 — the operator: "why are all the wave ids
  // still some hash slop and not named with distinguishable tokens relevant to
  // the context of the wave"): the id was 'wave-<epoch-ms>' — pure timestamp
  // slop. THE FIX: when the operator provides the waveId (the alias), the
  // generated id = 'wave-<sanitized-alias>-<epoch>' — e.g. waveId='hydra-full-
  // map-v1' → 'wave-hydra-full-map-v1-1786...' — the distinguishable token
  // rides IN the id (the status/tracker/registry all show it). The raw alias
  // stays in the manifest's requestedWaveId for the release resolution.
  const requestedAlias = typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : '';
  const sanitizedAlias = requestedAlias
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 30);
  const waveId = 'wave-' + (sanitizedAlias ? sanitizedAlias + '-' : '') + Date.now();

  // ═══ THE SESSION-AUTO-SCOPED STATE ROOT (2026-08-24 — the operator: "i LITERALLY
  //  said NOT to have a stupid fucking single global file... it needs to PROPERLY
  //  FUCKING INTELLIGENTLY DETECT AND AUTO SCOPE TO THE SAME WORKSPACE DIR AS THE
  //  CODEBASE BEING WORKED ON IN THE SESSION"). THE CONCURRENT-SESSION FIX: the
  //  OLD code resolved every sidecar to process.cwd()/.trident — one SHARED global
  //  that two sessions clobbered (session A reset the spec to template while
  //  session B was mid-edit). NOW the root is DERIVED from THIS session's own file
  //  activity: read the session stream, collect the absolute filepaths the tools
  //  touched, walk up each to the nearest project marker (.trident/package.json/
  //  .git/), and take the deepest common project root. A concurrent session on a
  //  DIFFERENT codebase resolves a DIFFERENT root — zero collision. explicit
  //  projectToken path wins; process.cwd() is only the last-resort fallback. ═══
  const scopeRoot = resolveScopeRoot(mainSessionId, args.projectToken);
  const specFilePath = path.join(scopeRoot, WAVE_SPEC_RELATIVE_PATH);
  let specs: AgentSpec[];

  // THE SPEC FILE IS THE ONLY INPUT (2026-08-22 — the operator's mandate,
  // MECHANICALLY FORCED): the model's ONLY input path is .trident/wave-spec.json
  // on disk. The inline args.agents fallback is GONE — programmatic/test callers
  // use opts.inlineAgents (never reachable from the zod schema). Two branches only:
  // INTERNAL first (2026-08-24: tests/programmatic callers bypass the file — a
  // stale global spec shell never blocks the internal channel).
  if (Array.isArray(opts.inlineAgents) && opts.inlineAgents.length > 0) {
    // INTERNAL channel — tests / programmatic callers ONLY. Not in the schema.
    specs = normalizeAgents({ agents: opts.inlineAgents }, waveId);
  } else if (fs.existsSync(specFilePath)) {
    const diags = validateSpecFile(specFilePath);
    const errors = diags.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new Error(formatDiagnostics(diags));
    }
    const parsed = JSON.parse(fs.readFileSync(specFilePath, 'utf-8'));
    specs = normalizeAgents({ agents: parsed.agents }, waveId);
    console.error('[wave-spec] loaded ' + specs.length + ' agent specs from ' + specFilePath);
  } else {
    // Neither spec file nor inline agents → create template + refuse
    ensureSpecFile(scopeRoot);
    throw new Error(
      'WAVE SPEC TEMPLATE created at ' + specFilePath +
      '\nEdit this file: fill every [PLACEHOLDER] with dense real content (char floors are in each placeholder).' +
      '\nThen re-call action=generate. The edit-after hook will validate automatically.'
    );
  }

  if (specs.length === 0) {
    throw new Error('the agents array is empty — pass at least one agent spec');
  }
  // THE COUNT CONTRACT — the loud partial-wave refusal.
  const countErr = validateWaveCount(specs, args.expectedCount);
  if (countErr) throw new Error(countErr);
  if (specs.length > MAX_AGENTS_PER_WAVE) {
    throw new Error('a single wave is capped at ' + MAX_AGENTS_PER_WAVE + ' agents (got ' + specs.length + ')');
  }
  for (const spec of specs) {
    const err = validateAgentSpec(spec);
    if (err) throw new Error(err);        // the refusal names each thin field
  }

  // ═══ F3 — THE DENSITY MEMORY CHECK (2026-08-14 — the SHADOW-BRAIN 3-FIX
  // PLAN, the class-2 thin-args-collapse fix from the Critical Failure Log
  // 2026-08-14-wave-regeneration-thin-prompt-failure.md: "re-summarizing
  // previously-dense args for a 'smaller' wave regenerates the density problem
  // the first generation solved"). The prior generation's context-arg char
  // totals live in the tracker's argSnapshot; a regeneration with the SAME
  // agent name + args at <0.7 the original density appends the NAMED warning
  // to the returned output (REUSE the original args verbatim — only the
  // position/taskTargets change for the wave's shape). The warning never
  // blocks — a genuinely-new wave (different mission, legitimately different
  // scope) is always possible. ═══
  const densityWarnings: string[] = [];
  try {
    for (const spec of specs) {
      const newTotal = (spec.mission || '').length + (spec.knownContext || '').length + (spec.doctrine || '').length +
        (spec.measurements || '').length + (spec.acceptance || '').length + (spec.taskTargets || '').length + (spec.position || '').length;
      for (const prior of WaveTracker.getActiveWaves()) {
        const priorTotal = prior.argSnapshot ? prior.argSnapshot[spec.name] : undefined;
        if (typeof priorTotal === 'number' && priorTotal > 0 && newTotal < priorTotal * 0.7) {
          densityWarnings.push('DENSITY WARNING (' + spec.name + '): the new context args are ' + Math.round((newTotal / priorTotal) * 100) + '% of the prior generation\'s density (' + newTotal + ' vs ' + priorTotal + ' chars on wave ' + prior.wave + ') — REUSE the original mission/knownContext/doctrine/measurements/acceptance args VERBATIM (the project\'s ground truth); change ONLY the position/taskTargets for the wave\'s shape. A thin re-derivation produces the thin-prompt collapse (the 83-line failure class).');
        }
      }
    }
  } catch (densityErr) {
    tridentLog('WARN', 'wave-dispatch', 'the density-memory check failed (non-fatal): ' + (densityErr instanceof Error ? densityErr.message : String(densityErr)));
  }

  // ═══ THE TMP-DIR RESOLUTION — THE FOOTGUN REMOVAL (2026-08-16 — the W3
  // fix, the operator: "this one should be a simple fix no? one line change?").
  // THE OLD: `resolveTmpDir(typeof args.dispatchDir === 'string' ? args.dispatchDir : opts.tmpDir)` —
  // the wave manager HONORED a model-passed dispatchDir arg → the GLM passed
  // dispatchDir=/tmp/opencode → the manifests + prompt files landed OUTSIDE
  // the sanctioned TRIDENT_TMP_DIR → waveAgentExists (which reads
  // TRIDENT_TMP_DIR) found nothing → [WAVE MANDATE] blocked every dispatch.
  // THE NEW: ONLY the INTERNAL opts.tmpDir (the plugin wiring + the tests'
  // sandbox) is honored — the model can NEVER write outside the sanctioned
  // tmp. The dispatchDir arg is removed from the schema below. ═══
  const tmpDir = resolveTmpDir(opts.tmpDir);
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
    requestedWaveId: typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : null,
    generatedAt: new Date().toISOString(),   // GENERATION time — never 'dispatchedAt' (the generator does NOT dispatch; the 2026-08-12 bug-report's fiction fix)
    agents: [],
  };

  // ── STEP 2 — THE SHADOW PIPELINE (per agent — the v7.3 machinery) ──
  // ═══ THE BOUNDED-CONCURRENCY GENERATION (2026-08-09 — the plutus forensics:
  // the all-at-once Promise.allSettled put N simultaneous 384K requests on the
  // shared provider — the queue pushed the stragglers past the stall window
  // (5/10 generations failed: SHADOW_BRAIN_HTTP_500 ×2 + SHADOW_BRAIN_TIMEOUT
  // ×3 — the per-call lottery against the same flaky endpoint). The INTELLIGENT
  // async (the operator's law: "async/parallel is the DEFAULT... INTELLIGENT
  // async systems"): a bounded pool keeps the wave's total ≈ the slowest agent
  // AND caps the self-inflicted provider load. THE CALIBRATION (the operator's
  // ruling 2026-08-13: "raise this limit to 15"): CONCURRENT_GENERATIONS = 15 —
  // a 12-agent wave generates in ONE slice; the cap still bounds the 25-agent
  // maximum (the schema's cap) to two slices. The per-agent telemetry
  // (startedAt/finishedAt/durationMs) makes the async-parallel PROVABLE in the
  // returned output (the forensics' fix #1). Each agent's failures land in the
  // manifest's failed list + the ERROR-* files (never a silent skip). ═══
  const CONCURRENT_GENERATIONS = 15;
  // THE WAVE LEDGER (2026-08-21 — the operator's hybrid: ONE RpmLedger shared
  // by every ShadowAgent in this wave — the wave-aware RPM budget. A sibling's
  // observed 429 exiles nvidia for ALL agents for 45s; the bucket gate skips
  // dry rungs without burning requests; expiry re-admits automatically.)
  const waveLedger = new RpmLedger(waveId);
  const generated: Array<{ spec: AgentSpec; prompt: string; notes: string[]; startedAt: string; finishedAt: string; durationMs: number }> = [];
  const generationFailures: Array<{ name: string; error: string; startedAt?: string; durationMs?: number }> = [];
  const runOne = async (spec: AgentSpec): Promise<void> => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let result: PromptGeneratorResult;
    try {
      result = generator
        ? await generator(spec)
        : await shadowGenerate(spec, tmpDir, {
            // THE PER-AGENT TETHER (2026-08-21 — the operator: "EACH FUCKING
            // SHADOW AGENT THAT IS SPAWNED FOR A FUCKING TEMPLATE IS ITS OWN
            // FUCKING SESSION/PID IN PI. YOU DONT FUCKING SLOP THEM TOGETHER
            // IN ONE SESSION!!!!!!"): every agent in the wave gets a DISTINCT
            // sessionKey = <waveId>-<agent name> → DISTINCT projectId = the
            // wave id → a REAL ShadowMemory root per agent + a REAL sidecar
            // record per agent → ZERO shared-sqlite write contention → TRUE
            // async-parallel (total ≈ the slowest agent). Before this fix the
            // tether was NEVER passed → ALL agents fell back to the ONE
            // global session key → ONE memory DB → the appendPrompts
            // serialized on the shared lock → the completion ladder
            // (3/6/8/15 min). THE BATCH MUST BE SEPARATED SESSIONS.
            tether: {
              sessionKey: waveId + '-' + spec.name,          // unique per agent
              projectId: waveId,                             // the wave scopes the project (waveId is already sanitized upstream)
              parentSessionId: mainSessionId ?? null,        // the real parent chain
              pid: process.pid,                              // same process, DIFFERENT session
            },
            ledger: waveLedger,
          });
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
    // THE AUTO-DISPATCH (2026-08-22 — the operator: "agents start appearing
    // under the tool literally as generation is still ongoing"): each completed
    // agent is dispatched IMMEDIATELY via taskDispatch. No separate
    // action=dispatch call needed. Same waveId, same tracking.
    if (opts?.taskDispatch) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const v = validateTaskPromptLines(content);
        if (!v.passed) {
          tridentLog('WARN', 'wave-dispatch', 'auto-dispatch skipped for ' + spec.name + ': DPL1 validation failed — ' + v.lines.join(' | '));
        } else {
          const dr = await opts.taskDispatch({
            description: spec.name,
            prompt: content,
            subagent_type: resolveSubagentType(spec.template),
            background: true,
          });
          autoSessionIds[spec.name] = dr.sessionId;   // propagated to the result + check-in
          tridentLog('INFO', 'wave-dispatch', 'AUTO-DISPATCHED ' + spec.name + ' → sessionId=' + dr.sessionId);
        }
      } catch (dErr) {
        tridentLog('ERROR', 'wave-dispatch', 'auto-dispatch failed for ' + spec.name + ': ' + (dErr instanceof Error ? dErr.message : String(dErr)));
      }
    }
  };
  // THE BOUNDED POOL: the specs process in slices of CONCURRENT_GENERATIONS;
  // the per-slice allSettled keeps the per-unit failure capture (the runs
  // never reject — the failures land in the generationFailures list inside
  // runOne; the .catch is the defensive net).
  // THE AUTO-DISPATCH SESSION LEDGER (2026-08-23): name → child sessionId, filled
  // by runOne's auto-dispatch — merged into result.dispatched + the check-in so
  // the orchestrator sees WHERE each agent landed without a status round-trip.
  const autoSessionIds: Record<string, string> = {};
   const specsQueue = [...specs];
  while (specsQueue.length > 0) {
    const slice = specsQueue.splice(0, CONCURRENT_GENERATIONS);
    await Promise.allSettled(slice.map(async (spec, idx) => {
      // THE 1-3s START STAGGER (2026-08-21 — the operator: "there should also
      // be a 1-1.5s split between each concurrent shadow agents gen so that
      // all the concurrent calls dont hit at the exact same ms. can even be a
      // 1-3s split - every call instantly hitting at the same ms will
      // unnecessarily cause 429s"): the old 3-17ms stagger put all N agents'
      // FIRST LLM calls inside one 17ms window — a simultaneous burst that
      // instant-trips the shared nvidia 40-RPM bucket and shoves every agent
      // onto the slower fallback rungs for the whole wave. The 1-3s per-agent
      // split spaces the burst across seconds so the primary rung absorbs it.
      if (idx) await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
      try {
        await runOne(spec);
      } catch (reason) {
        const msg = reason instanceof Error ? reason.message : String(reason);
        tridentLog('ERROR', 'wave-dispatch', 'generation threw for ' + spec.name + ': ' + msg);
        generationFailures.push({ name: spec.name, error: msg });
      }
    }));
  }
  // THE RETRY PASS (2026-08-22 — the saturation finding: 8 concurrent agents
  // can transiently saturate ALL free-tier rungs at once — zen stream-ends,
  // nvidia/openrouter starved lanes, inferx quota — producing loud fails that
  // are TRANSIENT, not permanent. After a 30s cool-down, re-run every failed
  // agent ONCE through the same pipeline. The ledger's exile TTLs will have
  // expired; the providers will have recovered. Still bounded: ONE retry pass,
  // never an infinite loop.)
  if (generationFailures.length > 0) {
    const failedSpecs = specs.filter((s) => generationFailures.some((f) => f.name === s.name));
    // CLEAR the stale failure entries first — the retry's own runOne pushes
    // fresh ones if it fails again (no duplicate listings).
    const retriedNames = new Set(failedSpecs.map((s) => s.name));
    for (let i = generationFailures.length - 1; i >= 0; i--) {
      if (retriedNames.has(generationFailures[i].name)) generationFailures.splice(i, 1);
    }
    console.error('[wave-dispatch] RETRY PASS — ' + failedSpecs.length + ' failed agent(s) re-running after cool-down');
    await new Promise((r) => setTimeout(r, opts?.retryPassMs ?? 30_000));
    for (const spec of failedSpecs) {
      try {
        await runOne(spec);
      } catch (reason) {
        const msg = reason instanceof Error ? reason.message : String(reason);
        tridentLog('ERROR', 'wave-dispatch', 'RETRY also failed for ' + spec.name + ': ' + msg);
      }
    }
    console.error('[wave-dispatch] RETRY PASS complete — ' + generated.length + '/' + specs.length + ' agents ready');
  }
  // THE LEDGER WAVE SUMMARY (the observability feed — the operator: "where are
  // the logs?"): per-provider admissions/tokens/exiles/429 counts for the WHOLE
  // wave, logged once at generation end.
  console.error('[rpm-ledger] WAVE SUMMARY ' + waveId, JSON.stringify(waveLedger.snapshot()));

  // THE SPEC RESET (2026-08-22 — the self-contained preflight): after successful
  // generation, reset the spec file to the clean template shell so the next
  // wave starts fresh. The model fills it in again for the next batch.
  if (fs.existsSync(specFilePath)) {
    const { resetToTemplate } = await import('./wave-spec.ts');
    resetToTemplate(scopeRoot);   // THE SESSION-SCOPED reset (2026-08-24) — resets THIS codebase's spec, never another session's
    console.error('[wave-spec] RESET to template shell — next wave starts fresh');
  }

  for (const { spec, prompt, startedAt, durationMs } of generated) {
    manifest.agents.push({
      name: spec.name,
      type: resolveSubagentType(spec.template),
      lines: prompt.split('\n').length,
      sha256: createHash('sha256').update(prompt).digest('hex'),
      // THE HONEST LIFECYCLE STATE (2026-08-12 — the bug-report's §3 fix): the
      // agent is 'ready' — the generator does NOT spawn; the old 'running' +
      // startedAt/finishedAt/durationMs were shadow-generation timings dressed
      // as agent-run telemetry (fiction frozen as 'running' on a never-
      // dispatched wave). The timing is now honestly named generation telemetry.
      status: 'ready',
      generatedAt: startedAt,          // the ISO generation start
      generationMs: durationMs,        // the wall-clock generation time
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
    // THE AUTO-DISPATCH PROPAGATION (2026-08-23 — the live-session finding:
    // agents WERE auto-dispatched (the engine log proved it) but the return
    // carried sessionId:'' — the orchestrator couldn't see where agents landed.
    const autoSid = autoSessionIds[spec.name] ?? '';
    dispatched.push({
      name: spec.name,
      sessionId: autoSid,
      type: spec.template.startsWith('B') ? 'trident_build' : 'trident_explore',
      status: autoSid ? 'running' : 'ready',
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
      requestedWaveId: typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : null,
      generatedAt: new Date().toISOString(),   // GENERATION time — never 'dispatchedAt' (the generator does NOT dispatch)
      agents: [manifest.agents[i]],
    };
    try {
      fs.writeFileSync(path.join(tmpDir, '.wave-manifest-' + waveId + '-' + g.spec.name + '.json'), JSON.stringify(oneAgentRecord, null, 2), 'utf-8');
    } catch (pErr) {
      tridentLog('WARN', 'wave-dispatch', 'the per-agent manifest write failed for ' + g.spec.name + ': ' + (pErr instanceof Error ? pErr.message : String(pErr)));
    }
  }
  // THE WAVE-DISPATCH REGISTRY (2026-08-10 — THE WAVE_BATCH FALSE-POSITIVE
  // CLASS fix + the 2026-08-12 TRANSACTIONAL fix — BUGREPORT
  // wave-manager-dispatch-authorization.md): the per-call hook CANNOT observe
  // the message's sibling task parts. The batch-ness is enforced by the
  // ATOMIC registry — a STATE MACHINE now (wave-registry.ts): { wave, total,
  // calls: [{key, status: recorded|accepted|failed}], windowStart, status:
  // ready|dispatching|dispatched }. The gate's synchronous read-modify-write
  // is atomic on the event loop; a runtime-REJECTED dispatch (the after-hook
  // marks the call 'failed') is RE-FIREABLE — the authorization is never
  // consumed by a failed attempt. THE WINDOW opens on the FIRST DISPATCH CALL
  // (windowStart: null here — the gate sets it), never on the generation.
  createWaveRegistry(tmpDir, waveId, generated.length);

  // ── STEP 6 — THE TRACKER + THE WAVE ROW ──
  const respawnWaveId = typeof args.waveId === 'string' ? args.waveId : opts.waveId ?? null;
  // THE RESPAWN-vs-FRESH GATE (2026-08-13 — the container found it: the waveId
  // arg was the respawn anchor UNCONDITIONALLY — a FRESH generation with a
  // waveId hit the respawn path → respawnAgent on a NON-EXISTENT wave →
  // warnRespawnMiss → NO registerWave → NO tracker row → NO persistence → the
  // wave-status saw "unknown_wave". THE FIX: the respawn path engages ONLY
  // when the wave ALREADY EXISTS in the tracker — a new waveId registers FRESH
  // (the tracker row + the persistence file are ALWAYS written).
  const existingWaveForRespawn = respawnWaveId ? WaveTracker.getWave(respawnWaveId) : null;
  if (respawnWaveId && existingWaveForRespawn) {
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
      alias: requestedAlias || undefined,
      projectToken: typeof args.projectToken === 'string' && args.projectToken.trim().length > 0 ? args.projectToken.trim() : undefined,
      names: specs.map((s) => s.name),
      sessionIds: dispatched.map((d) => d.sessionId),
      dispatchedAt: Date.now(),
      etaMs: etaPlaceholderMs,
      etaConfidence: 0,
      // F3 (2026-08-14 — THE DENSITY MEMORY): the per-agent context-arg char
      // totals — the snapshot that the regeneration's density check compares
      // against (the class-2 thin-args-collapse fix).
      argSnapshot: Object.fromEntries(specs.map((s) => {
        const total = (s.mission || '').length + (s.knownContext || '').length + (s.doctrine || '').length +
          (s.measurements || '').length + (s.acceptance || '').length + (s.taskTargets || '').length + (s.position || '').length;
        return [s.name, total];
      })),
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
  // THE AUTO-DISPATCH CHECK-IN (2026-08-23 — the live-session finding: agents
  // were auto-dispatched but the check-in still ordered a MANUAL action=dispatch
  // — the orchestrator re-dispatched or stalled on dead guidance). When any
  // agent auto-dispatched, the check-in states THAT reality + the session ids.
  const finalCheckIn = Object.keys(autoSessionIds).length > 0
    ? 'WAVE ' + waveId + ' (' + dispatched.length + ' agents) — AUTO-DISPATCHED '
      + Object.keys(autoSessionIds).length + '/' + generated.length
      + ' as generation completed (sessions trickling back): '
      + Object.entries(autoSessionIds).map(([n, s]) => n + '→' + s).join(', ')
      + '. Track via trident-wave-manager action=status waveId=' + waveId
      + (generated.length - Object.keys(autoSessionIds).length > 0
        ? '. NOT dispatched: ' + dispatched.filter((d) => !d.sessionId).map((d) => d.name).join(', ') + '.' : '.')
    : buildCheckInText(waveId, dispatched.length, etaPlaceholderMs);
  // THE BUDGET TICK (2026-08-23 — v3 semantics, the operator: "waves should
  // not be consumed until the agents are actually dispatched"): consumed HERE
  // and ONLY here — after the wave produced dispatched agents. Refused calls
  // (thin specs, validation failures) burned zero budget by construction.
  if (mainSessionId && dispatched.length > 0) {
    try {
      // THE SESSION-SCOPED BUDGET TICK (2026-08-24): the plan + state resolve
      // under scopeRoot — the SAME codebase root as the spec, so a concurrent
      // session's budget is never touched.
      recordWaveServed(mainSessionId,
        path.join(scopeRoot, '.trident', 'wave-planning-state.json'),
        path.join(scopeRoot, '.trident', 'wave-plan.md'),
        typeof args.planningNote === 'string' ? args.planningNote.trim() : '');
    } catch (wErr) {
      tridentLog('WARN', 'wave-dispatch', 'the budget tick failed (non-fatal): ' + (wErr instanceof Error ? wErr.message : String(wErr)));
    }
  }
  // THE BATCH FORM — THE PROMPTFILE-ONLY PAYLOAD (2026-08-14 — the operator's
  // exact spec: "THE PROMPTFILE SHOULD LITERALLY BE PASSED AS THE PROMPT
  // VERBATIM NO PLACEHOLDER GARBAGE"). The batch entries carry ONLY the
  // dispatch metadata + the promptFile PATH — there is NO prompt field at all
  // (the old placeholder was the GLM derailment fuel: the model saw a prompt
  // field and tried to reproduce/expand it). The T.E.B. loader hook
  // (trident-hooks.ts:1741 — idTool === 'task' → loadPromptFileForDispatch)
  // intercepts the task call, reads the promptFile's bytes, and MUTATES the
  // args in place: promptFile → prompt (the byte-exact content) BEFORE the
  // tool executes. The model NEVER sees any prompt text — only the path.
  const batchForm: WaveDispatchResult['batch'] = {
    tool: 'batch',
    parameters: {
      tools: dispatched.map((d) => ({
        tool: 'task',
        parameters: {
          description: d.name,
          // ═══ THE PATH-STRING CARRIER (2026-08-16 — the operator's exact spec:
          // "the promptFile is just the val of the prompt arg now dont aff more
          // degenerate fuel"). THE BATCH FORM CARRIES ONE FIELD: prompt = the
          // path string. NO promptFile field — TWO fields was MORE degenerate
          // fuel (the model confused which to use). The T.E.B. loader detects
          // the INPUT VAL on the prompt arg IS a promptFile path (an existing
          // path inside TRIDENT_TMP_DIR), reads the file, does the normal
          // mutation (prompt = byte-exact content + background:true). The
          // machine fires on the VAL directly, not on a specific arg name. ═══
          prompt: path.join(tmpDir, d.name + '.md'),
          subagent_type: d.type,
        },
      })),
    },
  };
  // THE GENERATION TELEMETRY (2026-08-09 — the forensics' fix #1; RENAMED
  // 2026-08-24 — the live hallucination bug): the per-agent PROMPT-GENERATION
  // timings only. The OLD top-level name `telemetry` + fields
  // {finishedAt, durationMs, status:'ok'} were READ BY SESSIONS AS AGENT-RUN
  // COMPLETION ("telemetry shows it already finished (376s, status ok)" — the
  // operator's live catch) — orchestrators started verifying phantom-finished
  // work the second the dispatch landed. THE FIX: the field is
  // `generationTelemetry` (impossible to misread) + every agent carries
  // `agentStatus: 'dispatched'` (the run state lives in the SESSION STREAM —
  // action=status / trident-wave-read — NEVER here).
  const generationTelemetry: Record<string, { startedAt: string; finishedAt?: string; durationMs?: number; status: 'generated' | 'generation-failed'; agentStatus: 'dispatched' }> = {};
  for (const g of generated) {
    generationTelemetry[g.spec.name] = { startedAt: g.startedAt, finishedAt: g.finishedAt, durationMs: g.durationMs, status: 'generated', agentStatus: 'dispatched' };
  }
  for (const f of generationFailures) {
    generationTelemetry[f.name] = { startedAt: f.startedAt ?? new Date().toISOString(), durationMs: f.durationMs, status: 'generation-failed', agentStatus: 'dispatched' };
  }
  return {
    wave: waveId,
    dispatched,
    failed,
    tmpDir,
    checkIn: finalCheckIn + (densityWarnings.length > 0 ? '\n\n' + densityWarnings.join('\n') : ''),
    generationTelemetry,
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
  steered: Array<{ taskId: string; sessionId: string; mode: 'soft' | 'hard'; verified: boolean; delivered?: boolean; reason?: string; call?: { tool: 'task'; parameters: Record<string, unknown> } }>;
  checkIn: string;
}

// THE CONTINUATION (the resume instruction — the session's own context carries
// the original prompt + the partial work; the single word is enough — the
// operator's edit: "literally just continue is enough, dont overthink this").
function resumeContinuation(name: string): string {
  return 'continue';
}

// THE SESSION PROBE (the readonly row + the title + the agent type — the name
// token's source). THE TYPE DETECTION (2026-08-24 — the resume-subagent-type
// bug fix): the wave-dispatched sessions carry their agent type in the title
// suffix (`-trident_build-subagent` / `-trident_explore-subagent`). This keeps
// resume steering into the session with the CORRECT type — never a hardcoded
// trident_build that mis-spawns explore agents as build.
export function resumeSessionInfo(taskId: string): { title: string; subagentType: 'trident_explore' | 'trident_build' } | null {
  try {
    const resumeDbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(resumeDbPath)) return null;
    const resumeDb = new Database(resumeDbPath, { readonly: true });
    try {
      const resumeRow = resumeDb.query('SELECT id, title FROM session WHERE id = ?').get(taskId) as { id?: string; title?: string } | undefined;
      if (!resumeRow || !resumeRow.id) return null;
      const title = typeof resumeRow.title === 'string' && resumeRow.title.trim().length > 0 ? resumeRow.title : taskId;
      // THE TYPE DETECTOR (2026-08-24 — the live build-agent catch): the RAW
      // session title carries the native task tool's paren format
      // `(@trident_build subagent)` — NOT just the sanitized hyphenated form
      // `-trident_build-subagent`. ONE regex, both shapes, first-match token
      // extraction. (The regex IS the right tool here per the ISE law: the
      // input is a runtime DB TITLE STRING — no AST exists to parse; this is
      // the detection layer only, the caller's DB row is the evidence triad.)
      const TYPE_TOKEN_RE = /\b(trident_build|trident_explore)\b/i;
      const m = TYPE_TOKEN_RE.exec(title);
      const subagentType = (m?.[1]?.toLowerCase() === 'trident_build' ? 'trident_build' : 'trident_explore') as 'trident_build' | 'trident_explore';
      return { title, subagentType };
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
  const steered: WaveResumeResult['steered'] = [];
  for (let i = 0; i < unique.length; i++) {
    const tid = unique[i];
    const fallbackName = typeof names[i] === 'string' && names[i].trim().length > 0 ? names[i].trim() : 'resume-' + (i + 1);
    let title = fallbackName;
    let ok = false;
    let sessionType: 'trident_explore' | 'trident_build' = 'trident_explore';
    try {
      const info = resumeSessionInfo(tid);
      if (info) {
        ok = true;
        if (info.title !== tid) title = info.title;
        sessionType = info.subagentType;   // THE CORRECT TYPE (2026-08-24 — never hardcode)
      }
    } catch (e) { /* the verified:false below */ }
    const safeTitle = title.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    resumed.push({
      taskId: tid,
      name: safeTitle,
      verified: ok,
      reason: ok ? undefined : 'the session row absent/unreadable — the resume excluded (the fresh generate may be needed for this agent)',
    });
    if (ok) {
      try {
        const steerResult = await executeWaveSteer(tid, resumeContinuation(safeTitle), { mode: 'soft', subagentType: sessionType });
        // THE DB STATE SYNC (2026-08-24 — the operator: "if a killed wave is
        // resumed obviously this should be updated then in the db properly"):
        // a delivered resume flips the owning agent back to running + un-
        // archives the wave row — the kill/status surfaces see the LIVE truth
        // (a streaming session under a 'killed' record is a zombie row).
        if (steerResult.delivered) {
          try {
            const owner = WaveTracker.findWaveBySession(tid);
            if (owner) WaveTracker.markResumed(owner.wave, owner.agent);
          } catch (tErr) {
            tridentLog('WARN', 'wave-dispatch', 'resume tracker sync failed for ' + tid + ': ' + (tErr instanceof Error ? tErr.message : String(tErr)));
          }
        }
        steered.push({ taskId: tid, sessionId: tid, mode: 'soft', verified: true, delivered: steerResult.delivered, reason: steerResult.delivery?.error, call: steerResult.call });
      } catch (e) {
        steered.push({ taskId: tid, sessionId: tid, mode: 'soft', verified: false, reason: e instanceof Error ? e.message : String(e) });
      }
    } else {
      steered.push({ taskId: tid, sessionId: tid, mode: 'soft', verified: false, reason: 'the session row absent/unreadable — the resume excluded' });
    }
  }
  const verifiedCount = resumed.filter((r) => r.verified).length;
  const steeredCount = steered.filter((s) => s.verified).length;
  return {
    action: 'resume',
    resumed,
    steered,
    checkIn: 'RESUME CHECK-IN: ' + verifiedCount + '/' + resumed.length + ' sessions verified — the manager STEERED the continue into ' + steeredCount + ' session(s) directly (no batch form). The session probe + the steer (the task_id form) passed the dispatch firewalls via the resume-channel exemption. The resumed sessions reload their original prompts + their partial work from the session parts — the continuation tells each agent to verify the completed work + continue. ' + (resumed.length - verifiedCount > 0 ? 'EXCLUDED: ' + resumed.filter((r) => !r.verified).map((r) => r.taskId).join(', ') + ' (the session rows absent — regenerate via the generate action).' : ''),
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
  mode: 'soft' | 'hard';
  verified: boolean;
  /** THE ACTUAL DELIVERY (2026-08-24 — the EN-160 fix): true when the steer
   *  message was REALLY injected into the session's stream via
   *  client.session.promptAsync — the SAME proven channel the skill's manual
   *  `task({task_id, prompt, subagent_type})` kick uses. NO MORE non-delivering
   *  stub that required the orchestrator to re-dispatch. */
  delivered: boolean;
  delivery?: { channel: string; agent: string; error?: string };
  reason?: string;
  call: { tool: 'task'; parameters: { task_id: string; prompt: string; description: string; subagent_type: string } };
  checkIn: string;
}

export async function executeWaveSteer(
  sessionId: string,
  prompt: string,
  opts: { mode?: 'soft' | 'hard' | 'queue' | 'interrupt'; subagentType?: string } = {},
): Promise<WaveSteerResult> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw new Error('[STEER] sessionId is required — the subagent session to steer');
  }
  const text = (prompt || '').trim();
  if (text.length === 0) {
    throw new Error('[STEER] prompt is required — the steer message (any text)');
  }
  // THE TWO MODES (2026-08-24 — the operator: "steer needs 2 modes - soft/
  // hard. hard interrupts and then sends the chat message. soft lets the chat
  // message send and sit in queue normally"). HARD = the double-esc
  // equivalent (abort the in-flight generation, THEN deliver). Legacy aliases
  // map: 'queue'→soft, 'interrupt'→hard.
  const hard = opts.mode === 'hard' || opts.mode === 'interrupt';
  const mode: 'soft' | 'hard' = hard ? 'hard' : 'soft';
  const info = resumeSessionInfo(sessionId);   // the existing session probe (the title = the name token)
  const safeTitle = info && info.title !== sessionId
    ? info.title.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : 'steer';
  // THE SUBAGENT TYPE (2026-08-24 — the EN-160 fix): the steer carries the
  // session's OWN type (derived from the title suffix); a nil opts defaults to
  // explore — never a hardcoded trident_build that mis-spawns explore agents.
  const subagentType = opts.subagentType === 'trident_build' ? 'trident_build' : 'trident_explore';
  const call = {
    tool: 'task' as const,
    parameters: { task_id: sessionId, prompt: text, description: 'steer-' + safeTitle, subagent_type: subagentType },
  };
  // ═══ THE REAL DELIVERY (2026-08-24 — the EN-160 fix + the operator's live
  //  catch): inject the message into the existing session's stream via
  //  client.session.promptAsync — WITH THE SESSION'S OWN AGENT PINNED IN THE
  //  BODY (agent: subagentType, DYNAMICALLY derived from the session row —
  //  never hardcoded, never the runtime default). The live test proved the
  //  bare agent-less promptAsync FLIPS the session to vanilla Build — the
  //  July Bug #3 class (the agent overwrite). The body-level agent field is
  //  the native task tool's own resume mechanism (task.ts:195).
  //  HARD MODE = the double-esc equivalent: client.session.abort FIRST (the
  //  SDK's real "Abort a session" — cancels the in-flight generation), a beat,
  //  then the message lands. SOFT = queue semantics, no abort. ═══
  let delivered = false;
  let delivery: { channel: string; agent: string; error?: string } | undefined;
  if (!info) {
    delivery = { channel: 'none', agent: subagentType, error: 'session row absent — the steer cannot target it' };
  } else {
    try {
      const client = getOpencodeClient();
      if (client && typeof client?.session?.promptAsync === 'function') {
        if (hard) {
          // THE INTERRUPT (the operator: "pause needs to literally interrupt
          // the fucking agent. same action as when i double esc on host"):
          // abort the in-flight generation first — the session's stream
          // cancels, then the message arrives into the freed loop.
          try {
            if (typeof client.session.abort === 'function') {
              await client.session.abort({ path: { id: sessionId } });
            }
          } catch (aErr) {
            tridentLog('WARN', 'wave-dispatch', 'hard-steer abort (pre-delivery) failed for ' + sessionId + ': ' + (aErr instanceof Error ? aErr.message : String(aErr)) + ' — delivering anyway');
          }
          await new Promise((r) => setTimeout(r, 300));   // the abort's beat
        }
        await client.session.promptAsync({
          path: { id: sessionId },
          body: {
            agent: subagentType,   // THE SESSION'S OWN AGENT — dynamic, never vanilla Build
            parts: [{
              type: 'text',
              text: text,
            }],
          },
        });
        delivered = true;
        delivery = { channel: hard ? 'abort+promptAsync' : 'promptAsync', agent: subagentType };
      } else {
        delivery = { channel: 'none', agent: subagentType, error: 'client.session.promptAsync unavailable — the runtime lacks the resume delivery surface' };
      }
    } catch (dErr) {
      delivery = { channel: hard ? 'abort+promptAsync' : 'promptAsync', agent: subagentType, error: dErr instanceof Error ? dErr.message : String(dErr) };
      tridentLog('WARN', 'wave-dispatch', 'steer promptAsync delivery failed for ' + sessionId + ': ' + (delivery.error ?? ''));
    }
  }
  return {
    action: 'steer', sessionId, mode,
    verified: Boolean(info),
    delivered,
    delivery,
    reason: info ? undefined : 'the session row absent/unreadable — the steer cannot target it (the session may have ended)',
    call,
    checkIn: 'STEER CHECK-IN: ' + (info ? '' : 'UNVERIFIED — ') + mode.toUpperCase() + ' steer into ' + sessionId +
      (delivered
        ? '. DELIVERED as agent ' + subagentType + ' via ' + (delivery?.channel ?? 'promptAsync') + '.' + (hard ? ' The in-flight generation was interrupted first (the double-esc equivalent); the message is next.' : ' The message queues — the agent processes it after its current tool call.')
        : '. NOT DELIVERED — ' + (delivery?.error ?? 'the delivery failed') + '. This is a REAL failure, not a stub to dispatch.'),
  };
}

// ═══ THE TOOL FACTORY (registered in trident-tools.ts — the front-end FREEZE:
// the agents array shape identical to the retired trident-task-preflight) ═══

export function createWaveManagerTool() {
  return tool({
    description: 'THE ONLY SUBAGENT DISPATCH PATH — THE SPEC FILE IS THE ONLY INPUT. Edit .trident/wave-spec.json to fill in your agent roster (the template has EXPLICIT instructions per field with char floors), then call action=generate with ZERO other args. The tool reads the file, validates every field, and proceeds or returns compiler-style diagnostics naming exactly what to fix. WORKFLOW: (1) load the wave-planning skill on your FIRST generate of a session, (2) edit .trident/wave-spec.json with your full roster (2–4x floors with real context), (3) call action=generate — preflight is BUILT IN. NEVER spawn subagents via any other tool. NEVER split into one-agent-per-call. After generation completes, agents are AUTO-DISPATCHED immediately — no separate dispatch call needed.',


    args: {
      // THE SPEC FILE IS THE ONLY INPUT (2026-08-22): no inline agents param.
      // The model edits .trident/wave-spec.json and calls generate.
      planningNote: z.string().optional().describe('THE PLANNING LATCH — one line: the wave purpose + N agents + template mix. Required on the FIRST generate of a session; the wave-planning skill explains the full contract.'),
      expectedCount: z.number().int().positive().optional().describe('THE COUNT CONTRACT — set in .trident/wave-spec.json as expectedCount field. If mismatch with actual agent count, LOUD refusal.'),
      waveId: z.string().optional().describe('THE RESPAWN ANCHOR — pass the waveId of the wave whose agent you are respawning (the tracker updates the EXISTING wave in place — never a new wave).'),
      model: z.string().optional().describe('The per-wave model override (optional).'),
      provider: z.string().optional().describe('The per-wave provider override (optional).'),
      // THE dispatchDir ARG — REMOVED (2026-08-16 — the W3 footgun fix, the
      // operator: "the model can NEVER write outside the sanctioned
      // TRIDENT_TMP_DIR"). The model CANNOT pass a tmp-dir override — the
      // internal opts.tmpDir (the plugin wiring + the tests' sandbox) is the
      // only channel.
      // THE SINGLE-AGENT PARAMS — REMOVED (2026-08-22 — the ONLY-input-file
      // enforcement): template/filepaths/mission/knownContext/doctrine/
      // measurements/acceptance/taskTargets/position/context/outputName are
      // GONE from the schema. The model's ONLY input is .trident/wave-spec.json.
      action: z.enum(['generate', 'dispatch', 'status', 'kill', 'kill-wave', 'steer', 'pause', 'resume', 'release']).describe('THE SINGLE CONTROL SURFACE (2026-08-13 — the ONE-tool consolidation; the old trident-wave-status + trident-wave-steer are FOLDED IN): generate (ZERO args — the wave GENERATOR reads .trident/wave-spec.json as THE ONLY INPUT; the shadow pipeline → the prompt files → auto-dispatch per completed agent; the manifest + the tracker registration), dispatch (waveId — read the generate files and spawn via extra.taskDispatch; the vanilla TaskTool.execute; no model transcription), status (waveId or sessionId — for a sessionId, returns the LIVE session stream: the raw session truth + the live flag, NO generation noise; for a waveId, returns the tracker\'s COMPACT per-wave/per-agent summary — the full tails with verbose:true. THE TASK_STATUS WARNING: the task_status tool reports the background-JOB state — NOT session liveness; for \'is this subagent alive\' use status+sessionId (or the dedicated trident-wave-read tool), NEVER task_status), kill (sessionId, or agent+waveId — the destructive abort; session-scoped needs no waveId), kill-wave (waveId — abort all + archive), steer (sessionId+prompt+REQUIRED mode soft|hard — soft queues the message; hard interrupts the in-flight generation first, then delivers), pause (waveId or sessionId — the PURE INTERRUPT: session.abort, NO chat message; waveId pauses the whole wave, sessionId pauses ONE session; resume re-activates), resume (taskIds OR waveId — taskIds resumes specific sessions; waveId (with no taskIds) resumes EVERY agent of the wave, resolved from the active tracker OR the archive — a kill-wave:d wave resumes whole; each delivered resume flips the row to running + un-archives), release (waveId — reset the dispatch authorization). THIS FIELD IS MANDATORY — every call MUST pass a specific action; there is NO default. An omitted action is a BLOCKED call.'),
      taskIds: z.array(z.string()).optional().describe('THE RESUME ANCHORS — the interrupted sessions\' task ids (from the EMPTY task returns or the wave-status\'s collected resume ids in .trident/resume-ids.json). An EMPTY task return = the provider interrupted the agent — resume it, never regenerate.'),
      names: z.array(z.string()).optional().describe('The name tokens for the resume form\'s descriptions (the session row\'s title overrides when available) — so the resumed agents are distinguishable.'),
      agent: z.string().optional().describe('action=kill: the single agent name to abort.'),
      sessionId: z.string().optional().describe('action=status/steer: the subagent session id (the task_id) to inspect/steer.'),
      reason: z.string().optional().describe('The kill/pause reason (default ORCHESTRATOR_ABORT).'),
      verbose: z.boolean().optional().describe('action=status: true returns the full tails/parts; the default is the COMPACT summary (the anti-context-bloat).'),
      prompt: z.string().optional().describe('action=steer: the steering message to send into the session.'),
      mode: z.enum(['soft', 'hard']).describe('STEER-ONLY PARAMETER — valid on action=steer and NOTHING else (generate/pause/kill/resume/status/dispatch have NO mode — their targeting is all-vs-session, never soft/hard). On steer it is REQUIRED, no default: soft (the message queues — the agent processes it after its current tool call) or hard (the in-flight generation is interrupted FIRST — the double-esc equivalent — then the message delivers). A steer call without a mode is a BLOCKED call; a non-steer call WITH a mode is a BLOCKED call.'),
      projectToken: z.string().optional().describe('The project token for the wave — the wave\'s project context (stored on the wave row for the clean per-project access + the anti-slop logs).'),
    },
    execute: async (
      args: Record<string, unknown>,
      context: { sessionID?: string; extra?: { taskDispatch?: TaskDispatchFn } },
    ): Promise<{ title: string; output: string }> => {
      const mainSessionId = (context && typeof context.sessionID === 'string' && context.sessionID) || null;
      if (typeof args.action !== 'string' || (args.action as string).trim().length === 0) {
        // THE ACTION INFERENCE v2 (2026-08-22 — the ONLY-input-file redesign):
        // generate now takes ZERO args (the spec file is the input), so an
        // omitted action with NO management-shaped args unambiguously means
        // generate — infer it. A call carrying sessionId/prompt/taskIds/
        // agent/reason without an action is AMBIGUOUS (status? steer? resume?)
        // and still refuses loudly — no guessing on management verbs.
        const mgmtShaped = ['sessionId', 'prompt', 'taskIds', 'agent', 'reason'].some(
          (k) => typeof (args as Record<string, unknown>)[k] === 'string' || Array.isArray((args as Record<string, unknown>)[k]),
        );
        if (!mgmtShaped) {
          args = { ...args, action: 'generate' };
          tridentLog('WARN', 'wave-dispatch', 'action omitted with zero-input shape — inferred action=generate (the spec file is the only input)');
        } else {
          throw new Error('[WAVE] action is MANDATORY — pass action="generate" | "dispatch" | "status" | "kill" | "kill-wave" | "steer" | "pause" | "resume" | "release" (no default; an omitted action with sessionId/prompt/taskIds/agent/reason is an AMBIGUOUS BLOCKED call)');
        }
      }
      const action = args.action as string;
      // THE MODE-SPILLOVER GATE (steer is the ONLY soft/hard action):
      // generate/pause/kill/resume/status/dispatch have NO mode — their
      // targeting is all-vs-session. A mode on a non-steer call is spillover
      // from the steer surface; block it loudly so the caller re-fires clean.
      if (args.mode !== undefined && action !== 'steer') {
        throw new Error('[MODE] mode="' + args.mode + '" is STEER-ONLY — this call is action=' + action + ' which has NO mode (generate/pause/kill/resume target by waveId/sessionId/taskIds, never soft/hard). Re-fire action=' + action + ' WITHOUT the mode parameter.');
      }

      if (action === 'dispatch') {
        const result = await executeDispatch(
          args,
          { sessionID: mainSessionId || undefined, extra: context?.extra },
          {},
        );
        return {
          title: 'WAVE DISPATCH — ' + result.wave + ' — ' + result.dispatched.length + ' spawned',
          output: JSON.stringify(result, null, 2),
        };
      }

      if (action === 'release') {
        // THE RELEASE — the manual safety valve (2026-08-12 — BUGREPORT
        // wave-manager-dispatch-authorization.md): resets the wave's dispatch
        // authorization to the ready state so a wave whose dispatch attempt
        // was REJECTED by the runtime can be re-fired WITHOUT regenerating.
        const releaseWaveId = typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : '';
        if (!releaseWaveId) {
          throw new Error('[RELEASE] waveId is required — the wave whose dispatch authorization to reset (e.g. wave-1786556140247)');
        }
        // THE RELEASE TMP — the sanctioned default only (2026-08-16 — the W3
        // footgun fix: the dispatchDir arg is gone; the release acts on the
        // shared TRIDENT_TMP_DIR, never a model-passed override).
        const releaseTmp = resolveTmpDir(undefined);
        const released = releaseWaveRegistryFile(releaseTmp, releaseWaveId);
        if (!released) {
          throw new Error('[RELEASE] no dispatch registry found for wave ' + releaseWaveId + ' — nothing to release (the wave may not exist or was pruned)');
        }
        return {
          title: 'WAVE RELEASE — ' + releaseWaveId + ' authorization reset to ready',
          output: JSON.stringify({ action: 'release', waveId: releaseWaveId, registry: released, checkIn: 'WAVE ' + releaseWaveId + ' RELEASED — the dispatch authorization was reset to the ready state. RE-DISPATCH the batch form (the task calls from the generation) as ONE message — the [WAVE BATCH] gate now ALLOWS the re-fire.' }, null, 2),
        };
      }
      if (action === 'resume') {
        let taskIds = Array.isArray(args.taskIds) ? (args.taskIds as string[]) : [];
        const names = Array.isArray(args.names) ? (args.names as string[]) : [];
        // THE RESUME-ALL MODE (2026-08-24 — the operator: "do these 3 have an
        // 'all' mode?"): pause + kill already had their wave-scoped forms
        // (waveId / kill-wave). Resume was taskIds-ONLY. NOW: a waveId with no
        // taskIds resolves EVERY agent's session from the tracker (ACTIVE
        // first, then the ARCHIVE — a kill-wave'd wave resumes from the
        // archive; markResumed un-archives it per agent) and resumes all.
        const resumeWaveId = typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : '';
        if (taskIds.length === 0 && resumeWaveId) {
          const w = WaveTracker.getWave(resumeWaveId) ?? WaveTracker.getArchive().find((x) => x.wave === resumeWaveId);
          if (!w) {
            throw new Error('[RESUME] no tracked or archived wave for ' + resumeWaveId + ' — pass taskIds directly, or check action=status');
          }
          taskIds = Object.values(w.agents)
            .map((a) => a.sessionIds[a.sessionIds.length - 1] || (a.taskIds && a.taskIds[a.taskIds.length - 1]) || '')
            .filter((s) => s.length > 0);
          if (taskIds.length === 0) {
            throw new Error('[RESUME] wave ' + resumeWaveId + ' has no resumable sessions (no session ids recorded)');
          }
        }
        const resumeResult = await executeWaveResume(taskIds, names);
        const verified = resumeResult.resumed.filter((r) => r.verified).length;
        return {
          title: 'WAVE RESUME — ' + verified + '/' + resumeResult.resumed.length + ' verified',
          output: JSON.stringify(resumeResult, null, 2),
        };
      }
      // ═══ THE FOLDED-IN CONTROL SURFACE (2026-08-13 — the ONE-tool
      // consolidation: the old trident-wave-status + trident-wave-steer are
      // gone — ALL the wave-management actions live HERE) ═══
      // THE SESSION-SCOPED KILL (2026-08-24 — the live gap: a RESUMED
      // session whose wave row is archived returns unknown_wave from the
      // wave-scoped kill — agent+waveId is unreachable. sessionId = the
      // direct destructive abort, mirroring the pause path's abort).
      if (action === 'kill' && typeof args.sessionId === 'string' && args.sessionId.trim().length > 0 && !args.waveId) {
        const killSid = args.sessionId.trim();
        const killInfo = resumeSessionInfo(killSid);
        let killAborted = false;
        try {
          const client = getOpencodeClient();
          if (client && typeof client?.session?.abort === 'function') {
            await client.session.abort({ path: { id: killSid } });
            killAborted = true;
          }
        } catch (kErr) {
          tridentLog('WARN', 'wave-dispatch', 'kill-by-session abort failed for ' + killSid + ': ' + (kErr instanceof Error ? kErr.message : String(kErr)));
        }
        // THE TRACKER SYNC (2026-08-24 — the final gap the live rekill exposed):
        // the session-scoped kill must update the owning tracker row too —
        // findWaveBySession (active + archive) → markKilled — else the DB
        // keeps a running row over a dead session (the zombie inverse).
        try {
          const owner = WaveTracker.findWaveBySession(killSid);
          if (owner) {
            WaveTracker.markKilled(owner.wave, owner.agent, 'ORCHESTRATOR_ABORT');
          }
        } catch (tErr) {
          tridentLog('WARN', 'wave-dispatch', 'kill-by-session tracker sync failed for ' + killSid + ': ' + (tErr instanceof Error ? tErr.message : String(tErr)));
        }
        tridentLog('INFO', 'wave-dispatch', 'KILL session ' + killSid + ' (session-scoped) reason=' + (typeof args.reason === 'string' ? args.reason : 'none'));
        return { title: 'WAVE KILL — session ' + killSid, output: JSON.stringify({ action: 'kill', sessionId: killSid, agent: killInfo?.subagentType ?? null, name: killInfo?.title ?? null, killed: killAborted, note: killAborted ? 'the session was destructively aborted (session-scoped kill).' : 'the abort surface was unavailable — the session was NOT killed (a real failure, named).' }, null, 2) };
      }
      if (action === 'status' || action === 'kill' || action === 'kill-wave') {
        const statusClient = getOpencodeClient() as WaveStatusClient | null;
        const statusArgs: WaveStatusArgs = {
          waveId: typeof args.waveId === 'string' ? args.waveId : undefined,
          sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
          agent: typeof args.agent === 'string' ? args.agent : undefined,
          action: action as WaveStatusArgs['action'],
          reason: typeof args.reason === 'string' ? args.reason : undefined,
          limit: 10,
          verbose: args.verbose === true,
        };
        const report = await executeWaveStatus(statusArgs, statusClient, mainSessionId);
        return { title: 'WAVE ' + action.toUpperCase() + ' — ' + report.status, output: JSON.stringify(report, null, 2) };
      }
      if (action === 'steer') {        const sid = typeof args.sessionId === 'string' && args.sessionId.trim().length > 0 ? args.sessionId.trim() : '';
        const text = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!sid || text.length === 0) {
          throw new Error('[STEER] sessionId + prompt are required — the session to steer + the message');
        }
        // THE MANUAL MODE GATE (2026-08-24 — the operator: "the tool requires
        // a manual mode selection so this cannot be blind fired"): no
        // default, no optional — an explicit soft|hard or a loud block.
        if (args.mode !== 'soft' && args.mode !== 'hard') {
          throw new Error('[STEER] mode is REQUIRED — pass mode="soft" (queue the message) or mode="hard" (interrupt the generation first, then deliver). There is NO default; a mode-less steer is a BLOCKED call.');
        }
        // THE CORRECT TYPE (2026-08-24 — the handler derives the session's own
        // subagent type; a B-agent steers as trident_build, an E-agent as
        // trident_explore — matching the skill's "same type" rule).
        const steerSessionType = resumeSessionInfo(sid)?.subagentType ?? 'trident_explore';
        const steerResult = await executeWaveSteer(sid, text, {
          mode: args.mode === 'hard' ? 'hard' : 'soft',
          subagentType: steerSessionType,
        });
        return { title: 'WAVE STEER — ' + steerResult.sessionId, output: JSON.stringify(steerResult, null, 2) };
      }
      if (action === 'pause') {
        const pauseWaveId = typeof args.waveId === 'string' && args.waveId.trim().length > 0 ? args.waveId.trim() : '';
        const pauseSessionId = typeof args.sessionId === 'string' && args.sessionId.trim().length > 0 ? args.sessionId.trim() : '';
        if (!pauseWaveId && !pauseSessionId) {
          throw new Error('[PAUSE] waveId or sessionId is required — the wave to pause or the single session to pause (waveId pauses the whole wave, sessionId pauses ONE session so the wave never gets fucked over one session)');
        }
        if (pauseSessionId) {
          // THE PURE INTERRUPT (2026-08-24 — the operator: "WHY IS PAUSE
          // SENDING A FUCKING CHAT MESSAGE IT IS JUST A FUCKING INTERRUPT"):
          // pause = session.abort ONLY — the double-esc equivalent, NO chat
          // message, NO steer text. The resume carries the re-activation.
          const pauseSessionType = resumeSessionInfo(pauseSessionId)?.subagentType ?? 'trident_explore';
          let aborted = false;
          try {
            const client = getOpencodeClient();
            if (client && typeof client?.session?.abort === 'function') {
              await client.session.abort({ path: { id: pauseSessionId } });
              aborted = true;
            }
          } catch (aErr) {
            tridentLog('WARN', 'wave-dispatch', 'pause abort failed for ' + pauseSessionId + ': ' + (aErr instanceof Error ? aErr.message : String(aErr)));
          }
          return { title: 'WAVE PAUSE — session ' + pauseSessionId, output: JSON.stringify({ action: 'pause', sessionId: pauseSessionId, waveId: pauseWaveId || null, agent: pauseSessionType, interrupted: aborted, note: aborted ? 'the session was INTERRUPTED (session.abort — the double-esc equivalent). No message sent — the resume re-activates via the continue.' : 'the abort surface was unavailable — the session was NOT interrupted (a real failure, named).' }, null, 2) };
        }
        const pauseResult = await executeWavePause(pauseWaveId, mainSessionId);
        return { title: 'WAVE PAUSE — ' + pauseWaveId, output: JSON.stringify(pauseResult, null, 2) };
      }
      // THE WAVE-PLANNING GATE (2026-08-22 — v3 SEMANTICS 2026-08-23: the
      // check is PURE — it refuses COLD/exhausted/stale-plan WITHOUT consuming
      // budget; the tick happens ONLY in generateWave when agents
      // actually dispatch. A refused call burns ZERO waves.)
      if (action === 'generate') {
        // THE SESSION-SCOPED CHECK (2026-08-24): resolves the plan + state
        // under the session's codebase root — a concurrent session never
        // sees another session's plan file. Non-session callers fall back to
        // the gate defaults (process.cwd()).
        const scRoot = resolveScopeRoot(mainSessionId, args.projectToken);
        checkWavePlanning(args, mainSessionId,
          path.join(scRoot, '.trident', 'wave-planning-state.json'),
          path.join(scRoot, '.trident', 'wave-plan.md'));
      }
      const result = await generateWave(args, mainSessionId, {
        taskDispatch: context?.extra?.taskDispatch,
      });
      return {
        title: 'WAVE ' + result.wave + ' — ' + result.dispatched.length + ' dispatched',
        output: JSON.stringify(result, null, 2),
      };
    },
  });
}

// ═══ THE PAUSE (2026-08-13 — the operator: "pause = interrupt (double esc for
// user interrupts) is needed"). THE SEMANTICS: the NON-DESTRUCTIVE interrupt —
// the current generation stops, the agent's session stays alive + resumable.
// THE MECHANIC: (1) the steer-interrupt into each live session (the esc-esc
// equivalent — the runtime's non-destructive cancel WHEN exposed), (2) the
// tracker marks the wave 'paused', (3) the resume path re-activates. THE
// COMPOSITE (the operator's confirmation): if the runtime lacks the non-
// destructive cancel for the background task, the abort + the paused state are
// used — the kill-wave's destructive path is NEVER the pause. ═══
export interface WavePauseResult {
  action: 'pause';
  waveId: string;
  pausedAgents: Array<{ name: string; sessionId: string; method: 'steer-interrupt' | 'not-delivered' | 'abort' }>;
  status: string;
  note: string;
}

export async function executeWavePause(waveId: string, mainSessionId: string | null): Promise<WavePauseResult> {
  const wave = WaveTracker.getWave(waveId);
  const pausedAgents: WavePauseResult['pausedAgents'] = [];
  if (wave) {
    // (1) the steer-interrupt into each live session (the non-destructive
    // cancel when the runtime exposes it — the steer tool's interrupt mode):
    for (const [name, agent] of Object.entries(wave.agents)) {
      const sid = agent.sessionIds[agent.sessionIds.length - 1] || (agent.taskIds && agent.taskIds[agent.taskIds.length - 1]) || '';
      if (!sid) continue;
      // THE CORRECT SUBAGENT TYPE (2026-08-24 — derived from the session's
      // title suffix; recorded for the resume path).
      const sessionInfo = resumeSessionInfo(sid);
      const subagentType = sessionInfo?.subagentType ?? 'trident_explore';
      try {
        // THE PURE INTERRUPT (2026-08-24 — the operator: pause = the double-esc
        // equivalent ONLY): session.abort, NO chat message. The resume carries
        // the re-activation via the soft continue.
        const client = getOpencodeClient();
        if (client && typeof client?.session?.abort === 'function') {
          await client.session.abort({ path: { id: sid } });
          pausedAgents.push({ name, sessionId: sid, method: 'steer-interrupt' });
        } else {
          pausedAgents.push({ name, sessionId: sid, method: 'not-delivered' });
          tridentLog('WARN', 'wave-dispatch', 'pause abort surface unavailable for ' + name + ' (' + sid + ')');
        }
      } catch (steerErr) {
        // THE ABORT FAILED (named loudly — never a silent skip):
        tridentLog('WARN', 'wave-dispatch', 'pause abort failed for ' + name + ' (' + sid + '): ' + (steerErr instanceof Error ? steerErr.message : String(steerErr)));
        pausedAgents.push({ name, sessionId: sid, method: 'abort' });
      }
    }
    wave.status = 'paused' as WaveStatus;
    for (const [name] of Object.entries(wave.agents)) {
      WaveTracker.markPaused(waveId, name);
    }
  }
  return {
    action: 'pause',
    waveId,
    pausedAgents,
    status: wave ? 'paused' : 'unknown_wave',
    note: wave
      ? pausedAgents.length + ' agent(s) paused — the wave holds its state; resume via action=resume with the task_ids (the sessions stay alive).'
      : 'no tracked wave for ' + waveId + ' — the runtime-backed resolution would be needed for an untracked wave',
  };
}
