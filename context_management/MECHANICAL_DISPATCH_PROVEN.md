# THE MECHANICAL SUBAGENT DISPATCH — PROVEN END-TO-END (THE BOTTLENECK BREAK)

**2026-08-19 — the "we cannot build a tool that calls the task tool" claim is DISPROVEN.**

The full mechanical dispatch — `trident-wave-manager action=dispatch` → the native `TaskTool.execute` → background subagents → inline `tool:"task"` cards → tethered children → parent unchanged — was PROVEN LIVE in the container on 2026-08-19 with the REAL NVIDIA provider, the REAL forked opencode 1.14.51 runtime, and the REAL trident plugin. This document is the COMPLETE record: every source patch, every wiring, the effect system, the backend connection, the container test, the failure history, and the replication recipe. Nothing watered down, nothing left out.

---

## 0. THE EXECUTIVE SUMMARY (what was proven)

**The claim that was killing this for 7 hours:** "we cannot build a tool that calls the task tool" — the idea that a plugin tool (trident-wave-manager) could not mechanically invoke opencode's native subagent spawn (TaskTool.execute) with the inline card rendering.

**THE PROOF (container screenshot, 2026-08-19 22:5x UTC):**

```
⚙ trident-wave-manager [action=dispatch, waveId=wave-babysit-1787093328716]
│ Trident_explore Task — te-s1 (background)
└ 18 toolcalls
│ Trident_explore Task — te-s2 (background)
└ 14 toolcalls
ctrl+x down view subagents
```

**The dispatch JSON (the tool result):**

```json
{
  "wave": "wave-babysit-1787093328716",
  "dispatched": [
    { "name": "te-s1", "sessionId": "ses_fe8e804d3ffedeUTNhLHb7EdHk", "partID": "prt_01717fb2a001QH0RzMw1AzSrwG", "callID": "01M0BHFYSA6KDN32QV4FYV9YWR", "sha256": "c996866568fc9c6f929dc377a10a50f93ae6cb7f607f9766c093d9ad96a36c2d", "lines": 125 },
    { "name": "te-s2", "sessionId": "ses_fe8e804c9ffeqv6l8I4OyUEImQ", "partID": "prt_01717fb32001rVRPO0TImN8wrh", "callID": "01M0BHFYSJKCG9ECJEQH8N9P1K", "sha256": "78b01559126ff9d721a3c79fd79ff65d07e84ac91d0cd5ecd2aa835ab9a44f8a", "lines": 166 }
  ],
  "failed": []
}
```

**What happened mechanically:**
1. The container agent (real NVIDIA Nemotron) called `trident-wave-manager [action=generate, waveId=babysit]` with 2 agents (te-s1 E1, te-s2 E2) + dense context args.
2. The shadow brain (the same NVIDIA provider) ran the 80% weave + 20% polish → wrote `te-s1.md` (125 lines) + `te-s2.md` (166 lines) + the wave manifest with both agents `status: "ready"` + sha256.
3. The container agent called `trident-wave-manager [action=dispatch, waveId=wave-babysit-1787093328716]`.
4. The plugin's `executeDispatch` read the prompt files BYTES, sha256-verified them against the manifest, `validateTaskPromptLines` passed, then called `context.extra.taskDispatch({description, prompt: BYTES, subagent_type, background: true})` per agent.
5. The fork's `extra.taskDispatch` → `makeTaskDispatch` → `processor.createLiveToolPart` (the inline card + the LIVE `ctx.toolcalls` entry) → `TaskTool.execute({background: true})` → `background.start` (the child async).
6. The TUI rendered `│ Trident_explore Task — te-s1 (background)` + `│ Trident_explore Task — te-s2 (background)` inline with the live toolcall counts (18 + 14).
7. The children were real sessions (`ses_fe8e804d3...`, `ses_fe8e804c9...`) with real partIDs/callIDs, `failed: []`.

**The artifacts (the shas):**
- The PROVEN plugin dist: `c782ddc87a8b49c32071fd8464e65d6aeb2c5da9aec243f15b82026d3793fcff` (16.32MB, 461 modules)
- The checkpoint: `Checkpoints/mechanical-subagent-dispatch-proven-grok-built/` (full src 304 files + the proven dist)
- The image: `forge-fork-test:v1` (ac10d966dc59, 6.34GB, FROM runtime-grade-container-sandbox:master)
- The container: `forge-dispatch-test`

---

## 1. THE ARCHITECTURE (the whole thing, one diagram)

