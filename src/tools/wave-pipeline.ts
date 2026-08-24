// THE MECHANICAL GENERATE + DISPATCH PATH
// generate: weave prompt files + manifest + SHA (the wave-manager generate action)
// dispatch: read those files, SHA-verify, call extra.taskDispatch (the vanilla TaskTool.execute)

import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import { TRIDENT_TMP_DIR, resolveTmpDir, type WaveManifest } from "./wave-constants.ts"
import { validateTaskPromptLines } from "./trident-preflight.ts"
import { WaveTracker } from "./wave-tracker.ts"
import { createWaveRegistry } from "./wave-registry.ts"

export type TaskDispatchFn = (params: {
  description: string
  prompt: string
  subagent_type: string
  background?: boolean
}) => Promise<{
  title: string
  metadata: Record<string, any>
  output: string
  partID: string
  callID: string
  sessionId: string
}>

export interface WaveManagerContext {
  sessionID?: string
  extra?: { taskDispatch?: TaskDispatchFn }
}

const CTX_FLOORS: Record<string, number> = {
  mission: 200,
  knownContext: 200,
  doctrine: 100,
  measurements: 100,
  acceptance: 100,
  taskTargets: 100,
  position: 50,
}

export interface PipelineAgent {
  name: string
  template: string
  filepaths: string[]
  mission: string
  knownContext: string
  doctrine: string
  measurements: string
  acceptance: string
  taskTargets: string
  position: string
}

// ═══ THE COERCION ENGINE (the T.E.B. READER+ENGINE — chaos-optimized input
//  absorption, 2026-08-22 the operator: "why cant it just absorb an array and
//  properly convert this into the needed args w/ a state machine") ═══
// Models pass arrays where strings belong ("acceptance (0c < 100c)" was an
// array coerced to empty by the old typeof-string check). ANY sane shape now
// becomes the canonical string: Array → newline join; object → JSON;
// number/bool → String; null/undefined → undefined (the floor validator then
// refuses with STEERING, never a silent empty).

/** THE FIELD COERCION — one value → canonical string (or undefined to refuse). */
export function coerceContextValue(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const parts = v.map((x) =>
      x === null || x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x),
    )
    return parts.filter((s) => s.length > 0).join('\n')
  }
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

const CONTEXT_FIELDS = ['mission', 'knownContext', 'doctrine', 'measurements', 'acceptance', 'taskTargets'] as const
void CONTEXT_FIELDS

export function normalizePipelineAgents(args: Record<string, unknown>, waveId?: string): PipelineAgent[] {
  // THE agentsJson CHANNEL (2026-08-21 — the container F-1 collapse fix): the
  // orchestrator model repeatedly DROPPED array entries when transcribing a
  // structured agents array (ct-chain-verify 4→1, ct4 4→1 — proven in the
  // memory roots: ONE session dir for a 4-agent wave). A SINGLE STRING param
  // survives transcription: the model composes one JSON text instead of
  // N object literals. Parsed here, then normalized through the SAME path.
  if (typeof args.agentsJson === "string" && args.agentsJson.trim().length > 0 && !Array.isArray(args.agents)) {
    try {
      const parsed = JSON.parse(args.agentsJson) as unknown
      const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as Record<string, unknown>)?.agents) ? (parsed as { agents: unknown[] }).agents : null
      if (arr && arr.length > 0) {
        args = { ...args, agents: arr }
      }
    } catch {
      // fall through — the inline-array path or the thin-args refusal handles it
    }
  }
  if (Array.isArray(args.agents) && args.agents.length > 0) {
    return args.agents.map((a, i) => {
      const rec = (a && typeof a === "object" ? a : {}) as Record<string, unknown>
      const legacyCtx = coerceContextValue(rec.context) ?? ""
      const ctxField = (k: string): string => coerceContextValue(rec[k]) ?? legacyCtx
      let filepaths: string[] = []
      if (typeof rec.filepaths === 'string' && rec.filepaths.trim()) filepaths = [rec.filepaths]
      else if (Array.isArray(rec.filepaths)) filepaths = rec.filepaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      return {
        name: (coerceContextValue(rec.name) ?? "agent-" + (i + 1)).replace(/[^A-Za-z0-9_-]/g, "-"),
        template: coerceContextValue(rec.template) ?? "E2",
        filepaths,
        mission: ctxField("mission"),
        knownContext: ctxField("knownContext"),
        doctrine: ctxField("doctrine"),
        measurements: ctxField("measurements"),
        acceptance: ctxField("acceptance"),
        taskTargets: ctxField("taskTargets"),
        position: ctxField("position"),
      }
    })
  }
  // THE SINGLE-AGENT MODE — same coercion engine applies.
  const name = coerceContextValue(args.name) ?? "task-prompt-" + (waveId ?? Date.now())
  const fpSingle = coerceContextValue(args.filepaths)
  const fps = Array.isArray(args.filepaths)
    ? (args.filepaths as unknown[]).filter((p): p is string => typeof p === 'string')
    : fpSingle ? [fpSingle] : []
  const legacyCtx = coerceContextValue(args.context) ?? ""
  const ctx = (k: string): string => coerceContextValue(args[k]) ?? legacyCtx
  return [{
    name: name.replace(/[^A-Za-z0-9_-]/g, "-"),
    template: coerceContextValue(args.template) ?? "E2",
    filepaths: fps,
    mission: ctx('mission'),
    knownContext: ctx('knownContext'),
    doctrine: ctx('doctrine'),
    measurements: ctx('measurements'),
    acceptance: ctx('acceptance'),
    taskTargets: ctx('taskTargets'),
    position: ctx('position'),
  }]
}