```
┌─────────────────────────────────────────────────────────────────────┐
│  THE TRIDENT PLUGIN (the wave manager)                               │
│  src/tools/wave-dispatch.ts  createWaveManagerTool()                 │
│    action=generate  → executeWaveDispatch (the shadow brain)         │
│    action=dispatch  → executeDispatch (the mechanical spawn)         │
│    action=status|kill|steer|resume|release                           │
│  src/tools/wave-pipeline.ts  executeDispatch()                       │
│    read prompt files BYTES → sha256 verify → validateTaskPromptLines │
│    → context.extra.taskDispatch({...})                               │
│  src/tools/shadow/shadow-runner.ts  runShadowPipeline()              │
│    the 80% weave + 20% polish → te-s1.md/te-s2.md + manifest         │
└──────────────┬──────────────────────────────────────────────────────┘
               │ context.extra.taskDispatch (the fork's injection)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  THE FORKED OPENCODE RUNTIME (1.14.51 + 3 patches)                    │
│  src/session/prompt.ts:565  extra: { ..., taskDispatch }             │
│    (injected inside resolveTools → context() via run.promise)        │
│  src/tool/task-dispatch.ts (NEW)  makeTaskDispatch()                 │
│    createLiveToolPart → TaskTool.execute → completeToolCall          │
│  src/session/processor.ts:218  createLiveToolPart()                  │
│    session.updatePart(tool:"task") + ctx.toolcalls[callID] = LIVE    │
│  src/tool/task.ts (UNTOUCHED — the native backend)                   │
│    sessions.create({parentID}) → ops.prompt → background.start       │
└──────────────┬──────────────────────────────────────────────────────┘
               │ the LIVE ctx.toolcalls entry + the message.part.updated
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  THE TUI (the card render)                                            │
│  src/cli/cmd/tui/routes/session/index.tsx:1434  tool:"task" → Task   │
│  index.tsx:1982-2018  the Task component (reads metadata.sessionId) │
│  context/sync.tsx:306-325  message.part.updated → store.part splice │
│  RENDERS: │ Trident_explore Task — te-s1 (background)               │
│           └ 18 toolcalls                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. THE FORK RUNTIME PATCHES (the 3 files in FORGE_DESKTOP/opencode)

The fork is the vanilla opencode 1.14.51 source (git `a462b1c10 release: v1.14.51`) at
`FORGE_DESKTOP/opencode/` with exactly 3 dispatch files changed. `task.ts` is UNTOUCHED.

### 2.1 `packages/opencode/src/tool/task-dispatch.ts` (NEW, 118 lines)

The **wrapper** — the plugin-side `taskDispatch` function the wave-manager calls. It does NOT
rewrite TaskTool; it WRAPS it (the guide: "This file **calls** TaskTool. It does not copy it.").

```ts
import { Effect } from "effect"
import type { SessionProcessor } from "@/session/processor"
import type { MessageV2 } from "@/session/message-v2"
import type { SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"
import { TaskTool, type TaskPromptOps } from "@/tool/task"

export interface TaskDispatchInput {
  description: string
  prompt: string
  subagent_type: string
  background?: boolean
  command?: string
}

export interface TaskDispatchResult {
  title: string
  metadata: Record<string, any>
  output: string
  attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
  partID: string
  callID: string
  sessionId: string
}

export type TaskDispatchFn = (params: TaskDispatchInput) => Promise<TaskDispatchResult>

type Processor = Pick<
  SessionProcessor.Handle,
  "message" | "updateToolCall" | "completeToolCall" | "createLiveToolPart"
>

export function makeTaskDispatch(deps: {
  processor: Processor
  taskTool: {
    execute: (
      params: {
        description: string
        prompt: string
        subagent_type: string
        background?: boolean
        command?: string
      },
      ctx: Tool.Context,
    ) => Effect.Effect<Tool.ExecuteResult>
  }
  promptOps: TaskPromptOps
  sessionID: SessionID
  agent: string
  abort: AbortSignal
  messages: MessageV2.WithParts[]
  ask: Tool.Context["ask"]
}) {
  return Effect.fn("TaskDispatch.run")(function* (params: TaskDispatchInput) {
    const background = params.background !== false
    const { part, callID } = yield* deps.processor.createLiveToolPart({
      tool: TaskTool.id,
      input: {
        description: params.description,
        prompt: params.prompt,
        subagent_type: params.subagent_type,
        ...(params.command ? { command: params.command } : {}),
      },
    })

    const result = yield* deps.taskTool.execute(
      {
        description: params.description,
        prompt: params.prompt,
        subagent_type: params.subagent_type,
        background,
        command: params.command,
      },
      {
        sessionID: deps.sessionID,
        messageID: deps.processor.message.id,
        agent: deps.agent,
        abort: deps.abort,
        callID,
        extra: { bypassAgentCheck: true, promptOps: deps.promptOps },
        messages: deps.messages,
        metadata: (val) =>
          deps.processor
            .updateToolCall(callID, (match) => {
              if (!["running", "pending"].includes(match.state.status)) return match
              return {
                ...match,
                state: {
                  title: val.title,
                  metadata: val.metadata,
                  status: "running",
                  input: "input" in match.state ? match.state.input : {},
                  time: { start: Date.now() },
                },
              }
            })
            .pipe(Effect.asVoid),
        ask: deps.ask,
      },
    )

    yield* deps.processor.completeToolCall(callID, {
      title: result.title,
      metadata: result.metadata,
      output: result.output,
      attachments: result.attachments as MessageV2.FilePart[] | undefined,
    })

    return {
      title: result.title,
      metadata: result.metadata,
      output: result.output,
      attachments: result.attachments,
      partID: part.id,
      callID,
      sessionId: String(result.metadata.sessionId ?? ""),
    } satisfies TaskDispatchResult
  })
}
```

**The 3 steps (the chain):**
1. `deps.processor.createLiveToolPart({tool: TaskTool.id, input})` → the card part + the live `ctx.toolcalls` entry.
2. `deps.taskTool.execute({description, prompt, subagent_type, background}, ctx)` — the NATIVE TaskTool, with `ctx.metadata` wired to `processor.updateToolCall(callID)` so the card's title/metadata/sessionId update live.
3. `deps.processor.completeToolCall(callID, result)` → the card flips to completed.

**The deps are INJECTED** (processor, taskTool, promptOps, sessionID, agent, abort, messages, ask) — the prompt.ts wiring supplies them (section 2.3).

### 2.2 `packages/opencode/src/session/processor.ts` (+createLiveToolPart)

The **card mechanism**. Added to the `Handle` interface (line 54), the implementation (line 218),
and the Handle return (line 848). This is the KEY — the exact fix for the P6-render failure.

```ts
// the Handle interface (processor.ts:54)
readonly createLiveToolPart: (
  input: {
    tool: string
    callID?: string
    input?: Record<string, any>
  },
) => Effect.Effect<{ part: MessageV2.ToolPart; callID: string }>

// the implementation (processor.ts:218)
const createLiveToolPart = Effect.fn("SessionProcessor.createLiveToolPart")(function* (input: {
  tool: string
  callID?: string
  input?: Record<string, any>
}) {
  const callID = input.callID ?? ulid()
  const part = yield* session.updatePart({
    id: ctx.toolcalls[callID]?.partID ?? PartID.ascending(),
    messageID: ctx.assistantMessage.id,
    sessionID: ctx.assistantMessage.sessionID,
    type: "tool",
    tool: input.tool,
    callID,
    state: {
      status: "running",
      input: input.input ?? {},
      time: { start: Date.now() },
    },
  } satisfies MessageV2.ToolPart)
  ctx.toolcalls[callID] = {
    done: yield* Deferred.make<void>(),
    partID: part.id,
    messageID: part.messageID,
    sessionID: part.sessionID,
  }
  return { part, callID }
})

// the Handle return (processor.ts:848)
return {
  get message() { return ctx.assistantMessage },
  updateToolCall,
  completeToolCall,
  createLiveToolPart,
  process,
} satisfies Handle
```

**WHY this is the fix (the P6 lesson):** the TUI renders a `tool:"task"` part via the `Task`
component (`index.tsx:1982-2018`) which reads `props.metadata.sessionId` to sync the child. The
part is rendered as part of the message's LIVE generation — driven by the processor's stream of
`tool-input-start` → `tool-call` → `tool-result` events. The processor's `tool-input-start`
handler (`processor.ts:289-317`) creates the part AND registers it in `ctx.toolcalls[value.id]`
(the LIVE tool-call map). A part that is NOT in `ctx.toolcalls` is data-present but
render-orphaned — that was the P6 probe's failure (the external `updatePart` injection wrote the
part but the synthetic callID wasn't a live `ctx.toolcalls` entry → no render).

`createLiveToolPart` does EXACTLY what `tool-input-start` does for a model's tool call — it
creates the `tool:"task"` part via `session.updatePart` (the same UPSERT that publishes
`MessageV2.Event.PartUpdated`) AND registers it in `ctx.toolcalls[callID]` with a
`Deferred.make<void>()` (the live completion signal). So the card part IS a live tool call in
the processor's map → the TUI renders it inline as a subagent card.

### 2.3 `packages/opencode/src/session/prompt.ts` (+extra.taskDispatch)

The **injection point** — where the plugin tools get the rich `context`. `resolveTools` →
`context()` builds the `extra` object that carries `taskDispatch`.

```ts
// the import (prompt.ts:52)
import { makeTaskDispatch, type TaskDispatchFn } from "@/tool/task-dispatch"

// the widened processor pick (prompt.ts:527)
processor: Pick<
  SessionProcessor.Handle,
  "message" | "updateToolCall" | "completeToolCall" | "createLiveToolPart"
>

// the taskTool from the registry (prompt.ts:536)
const { task: taskTool } = yield* registry.named()

// the taskDispatch built via run.promise (prompt.ts:538) — the EffectBridge
const taskDispatch: TaskDispatchFn = (params) =>
  run.promise(
    makeTaskDispatch({
      processor: input.processor,
      taskTool,
      promptOps,
      sessionID: input.session.id,
      agent: input.agent.name,
      abort: options.abortSignal!,
      messages: input.messages,
      ask: (req) =>
        permission
          .ask({
            ...req,
            sessionID: input.session.id,
            tool: { messageID: input.processor.message.id, callID: options.toolCallId },
            ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
          })
          .pipe(Effect.orDie),
    })(params),
  )

// the extra injection (prompt.ts:565)
extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps, taskDispatch },
```

**THE EFFECT-BRIDGE RULE (CRITICAL):** `taskDispatch` is built via `run.promise` — the
EffectBridge's runner (`const run = yield* runner()` at prompt.ts:532-533, `runner()` returns
`EffectBridge.make()`). **NEVER naked `Effect.runPromise`** — the naked form drops the Instance
ALS (AsyncLocalStorage) → "No context found for instance". The EffectBridge's `run.promise`
preserves the ALS so the makeTaskDispatch Effect (which touches processor/session services)
resolves them. This is WHY the fork works where the naive `Effect.runPromise` path failed.

The `handleSubtask` path (`prompt.ts:701-855`) is UNTOUCHED — it's the synchronous subtask
path the guide forbids (the child hangs). The `createLiveToolPart` fork REPLACES it.

### 2.4 `packages/opencode/test/session/compaction.test.ts` (+18 — the typecheck fixture)

The widened `Handle` (the new `createLiveToolPart` field) breaks the typecheck of the mock
`Handle` in `compaction.test.ts`'s `fake()` — the mock must satisfy the new interface. The
fixture stub:

```ts
createLiveToolPart: Effect.fn("TestSessionProcessor.createLiveToolPart")((input: {
  tool: string
  callID?: string
  input?: Record<string, any>
}) =>
  Effect.succeed({
    part: {
      id: "prt_test",
      messageID: msg.id,
      sessionID: msg.sessionID,
      type: "tool",
      tool: input.tool,
      callID: input.callID ?? "cll_test",
      state: { status: "running", input: input.input ?? {}, time: { start: Date.now() } },
    } as any,
    callID: input.callID ?? "cll_test",
  }),
),
```

This is NOT runtime logic — it's the typecheck fixture so the widened `Handle` compiles. Without
it, `bun run typecheck` fails on the test file (the mock lacks the new field).

### 2.5 `packages/opencode/src/tool/task.ts` — CLEAN (the FORBIDDEN edit, NEVER touched)

`task.ts` is the native `TaskTool` backend (`:107-327`, the `background.start` fork at
`:270-295`). It is **NEVER edited** — the dispatch WRAPS it (task-dispatch.ts calls
`deps.taskTool.execute`); it does NOT rewrite it. The guide's #1 forbidden:
`git diff -- packages/opencode/src/tool/task.ts` must be EMPTY. Editing it breaks BOTH the
native task path AND the fork's dispatch. Verified: the fork's `git diff --stat` shows ONLY the
3 source files + the test fixture — `task.ts` is byte-identical to vanilla 1.14.51.

### 2.6 The surgical-patch summary (the exact replication list)

| # | File | Change | Type |
|---|---|---|---|
| 1 | `src/tool/task-dispatch.ts` | NEW (118 lines) — `makeTaskDispatch` (createLiveToolPart → TaskTool.execute → completeToolCall) | NEW |
| 2 | `src/session/processor.ts` | +37 — the `ulid` import + the Handle field (`:54`) + the impl (`:218`) + the Handle return (`:848`) | SURGICAL |
| 3 | `src/session/prompt.ts` | +90/-32 — the import (`:52`) + widened pick (`:527`) + taskTool (`:536`) + taskDispatch via run.promise (`:538`) + extra (`:565`) | SURGICAL |
| 4 | `test/session/compaction.test.ts` | +18 — the mock Handle's `createLiveToolPart` stub (typecheck only) | TEST |
| — | `src/tool/task.ts` | CLEAN — the FORBIDDEN edit, NEVER touched | NONE |

The **injection point** — where the plugin tools get the rich `context`. `resolveTools` →
`context()` builds the `extra` object that carries `taskDispatch`.

```ts
// the import (prompt.ts:52)
import { makeTaskDispatch, type TaskDispatchFn } from "@/tool/task-dispatch"