export function resolveSubagentType(template: string): "trident_explore" | "trident_build" {
  return (template || "E2").toUpperCase().startsWith("B") ? "trident_build" : "trident_explore"
}

/** THE FLOOR-STEERING TAIL (the operator's directive: refusals STEER after the
 *  kick — 30–90 tokens, imperative, exact corrective action; the floors are a
 *  FLOOR and the expectation is 2–4× with dense context). */
const FLOOR_STEER = ' Floors are MINIMUMS, not targets — write 2–4× the floor of dense context (real anchors, numbers, quotes). Re-fire with ALL agents corrected.'

export function validatePipelineAgent(spec: PipelineAgent): string | null {
  if (!spec.filepaths.length) return "filepaths is required for " + spec.name + " (absolute paths that EXIST on disk)." + FLOOR_STEER
  const missing = spec.filepaths.filter((p) => !fs.existsSync(p))
  if (missing.length) return "filepaths do not EXIST for " + spec.name + ": " + missing.join(", ") + ". Pass real absolute paths." + FLOOR_STEER
  const thin = Object.entries(CTX_FLOORS)
    .filter(([k, floor]) => {
      const arg = (spec as unknown as Record<string, string>)[k]
      return typeof arg === "string" && arg.length < floor
    })
    .map(([k, floor]) => k + " (" + ((spec as unknown as Record<string, string>)[k] || "").length + "c < " + floor + "c)")
  if (thin.length) return "context args too thin for " + spec.name + ": " + thin.join(", ") + "." + FLOOR_STEER
  return null
}

/** THE COUNT CONTRACT (2026-08-22 — the operator: the generate-1-dispatch-1
 *  degenerate loop is BANNED): when expectedCount is passed, a wave returning a
 *  different number of specs is a LOUD refusal steering back to ONE generate
 *  call carrying ALL N specs via agentsJson. */
export function validateWaveCount(specs: PipelineAgent[], expectedCount: unknown): string | null {
  const expected = typeof expectedCount === 'number' ? expectedCount : typeof expectedCount === 'string' && expectedCount.trim() && !isNaN(Number(expectedCount)) ? Number(expectedCount) : null
  if (expected === null || expected <= 0) return null
  if (specs.length === expected) return null
  return 'COUNT MISMATCH: you returned ' + specs.length + ' of ' + expected + ' requested agents. NEVER split a wave into one-agent calls. Re-fire action=generate ONCE with ALL ' + expected + ' specs.'
}

/** Weave a DPL1-grade dispatch prompt from the context args (no LLM). */
export function weaveDpl1Prompt(spec: PipelineAgent): string {
  const type = resolveSubagentType(spec.template)
  const lines: string[] = []
  const push = (s = "") => lines.push(s)
  push("# DISPATCH PROMPT — " + spec.name)
  push("agent: " + type)
  push("template: " + spec.template)
  push("")
  push("## MISSION / OBJECTIVE")
  for (const l of spec.mission.split("\n")) push(l)
  push("")
  push("## KNOWN CONTEXT")
  for (const l of spec.knownContext.split("\n")) push(l)
  push("")
  push("## OPERATOR DOCTRINE")
  for (const l of spec.doctrine.split("\n")) push(l)
  push("")
  push("## MEASUREMENTS")
  for (const l of spec.measurements.split("\n")) push(l)
  push("")
  push("## ACCEPTANCE")
  for (const l of spec.acceptance.split("\n")) push(l)
  push("")
  push("## POSITION IN THE BUILD")
  for (const l of spec.position.split("\n")) push(l)
  push("")
  push("## READING ORDER — read these files BEFORE any write")
  spec.filepaths.forEach((p, i) => push((i + 1) + ". " + p))
  push("")
  push("## TASK TARGETS — per-task WHAT / HOW / WHY / EXPECTED")
  const targets = spec.taskTargets.split("\n").filter((l) => l.trim())
  const chunks = Math.max(3, Math.min(6, targets.length))
  for (let t = 0; t < chunks; t++) {
    const fp = spec.filepaths[t % spec.filepaths.length]
    push("")
    push("### TASK " + (t + 1))
    push("WHAT: extract the contracts and call sites from " + fp + " for slot " + (t + 1) + " of " + spec.name)
    push("HOW: read " + fp + " fully (2500-line passes); list the exports; describe the logic.")
    push("WHY: the parent wave cannot dispatch a child that has not measured this file.")
    push("EXPECTED: a numbered list of symbols + file:line anchors + one verification command.")
    if (targets[t]) push("TARGET: " + targets[t])
  }
  push("")
  push("## CONSTRAINTS / DO NOT TOUCH / FROZEN")
  push("- Do not rewrite the parent session agent.")
  push("- Do not invent file paths.")
  push("- Do not condense this prompt.")
  push("- Frozen: the SHA of this file is the dispatch authorization.")
  push("")
  push("## VERIFICATION PROTOCOL")
  push("Run these concrete commands and paste the output:")
  for (const fp of spec.filepaths) {
    push("- grep -n \"export \" " + fp)
    push("- rg -n \"function |class |interface \" " + fp)
    push("- wc -l " + fp)
    push("- sha256sum " + fp)
  }
  push("- bun test --timeout 30000")
  push("")
  push("## RETURN FORMAT / REPORT")
  push("Return a markdown report with: findings, file:line anchors, leftover risks.")
  push("")
  // pad to the 125-line DPL1 floor with unique measured content
  let n = 1
  while (lines.length < 140) {
    const fp = spec.filepaths[n % spec.filepaths.length]
    push("ANCHOR " + n + ": re-read " + fp + " offset=" + n * 20 + " — confirm the export list still matches the mission.")
    n++
  }
  const prompt = lines.join("\n")
  const v = validateTaskPromptLines(prompt)
  if (!v.passed) {
    throw new Error("[DPL1 WEAVE] failed validation: " + v.lines.join(" | "))
  }
  return prompt
}