// the widened processor pick (prompt.ts:527)
processor: Pick<
  SessionProcessor.Handle,
  "message" | "updateToolCall" | "completeToolCall" | "createLiveToolPart"
>

// the taskTool from the registry (prompt.ts:536)
const { task: taskTool } = yield* registry.named()

// the taskDispatch built via run.promise (prompt.ts:538) — the EffectBridge
const taskDispatch: TaskDispatchFn = (params) =>
  run.promise(
    makeTaskDispatch({
      processor: input.processor,
      taskTool,
      promptOps,
      sessionID: input.session.id,
      agent: input.agent.name,
      abort: options.abortSignal!,
      messages: input.messages,
      ask: (req) =>
        permission
          .ask({
            ...req,
            sessionID: input.session.id,
            tool: { messageID: input.processor.message.id, callID: options.toolCallId },
            ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
          })
          .pipe(Effect.orDie),
    })(params),
  )

// the extra injection (prompt.ts:565)
extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps, taskDispatch },
```

**THE EFFECT-BRIDGE RULE (CRITICAL):** `taskDispatch` is built via `run.promise` — the
EffectBridge's runner (`const run = yield* runner()` at prompt.ts:532-533, `runner()` returns
`EffectBridge.make()`). **NEVER naked `Effect.runPromise`** — the naked form drops the Instance
ALS (AsyncLocalStorage) → "No context found for instance". The EffectBridge's `run.promise`
preserves the ALS so the makeTaskDispatch Effect (which touches processor/session services)
resolves them. This is WHY the fork works where the naive `Effect.runPromise` path failed.

The `handleSubtask` path (`prompt.ts:701-855`) is UNTOUCHED — it's the synchronous subtask
path the guide forbids (the child hangs). The `createLiveToolPart` fork REPLACES it.

---

## 3. THE PLUGIN SIDE (the wave manager — the 2 files)

### 3.1 `src/tools/wave-pipeline.ts` (363 lines) — executeDispatch

The plugin's dispatch: read the prompt files BYTES (zero model transcription), sha256-verify
against the manifest, `validateTaskPromptLines`, then call `context.extra.taskDispatch`.

```ts
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
  const dispatched: Array<{ name: string; sessionId: string; partID: string; callID: string; sha256: string; lines: number }> = []
  const failed: Array<{ name: string; error: string }> = []

  for (const agent of manifest.agents) {
    const file = path.join(tmpDir, agent.name + ".md")
    let content: string
    try {
      content = fs.readFileSync(file, "utf-8")
    } catch (e) {
      failed.push({ name: agent.name, error: "prompt file missing: " + file })
      continue
    }
    const sha = createHash("sha256").update(content).digest("hex")
    if (agent.sha256 && sha !== agent.sha256) {
      failed.push({ name: agent.name, error: "[WAVE VERBATIM] SHA mismatch for " + agent.name })
      continue
    }
    const v = validateTaskPromptLines(content)
    if (!v.passed) {
      failed.push({ name: agent.name, error: "[TRIDENT PROMPT FILE] DPL1 failed: " + v.lines.join(" | ") })
      continue
    }
    try {
      const result = await taskDispatch({
        description: agent.name,
        prompt: content,          // THE FILE BYTES — zero model transcription
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
  }

  return { wave: manifest.wave, dispatched, failed }
}
```

**The 6 steps in order:**
1. **The loud fork check** (`wave-pipeline.ts:288-290`): `typeof context.extra?.taskDispatch !== "function"` → throw `[DISPATCH] context.extra.taskDispatch is missing — this runtime is not the 1.14.51 task-dispatch fork`. NEVER a silent fallback.
2. **tmpDir resolution** (`:292`): `resolveTmpDir(opts.tmpDir)` — NEVER honors `args.dispatchDir` (the W3 footgun).
3. **findManifest** (`:294`): the wave-level manifest (`.wave-manifest-<wave>.json`), matched by waveId.
4. **Per agent** (`:298-335`): read the prompt file BYTES, sha256-verify against the manifest's recorded sha (else `[WAVE VERBATIM] SHA mismatch`), `validateTaskPromptLines` (else `[TRIDENT PROMPT FILE] DPL1 failed`), then `await taskDispatch({description, prompt: content, subagent_type, background: true})`.
5. **Record** `sessionId / partID / callID / sha256 / lines`.
6. **Return** `{wave, dispatched, failed}` — per-agent errors go in `failed`, do NOT abort the rest.

**The `prompt` is file BYTES, not a path string, not a summary.** The wave-pipeline passes the content it read — zero model transcription of the dispatch prompt.

### 3.2 `src/tools/wave-dispatch.ts` (1013 lines) — action=dispatch

The wave-manager tool factory. The dispatch branch (before `release`):

```ts
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
```

The action enum (line 854):
```ts
action: z.enum(['generate', 'dispatch', 'status', 'kill', 'kill-wave', 'steer', 'pause', 'resume', 'release'])
```

The context type widened (line 867):
```ts
context: { sessionID?: string; extra?: { taskDispatch?: TaskDispatchFn } },
```

**The generate fallback stays `executeWaveDispatch`** (the shadow brain). `weaveDpl1Prompt` is
the sandbox stand-in, NOT the production generate.

---

## 4. THE SHADOW BRAIN (the generator — the 80/20 polish)

### 4.1 The 80% weave (deterministic, 0 LLM)

`src/tools/shadow/shadow-slot-injector.ts:92` `weave(skeleton, spec)` — the 84-slot map
replaces `[WEAVE: mission|knownContext|doctrine|measurements|acceptance|taskTargets|position|readingOrder|...]` in the golden template skeleton (`extractTemplateSkeleton` from the
trident-dispatch-templates skill). `shadow-brief-builder.ts:80` `buildBrief()` prepends the
`SUPREMACY_CONTRACT` (the frozen L4 text) + the `[SHADOW INFERENCE]` section + the woven
skeleton = **a 125+ line structurally-valid prompt with ZERO LLM**.

### 4.2 The 20% polish (the LLM's ONLY job)

`src/tools/shadow/shadow-runner.ts:1092` `buildPiSystemPrompt()` — the POLISHER law:

```
'You are the SHADOW BRAIN — the dispatch prompt POLISHER. The pre-woven brief you receive is
 70-80% done: 84 slots placed, filepaths inserted, 7 context args woven, SUPREMACY CONTRACT +
 [SHADOW INFERENCE] present, 125L+ structurally valid. Your output IS the brief, surgically
 edited for narrative flow — 0 CoT leak.'
'YOUR JOB IS ONLY 20%: clean where mechanical weave left disjointed slop, confusion, or
 derailment fuel. Surgically edit those sections. The 7 context args are RAW MATERIAL already
 woven — keep them, fix flow where needed. ... Do NOT rewrite the entire doc from scratch.'
'ANTI-PATTERNS — VIOLATING ANY = REJECT:
 - DONT throw away — the pre-woven brief IS the doc. Polish, don't replace.
 - DONT water down — keep all 7 woven args, don't summarize into thin stubs.
 - DONT rewrite whole doc — edit disjointed sections surgically, keep structure.
 - DONT invent paths — keep exact filepaths provided (/src/ + /home/ equally valid).
 - DONT leak thinking — output ONLY final doc, first line "EXECUTE THE FOLLOWING … VERBATIM".
 - Minimum 125L (target 200-350L). ...'
```

`buildPiDemand()` (line 1143) passes the pre-woven brief + the context chain; the PI loop
(`runPiLoop`, line 829) runs the model with the scoped read-only tools (read_file/grep/stat),
feeds `[TOOL_RESULT]` back, and the **POLISH GUARD** (line 887) blocks CoT leaks + rewrites.

### 4.3 The validator's `/src/` fix

`src/tools/trident-preflight.ts:60` — the DPL1 absolute-path regex:

```ts
const absPaths = (prompt.match(/(?:\/home\/|\/root\/|\/tmp\/|\/var\/|\/usr\/|\/etc\/|\/opt\/|\/workspace\/|\/app\/|\/mnt\/|\/src\/|C:\\|\/Users\/)/g) || []).length;
```

**The `|\/src\/` is the fix.** The container's fork source lives at `/src/opencode/...` — the
old regex (host paths only) counted container paths as 0 → `fewer than 3 absolute file paths` →
the DPL1 failed despite the filepaths existing. Adding `/src/` made the container paths count.

### 4.4 The thinking-leak extraction

`shadow-runner.ts:583` `extractFinalPrompt` — the LAST `EXECUTE THE FOLLOWING <TYPE> VERBATIM`
opener + the fence/scaffold/drafting-scratchpad strips. `detectThinkingLeak` (`:723`) + the
`DRAFTING_MARKERS` lexicon (37 entries incl the Nemotron planning patterns) + the fragment-opener
check. `shadow-brain.ts` keeps `reasoning_content` OUT of content (`if(dc) content+=dc else if(rc)`).

---

## 5. THE CONTAINER-TEST MODEL-PIN FIX (the 20-min hang root cause)

`src/tools/container-test.ts:945` + `:2032` hardcoded:
```ts
const modelFlag = `--model opencode-go/deepseek-v4-flash`;
```

**THE BUG:** every setup/restart injected `--model opencode-go/deepseek-v4-flash` into the
launch. That model does NOT exist in the image (only nvidia + openrouter). The fork booted with
a nonexistent model → every model call spun forever (the 20-min hang, 77% CPU, unresponsive TUI).

**THE FIX (2026-08-19):**
```ts
const envModelFlag = (typeof process.env.CT_MODEL_FLAG === 'string' && process.env.CT_MODEL_FLAG.trim().length > 0)
  ? `--model ${process.env.CT_MODEL_FLAG.trim()}`
  : '';
const modelFlag = envModelFlag;
```

The pin is now env-gated (`CT_MODEL_FLAG`); default EMPTY → the image's baked config model
(`nvidia/nvidia/nemotron-3.5-lightning-30b-a3b`) wins. Both the setup (`:945`) and the restart
(`:2032`) use it.

---

## 6. THE EFFECT SYSTEM (how the dispatch connects to the backend)

### 6.1 What Effect is here

The opencode runtime uses Effect (the `effect` package, beta). The session prompt/processor are
Effect services (`SessionPrompt.Service`, `SessionProcessor.Service`). The plugin's tools run
inside the runtime's Effect context — their `Tool.Context` carries the services.

### 6.2 The ALS (AsyncLocalStorage) — the critical mechanism

`InstanceState` is AsyncLocalStorage-backed. When a plugin tool executes, the runtime's
`resolveTools` → `context()` factory captures the current Instance ALS. The `runner()` is
`EffectBridge.make()` — its `run.promise` preserves the ALS across the async boundary.

**WHY `run.promise` and NOT `Effect.runPromise`:** a naked `Effect.runPromise` on a
promptOps/processor Effect drops the Instance ALS → "No context found for instance" when the
Effect yields a service. The EffectBridge's `run.promise` keeps the ALS alive, so
`makeTaskDispatch`'s Effect (which touches `processor.createLiveToolPart` + `taskTool.execute`)
resolves the runtime services.

### 6.3 The dispatch's Effect chain

```
context.extra.taskDispatch(params)           // prompt.ts:538 — the JS wrapper
  └─ run.promise(makeTaskDispatch({...})(params))   // the EffectBridge
       └─ Effect.fn("TaskDispatch.run")             // task-dispatch.ts:54
            ├─ yield* processor.createLiveToolPart  // the card + ctx.toolcalls
            ├─ yield* taskTool.execute(...)         // the NATIVE TaskTool Effect
            │    └─ sessions.create({parentID})     // task.ts:144-161
            │    └─ ops.prompt (the child run)      // task.ts:182
            │    └─ background.start                // task.ts:270-295 (the async fork)
            └─ yield* processor.completeToolCall    // the card → completed
```

The `metadata` callback (task-dispatch.ts:82-97) wires `processor.updateToolCall(callID, ...)`
so the card's title/metadata/sessionId update LIVE during the child run.

---

## 7. THE CONTAINER TEST (the proof)

### 7.1 The image

`FORGE_DESKTOP/Dockerfile`:
```dockerfile
FROM runtime-grade-container-sandbox:master
COPY opencode /src/opencode                                    # the 3-patch fork
COPY plugin-dist/index.js /root/.config/opencode/plugins/trident/dist/index.js
COPY forge-config.json /root/.config/opencode/config.json      # nvidia + openrouter + bg_subagents
RUN printf '#!/bin/sh\nexec bun run --conditions=browser --cwd /src/opencode/packages/opencode src/index.ts "$@"\n' > /usr/local/lib/node_modules/opencode-ai/bin/opencode && chmod +x ...
WORKDIR /src/opencode/packages/opencode
```

Built `forge-fork-test:v1` (ac10d966dc59, 6.34GB). The launcher runs the FORK SOURCE (not the
prebuilt master binary).

### 7.2 The setup + the test

```
trident-container-test action=setup containerName=forge-dispatch-test image=forge-fork-test:v1
  distPath=.../dist/index.js testPlan=<the 5-scenario plan>  → tuiUp true
```

The fork boots clean (after the model-pin fix): `bun run --conditions=browser src/index.ts`
NO `--model` flag → the config's `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` is the session
model (verified in the dev.log: `session ... model={"id":"nvidia/nemotron-3.5-lightning-30b-a3b","providerID":"nvidia"}`).

### 7.3 The generate (the shadow brain)

The agent called `trident-wave-manager [action=generate, waveId=babysit]` with 2 agents
(te-s1 E1, te-s2 E2) + dense context args (all floors met: mission/knownContext 200c+,
doctrine/measurements/acceptance/taskTargets 100c+, position 50c+). The shadow brain ran
parallel (CONCURRENT_GENERATIONS=15) → wrote:

```
te-s1.md  125 lines  sha256 c9968665...  status ready  generationMs 211475
te-s2.md  166 lines  sha256 78b01559...  status ready  generationMs 399852
.wave-manifest-wave-babysit-1787093328716.json  agents:[2]
```

**The polish PROPAGATED:** te-s1.md is CLEAN (`EXECUTE THE FOLLOWING FORENSIC CONTEXT
EXTRACTION VERBATIM` — no "Let me start writing", no `might be the beginning`). The old
`5c097b49` dist would have produced the 236-line drafting leak. The `/src/` fix + polisher +
extractFinalPrompt ALL WORKED.

### 7.4 The dispatch (the payoff)

The agent called `trident-wave-manager [action=dispatch, waveId=wave-babysit-1787093328716]`.
`executeDispatch` read the files BYTES, sha256-verified, `validateTaskPromptLines` passed,
called `context.extra.taskDispatch` per agent → the fork's `makeTaskDispatch` →
`createLiveToolPart` + `TaskTool.execute background:true` → the children spawned async.

**The dispatch JSON:** `dispatched: [{te-s1, ses_fe8e804d3..., prt_01717fb2..., callID, sha256, 125}, {te-s2, ses_fe8e804c9..., prt_01717fb3..., callID, sha256, 166}], failed: []`.

**The TUI cards:**
```
│ Trident_explore Task — te-s1 (background)
└ 18 toolcalls
│ Trident_explore Task — te-s2 (background)
└ 14 toolcalls
```

**The children are REAL sessions** (`ses_fe8e804d3...`, `ses_fe8e804c9...`) tethered to the
parent, and the parent agent stays `build`.

---

## 8. THE 5-LAYER FIREWALL (the security upgrade that rode along)

`src/hooks/agent-state.ts` — the container-interaction firewall. The OLD classifier was a
string-position regex that let `timeout 25 docker exec ...` + `docker cp <plain-path> container:`
BY-PASS (the live breach). The 5-LAYER upgrade (ISE-compliant: regex = DETECTOR, state machine
= DECISION):

| Layer | What | Mechanism |
|---|---|---|
| L1 | TOKENIZER | quote/heredoc-aware argv split (strings ≠ verbs) |
| L2 | WRAPPER-STRIP | timeout/sudo/env/bash -c (docker exec stays CORE) |
| L3 | VERB-CLASS | docker exec/run/cp + tmux send-keys/pipe-pane → BLOCK BY VERB ALWAYS |
| L4 | TARGET-CHECK | known test container → BLOCK_TARGET (defense-in-depth) |
| L5 | FAIL-CLOSED | any docker/tmux that doesn't parse clean → BLOCK |

The corpus test (`src/tests/ct-firewall-classifier.test.ts`, 37 cases) proves all the old
bypass commands now BLOCK + the legit reads PASS.

---

## 9. THE FAILURE HISTORY (what was tried and why it failed — the 7 hours)

| Attempt | What | Why it failed |
|---|---|---|
| P4 — Effect runtime capture | the plugin runs `promptOps.resolvePromptParts` | PROVED the Effect RUN works (the ALS propagates) |
| P5 — background fork | `runFork(promptOps.prompt(...))` runs the child async | PROVED the child RUN is programmatic (6ms, 88 parts) |
| P6 — the card via updatePart | the plugin writes `tool:"task"` via `client._client.request → updatePart` | DATA TRUE / RENDER FALSE — the synthetic callID isn't a live `ctx.toolcalls` entry → no inline render. **THE P6 LESSON: the card needs the LIVE ctx.toolcalls entry.** |
| M37 — stripped dispatch | removed `action=dispatch` | the programmatic spawn was failing (phantom/hang/corruption) |
| The Grok/babysit fork | add `createLiveToolPart` (the live entry) + `taskDispatch` (the wrapper) | THE FIX — the fork + the plugin dispatch |
| The generate DPL1 fail (wave-babysit-1787071582279) | the shadow brain produced <125 lines / CoT leak | the `|\\/src\\/` regex fix + the polisher + the extractFinalPrompt strip |
| The 20-min hang | `container-test.ts` hardcoded `--model opencode-go/deepseek-v4-flash` | the model-pin env-gate fix (`CT_MODEL_FLAG`) |

---

## 10. THE BUILD + THE ARTIFACTS

**The build (the operator's "WE ONLY BUILD WITH BUN"):**
```bash
cd v4.4.2-wave-manager-async
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect
# Bundled 461 modules, index.js 16.32MB
```

**The dist:** `c782ddc87a8b49c32071fd8464e65d6aeb2c5da9aec243f15b82026d3793fcff`

**The checkpoint:** `Checkpoints/mechanical-subagent-dispatch-proven-grok-built/`
- `dist-index.js` = c782ddc8 (the PROVEN bundle)
- `sha256.txt` = the full sha
- `src/` = 304 files (the full source)

**The test battery:** `cd src && bun test` → 587 pass / 0 fail / 1773 expects.

---

## 11. THE REPLICATION RECIPE (from scratch)

1. **Fork the runtime:** `git clone` opencode 1.14.51 (a462b1c10) → apply the 3 patches
   (task-dispatch.ts NEW + processor.ts +createLiveToolPart + prompt.ts +extra.taskDispatch).
2. **Build the plugin:** the wave-pipeline.ts executeDispatch + wave-dispatch.ts action=dispatch
   + the shadow-runner polisher + the trident-preflight `/src/` fix + the agent-state firewall.
   `bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect`.
3. **Build the image:** `docker build -t forge-fork-test:v1 FORGE_DESKTOP` (FROM master + the
   patched fork + the plugin dist + the config + the fork launcher).
4. **Setup:** `trident-container-test action=setup containerName=forge-dispatch-test image=forge-fork-test:v1 distPath=<dist> testPlan=<5-scenario>`.
5. **Boot clean:** ensure the fork runs WITHOUT `--model opencode-go/deepseek-v4-flash`
   (the model-pin fix) so the config's nvidia model wins.
6. **Generate:** the agent calls `trident-wave-manager [action=generate, waveId=babysit]` with
   2 dense agents → te-s1.md + te-s2.md + manifest agents:[2] ready.
7. **Dispatch:** the agent calls `trident-wave-manager [action=dispatch, waveId=<wave>]` →
   the JSON `dispatched[].sessionId/partID/callID` + `failed:[]` + the TUI
   `│ Trident_explore Task — <name> (background)` cards + the children tethered + parent build.

---

## 12. THE HONEST REMAINDER

- The generate took ~7 minutes for 2 agents (the NVIDIA model call is slow; the parallel pool
  ran both, but the model latency dominated). Not a pool issue.
- The `SHADOW-INFERENCE` flag in the ERROR files is advisory (the section IS in the files; the
  flag fires on a delimiter-form mismatch) — it does NOT block the manifest's `ready` (which is
  gated by `validateTaskPromptLines`, not the flag).
- The dispatch's child agents run as `trident_explore` mode subagents — they read the prompt
  files as their task. Their actual work output (the forensic reports) is the next phase.
- The host deploy of the firewall + the dispatch dist is the operator's call (the fork test
  proved the mechanism; the host plugin update is separate).

**THE BOTTLENECK IS BROKEN.** A plugin tool CAN call the native task tool — the wrapper
(`makeTaskDispatch`), the live card entry (`createLiveToolPart`), the EffectBridge (`run.promise`),
and the BYTES dispatch (`executeDispatch`) are the mechanism. It worked live. It's checkpointed.
It's replicable.