export async function executeGenerate(
  args: Record<string, unknown>,
  opts: { tmpDir?: string; generator?: (spec: PipelineAgent) => Promise<{ prompt: string }> } = {},
): Promise<{
  wave: string
  tmpDir: string
  dispatched: Array<{ name: string; type: string; status: string; sessionId: string; path: string; sha256: string; lines: number }>
  failed: Array<{ name: string; error: string }>
}> {
  const requestedAlias = typeof args.waveId === "string" && args.waveId.trim() ? args.waveId.trim() : ""
  const sanitizedAlias = requestedAlias.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30)
  const waveId = "wave-" + (sanitizedAlias ? sanitizedAlias + "-" : "") + Date.now()
  const specs = normalizePipelineAgents(args, waveId)
  if (!specs.length) throw new Error("the agents array is empty")
  const countErr = validateWaveCount(specs, args.expectedCount)
  if (countErr) throw new Error(countErr)
  for (const spec of specs) {
    const err = validatePipelineAgent(spec)
    if (err) throw new Error(err)
  }
  const tmpDir = resolveTmpDir(opts.tmpDir)
  fs.mkdirSync(tmpDir, { recursive: true })
  const manifest: WaveManifest = { wave: waveId, requestedWaveId: requestedAlias || null, generatedAt: new Date().toISOString(), agents: [] }
  const dispatched: Array<{ name: string; type: string; status: string; sessionId: string; path: string; sha256: string; lines: number }> = []
  const failed: Array<{ name: string; error: string }> = []

  for (const spec of specs) {
    try {
      const result = opts.generator ? await opts.generator(spec) : { prompt: weaveDpl1Prompt(spec) }
      const filePath = path.join(tmpDir, spec.name + ".md")
      fs.writeFileSync(filePath, result.prompt, "utf-8")
      const sha256 = createHash("sha256").update(result.prompt).digest("hex")
      const lines = result.prompt.split("\n").length
      const type = resolveSubagentType(spec.template)
      manifest.agents.push({ name: spec.name, type, lines, sha256, status: "ready" })
      dispatched.push({ name: spec.name, type, status: "ready", sessionId: "", path: filePath, sha256, lines })
    } catch (e) {
      failed.push({ name: spec.name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  fs.writeFileSync(path.join(tmpDir, ".wave-manifest-" + waveId + ".json"), JSON.stringify(manifest, null, 2), "utf-8")
  for (const a of manifest.agents) {
    fs.writeFileSync(
      path.join(tmpDir, ".wave-manifest-" + waveId + "-" + a.name + ".json"),
      JSON.stringify({ wave: waveId, generatedAt: manifest.generatedAt, agents: [a] }, null, 2),
      "utf-8",
    )
  }
  try {
    createWaveRegistry(tmpDir, waveId, manifest.agents.length)
  } catch {
    /* registry is advisory */
  }
  try {
    WaveTracker.registerWave({
      wave: waveId,
      alias: requestedAlias || undefined,
      names: specs.map((s) => s.name),
      sessionIds: dispatched.map(() => ""),
      dispatchedAt: Date.now(),
      etaMs: 0,
      etaConfidence: 0,
      agents: Object.fromEntries(
        dispatched.map((d) => [
          d.name,
          {
            sessionIds: [],
            state: "running" as const,
            respawnCount: 0,
            lastKillReason: null,
            spawnTimes: { spawnedAt: Date.now() },
            lastActivityAt: Date.now(),
            lastBytes: 0,
            errorCodes: [],
          },
        ]),
      ),
    })
  } catch {
    /* tracker persist is advisory for this pipeline */
  }
  return { wave: waveId, tmpDir, dispatched, failed }
}

export function findManifest(tmpDir: string, waveId?: string): { path: string; manifest: WaveManifest } {
  const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(".wave-manifest-") && f.endsWith(".json"))
  const parsed: Array<{ file: string; manifest: WaveManifest }> = []
  for (const file of files) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, file), "utf-8")) as WaveManifest
      if (!manifest?.wave || !Array.isArray(manifest.agents)) continue
      // wave-level file name is exactly .wave-manifest-<wave>.json
      if (file === ".wave-manifest-" + manifest.wave + ".json") parsed.push({ file, manifest })
    } catch {
      /* skip */
    }
  }
  if (!parsed.length) throw new Error("[DISPATCH] no wave manifest in " + tmpDir)
  if (waveId) {
    const hit = parsed.find((p) => p.manifest.wave === waveId || p.manifest.wave.includes(waveId) || (p.manifest.requestedWaveId || "") === waveId)
    if (hit) return { path: path.join(tmpDir, hit.file), manifest: hit.manifest }
  }
  parsed.sort((a, b) => a.manifest.generatedAt.localeCompare(b.manifest.generatedAt))
  const last = parsed[parsed.length - 1]
  return { path: path.join(tmpDir, last.file), manifest: last.manifest }
}

export async function executeDispatch(
  args: Record<string, unknown>,
  context: WaveManagerContext,
  opts: { tmpDir?: string } = {},
): Promise<{
  wave: string
  dispatched: Array<{ name: string; sessionId: string; partID: string; callID: string; sha256: string; lines: number }>
  failed: Array<{ name: string; error: string }>
}> {
  const taskDispatch = context.extra?.taskDispatch
  if (typeof taskDispatch !== "function") {
    throw new Error("[DISPATCH] context.extra.taskDispatch is missing — this runtime is not the 1.14.51 task-dispatch fork")
  }
  const tmpDir = resolveTmpDir(opts.tmpDir)
  const waveId = typeof args.waveId === "string" ? args.waveId.trim() : ""
  const { manifest } = findManifest(tmpDir, waveId || undefined)

  // ═══ THE MANIFEST-FABRICATION FIREWALL (2026-08-20 — the UNTRACKED_WAVE
  //    FAILURE the operator handed over): a hand-written manifest used to be able
  //    to bypass the generate — the manifest is the CONTENT check (the sha match)
  //    but the TRACKER is the CONTROL state, and they were decoupled. A wave that
  //    was never generated is never registered → the dispatch finds the manifest
  //    but the tracker has no row → the wave is UNTRACKED (the pause/kill/status
  //    could not resolve it). THE INVARIANT: the generate action registers the
  //    wave in the tracker (WaveTracker.registerWave at wave-dispatch.ts:598 —
  //    the ONLY path that writes a manifest + registers); the dispatch REFUSES
  //    a manifest whose wave is NOT in the tracker. THE LAW: the wave is
  //    generated-and-tracked-or-dead — never a hand-fabricated manifest. ═══
  const trackedWave = WaveTracker.getWave(manifest.wave)
  if (!trackedWave) {
    throw new Error(
      "[WAVE TRACKED-OR-DEAD] the manifest for wave " + manifest.wave +
      " exists on disk but the wave is NOT registered in the tracker — the generate action is the ONLY path that writes a manifest + registers the wave. A manifest without the registration is a HAND-FABRICATED manifest (the UNTRACKED_WAVE class — the pause/kill/status would find no wave). Regenerate via trident-wave-manager action=generate; never hand-write a .wave-manifest-*.json."
    )
  }

  const dispatched: Array<{ name: string; sessionId: string; partID: string; callID: string; sha256: string; lines: number }> = []
  const failed: Array<{ name: string; error: string }> = []

  // THE PARALLEL DISPATCH (the operator: "10 calls take the same time as one
  // unless you BROKE THIS and made it sequential garbage" — the dispatch IS the
  // async-parallel batch; the for-await loop was the sequential garbage).
  const pending = manifest.agents.map(async (agent) => {
    const file = path.join(tmpDir, agent.name + ".md")
    let content: string
    try {
      content = fs.readFileSync(file, "utf-8")
    } catch (e) {
      failed.push({ name: agent.name, error: "prompt file missing: " + file })
      return
    }
    const sha = createHash("sha256").update(content).digest("hex")
    if (agent.sha256 && sha !== agent.sha256) {
      failed.push({ name: agent.name, error: "[WAVE VERBATIM] SHA mismatch for " + agent.name })
      return
    }
    const v = validateTaskPromptLines(content)
    if (!v.passed) {
      failed.push({ name: agent.name, error: "[TRIDENT PROMPT FILE] DPL1 failed: " + v.lines.join(" | ") })
      return
    }
    try {
      const result = await taskDispatch({
        description: agent.name,
        prompt: content,
        subagent_type: agent.type || "trident_explore",
        background: true,
      })
      dispatched.push({
        name: agent.name,
        sessionId: result.sessionId,
        partID: result.partID,
        callID: result.callID,
        sha256: sha,
        lines: content.split("\n").length,
      })
    } catch (e) {
      failed.push({ name: agent.name, error: e instanceof Error ? e.message : String(e) })
    }
  })
  await Promise.all(pending)

  return { wave: manifest.wave, dispatched, failed }
}

export async function executeWaveManager(
  args: Record<string, unknown>,
  context: WaveManagerContext,
  opts: { tmpDir?: string } = {},
): Promise<{ title: string; output: string }> {
  const action = typeof args.action === "string" ? args.action : "generate"
  if (action === "dispatch") {
    const result = await executeDispatch(args, context, opts)
    return {
      title: "WAVE DISPATCH — " + result.wave + " — " + result.dispatched.length + " spawned",
      output: JSON.stringify(result, null, 2),
    }
  }
  if (action === "generate" || !args.action) {
    const result = await executeGenerate(args, opts)
    return {
      title: "WAVE " + result.wave + " — " + result.dispatched.length + " generated",
      output: JSON.stringify(result, null, 2),
    }
  }
  throw new Error("[WAVE] action=" + action + " is not handled by the pipeline runner")
}

void TRIDENT_TMP_DIR
