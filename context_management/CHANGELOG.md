# CHANGELOG — THE REAL PI SHADOW AGENT FORK (2026-08-19 Wave-4 — THE SESSION JOURNEY)

**The session journey:** the shadow agent — the wave-manager's dispatch-prompt generator (`trident-task-preflight` tool's `generate` action, `src/tools/trident-task-preflight.ts` + `src/tools/shadow/shadow-runner.ts`) — rebuilt on the REAL headless pi agent runtime (`@earendil-works/pi-agent-core` v0.84.2, forked from `github.com/earendil-works/pi`). The operator's 50× directive: "fork earendil-works/pi and modify it for the shadow agent. runs headless. spawns an ephemeral sidecar process." The monkey-patch `runPiLoop` string loop (hand-rolled `messages: AgentMessage[]` + regex-parsed `[TOOL_CALL]` markers + raw `fetch` to the NVIDIA API) is REPLACED by a real `Agent` with the real `edit`/`read` tools, the 5-provider model set, and the ephemeral spawn. **Wave-4 (2026-08-19): the A3 hang — the last fail — fixed, 559/559 green.** This doc is the full milestone trail + every failure's root cause + the fix + the verification — a fresh agent reads it to know EXACTLY what happened, why, and what remains.

---

## THE MILESTONE TRAIL (chronological — every shipped piece)

### M0 — THE FORK DECISION (the operator's 50× directive)

The operator: "fork earendil-works/pi and modify it for the shadow agent. runs headless. spawns an ephemeral sidecar process." Repeated 50× across the session — the monkey-patch `runPiLoop` (the string loop that made the model re-emit the whole 125-line prompt per round → 5-minute generate) was slop. The REAL runtime: `github.com/earendil-works/pi` (`packages/agent` → `@earendil-works/pi-agent-core` + `packages/ai` → `@earendil-works/pi-ai` + `packages/telemetry` → `@earendil-works/pi-telemetry`).

---

### M1 — THE FORK VENDORED (vendor/pi/ — 232 files)

The real pi monorepo (`earendil-works/pi` v0.84.2, `git clone https://github.com/earendil-works/pi.git --branch v0.84.2`) cloned + vendored:

- `vendor/pi/ai/` (176 files) — `@earendil-works/pi-ai`: the unified LLM API. `src/models.ts` (the `Models` registry), `src/model-catalog.ts` (`flattenModelCatalog`), `src/types.ts` (the `Model` + `AssistantMessage` + `AssistantMessageEvent` shapes), `src/utils/event-stream.ts` (the `AssistantMessageEventStream` class), `src/providers/` (the 40+ provider modules), `src/api/` (the lazy API impls: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`), `src/auth/` (the env-key helpers).
- `vendor/pi/agent/` (50 files) — `@earendil-works/pi-agent-core`: the Agent runtime. `src/agent.ts` (the `Agent` class), `src/agent-loop.ts` (the `runAgentLoop` turn loop), `src/types.ts` (the `AgentTool` shape), `src/harness/tools/` (the REAL tools: `edit.ts`, `read.ts`, `write.ts`, `bash.ts`).
- `vendor/pi/telemetry/` (6 files) — `@earendil-works/pi-telemetry`: the telemetry types.

The 3 `package.json` files created (`vendor/pi/ai/package.json` → `name: "@earendil-works/pi-ai"`, `vendor/pi/agent/package.json` → `name: "@earendil-works/pi-agent-core"`, `vendor/pi/telemetry/package.json` → `name: "@earendil-works/pi-telemetry"`) + symlinked into `node_modules/@earendil-works/` (`ln -s ../../vendor/pi/ai node_modules/@earendil-works/pi-ai` etc.) so `import { Agent } from "@earendil-works/pi-agent-core"` resolves. The deps installed: `openai` + `partial-json` + `typebox` + `diff` + `ignore` + `yaml` + `@anthropic-ai/sdk` + `@google/genai`.

**Verification:** `ls vendor/pi/ai/src/providers/data/` → `nvidia.json` etc.; `find vendor/pi -type f | wc -l` → `232`; `bun build` still `EXIT 0` after the vendor.

---

### M2 — THE 5 PROVIDERS (the lightweight strip — 70 files removed)

The operator: "strip all providers aside from the 3 already configd + opencode go + command code i have 0 intention of every wiring anyhting else and if needed we can jut add them back" + "just keep it lightweight dont complicate it."

Before: `vendor/pi/ai/src/providers/` had 40+ provider files (`anthropic.ts`, `google.ts`, `mistral.ts`, `xai.ts`, `groq.ts`, `openai.ts`, `azure.ts`, `bedrock.ts`, `cerebras.ts`, `together.ts`, `fireworks.ts`, `perplexity.ts`, `cohere.ts`, `vertex.ts`, `cloudflare.ts`, `huggingface.ts`, `openrouter.ts`, `deepseek.ts`, `nvidia.ts`, `opencode.ts`, `opencode-go.ts`, `faux.ts`, etc.).

After: ONLY `deepseek.ts` + `deepseek.models.ts`, `nvidia.ts` + `nvidia.models.ts`, `opencode.ts` + `opencode.models.ts`, `opencode-go.ts` + `opencode-go.models.ts`, `openrouter.ts` + `openrouter.models.ts`, `faux.ts` (the test faux) + the shared `index.ts`/`types.ts`. `ls vendor/pi/ai/src/providers/*.ts | wc -l` → `6`.

**Verification:** `ls vendor/pi/ai/src/providers/ | grep -v "^deepseek\|^nvidia\|^opencode\|^openrouter\|^faux\|^index\|^types"` → empty.

---

### M3 — THE MODEL DATA + THE RESOLUTION FIX (THE CRITICAL FIX)

The model catalogs written: the FULL `Model` shape with the short id.

**Before (the bug):** I wrote `{openai-completions: {nemotron-3.5-lightning-30b-a3b: {name: 'Nemotron 3.5 Lightning 30B A3B', limit: 1000000, ...}}}` — the values had NO `id` field. `flattenModelCatalog("nvidia", values)` does `Object.assign({}, ...Object.values(groups))` → `{nemotron-3.5-lightning-30b-a3b: {name, limit, ...}}` without `id` → `getModels('nvidia')` returned `[{id: undefined, name, ...}]` → `getModel('nvidia', 'nemotron-3.5-lightning-30b-a3b')` did `model.id === id` → `undefined === 'nemotron...'` → `undefined` → the harness reported `SHADOW_PI_NO_MODEL: nvidia/nemotron-3.5-lightning-30b-a3b not in the 5-provider set`.

**Also the id format:** the pi catalog uses the SHORT id (`nemotron-3.5-lightning-30b-a3b` — the provider prefix applied separately via `provider: 'nvidia'`), but I passed the FULL `nvidia/nemotron...` (from `SHADOW_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'`). The FULL or a re-prefixed value NEVER matches `getModel(provider, shortId)`.

**After (the fix):** `vendor/pi/ai/src/providers/data/nvidia.json` → `{"openai-completions": {"nemotron-3.5-lightning-30b-a3b": {"id": "nemotron-3.5-lightning-30b-a3b", "name": "Nemotron 3.5 Lightning 30B A3B", "api": "openai-completions", "provider": "nvidia", "baseUrl": "https://integrate.api.nvidia.com/v1", "reasoning": true, "input": ["text"], "cost": {"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}, "contextWindow": 1000000, "maxTokens": 128000}}}` + the 4 other catalogs. The harness's dual-path `models.getModel(provider, opts.modelId) ?? models.getModel(provider, opts.modelId.split('/').pop())` handles both FULL and SHORT.

**Verification:** `cat vendor/pi/ai/src/providers/data/nvidia.json | jq '.["openai-completions"]["nemotron-3.5-lightning-30b-a3b"].id'` → `"nemotron-3.5-lightning-30b-a3b"`; `src/tests/pi-model-resolve.test.ts` → `createShadowModels().getModel('nvidia', 'nemotron-3.5-lightning-30b-a3b')` returns `{id: 'nemotron-3.5-lightning-30b-a3b', provider: 'nvidia'}` → `1 pass`.

---

### M4 — THE HARNESS (src/tools/shadow/shadow-pi-agent.ts — the REAL Agent)

The real Agent harness replacing the monkey-patch `runPiLoop`:

- `createShadowModels(): Models` — the 5-provider registry.
- `createShadowReadTool(promptFilePath): AgentTool` — `Type.Object({filepath: Type.String})`, `fs.readFileSync` → the `=== FILE: ... (lines) ===\n` content.
- `createShadowEditTool(promptFilePath): AgentTool` — `Type.Object({oldText: Type.String, newText: Type.String})`, `fs.readFileSync` → `indexOf(oldText)` → uniqueness check → `fs.writeFileSync` — THE ONLY WRITE PATH.
- `runShadowPiAgent(opts)` — the ephemeral Agent run: `new Agent({initialState: {systemPrompt, model, tools: [read, edit]}, streamFn, getApiKey})`, the loop `for (round=1; round<=4; round++)` — 1 mandatory + optional 2-3 + 4 cap, the `effectivePrompt` demand wire (Wave-4), the test-aware pacing (Wave-4), the validated-break, the fileStates ground truth, the loud-fail detection.

**Verification:** `src/tests/pi-model-resolve.test.ts` + `src/tests/shadow-runner.test.ts` A1 → the read-before-write (`scriptedReadStream` → the REAL `read` tool).

---

### M5 — THE RUNNER WIRING (the ephemeral flow — the 13-step pipeline)

The `runPiLoop` call in `shadow-runner.ts` replaced:

```ts
const piFilePath = path.join(outDir, sanitizeName(spec.name) + '.md');
fs.writeFileSync(piFilePath, promptText, 'utf-8');   // the weave → the real .md
const pi = await runShadowPiAgent({
  promptFilePath: piFilePath,
  systemPrompt: buildPiSystemPrompt(),
  demand: buildPiDemand(brief, ctx.chainUsed.text, ''),  // THE DEMAND WIRE (Wave-4)
  modelId: SHADOW_MODEL, provider: 'nvidia', maxRounds, signal,
  streamFn: options.streamFn,  // the test's scripted stream OR undefined → the real models.streamSimple
});
if (pi.text && pi.text.trim().length > 0) promptText = pi.text;
else { try { fs.unlinkSync(piFilePath); } catch {} promptText = ''; }  // THE A2 LOUD-FAIL
if (!pi.text) return errorManifest(spec, outDir, 'PI_LOOP_EMPTY: ' + why + ' — NO mechanical fallback');
```

The 13 steps: tether → sidecar lifecycle → ShadowMemory.open → reattach gate → validate → buildContext (chain + [SHADOW INFERENCE]) → weave → `runShadowPiAgent` → silentVerify → appendPrompt → manifest STRING.

**Verification:** the battery `559 pass / 0 fail` (A1-A5 all green after Wave-4).

---

### M6 — THE BUILD (1541 modules, 18.33MB, EXIT 0)

```bash
bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect
# → Bundled 1541 modules, index.js 18.33MB, EXIT 0
# (was 461 modules / 16.32MB before the fork — the pi runtime added ~1080 modules)
```

The deps: `openai` + `partial-json` + `typebox` + `diff` + `ignore` + `yaml` + `@anthropic-ai/sdk` + `@google/genai`. The operator: "WE ONLY BUILD WITH BUN" — esbuild FORBIDDEN.

---

### M7 — Wave-4: THE A3 HANG FIX (2026-08-19 — the last fail → 559/559 green)

The last fail: `A3 THE COHERENCE [5000ms] timeout` at `shadow-runner.test.ts:556` — the double-pipeline test (2 sequential `runShadowPipeline` calls in ONE `withSandbox` session: `withSandbox` → `makeSandbox` + env scoping `TRIDENT_PREFLIGHT_MEMORY_ROOT = sb.memRoot` + `TRIDENT_PREFLIGHT_SIDECAR_DIR = sb.sidecarDir` per test).

**The 3 root causes + the fixes (one sweep):**

| Fix | File:line | The bug | The fix |
|---|---|---|---|
| 1. The pacing | `shadow-pi-agent.ts:223` | `if (round < maxRounds) await sleep(1500)` — unconditional: 4 rounds × 1.5s = 6s > the 5s default `bun:test` timeout → A3 double-pipeline timed out (`5000.14ms`) | `if (round < maxRounds && !opts.streamFn) await sleep(1500)` — the `!opts.streamFn` guard: the scripted streams (the operator's "WHAT FUCKING MOCK BRAIN" — `AssistantMessageEventStream` pushed synchronously, no network) SKIP the NVIDIA RPM gap; the real `models.streamSimple` keeps it. The 4 rounds now finish in ~280ms in the test. |
| 2. The demand wire | `shadow-pi-agent.ts:218-219` | `await agent.prompt(roundPrompt)` — round 1 sent ONLY the generic "ROUND 1 — FIRST EDIT (mandatory). READ the dispatch prompt file, then make the FIRST surgical edit..." (10 words) — the woven brief (`weave` + supremacy + inference + the session chain) never reached the model → the chain `[seq 1]` never appeared | `const effectivePrompt = round===1 && opts.demand ? opts.demand + '\n\n' + roundPrompt : roundPrompt; await agent.prompt(effectivePrompt)` — round 1 now carries `buildPiDemand(brief, chainText, ingestText)` (the 84-slot weave + `THE FILES ARE THE ONLY GROUND TRUTH` + `[SHADOW INFERENCE]` + `## THE CONTEXT CHAIN`). |
| 3. The harness index | `shadow-runner.test.ts:394-420` | `msgs.find(m => m.role==='user')` — `find` returns the FIRST user (the stale round-1 generic `ROUND 1 — FIRST EDIT`) → `log.demands[0]` = the generic, not the demand → `expect(log.demands[1]).toContain('[seq 1]')` failed: `Received: "ROUND 1 — FIRST EDIT..."` | Reverse scan for `lastUser` (the LAST user turn) + the demand filter `if (text.includes('THE WOVEN BRIEF') \|\| text.includes('THE FILE ON DISK IS THE WOVEN')) log.demands.push(text)` — so `demands[0]` = first pipeline's demand (lacks `[seq 1]`), `demands[1]` = second pipeline's demand (contains `[seq 1]` + `wave-a` + `The epoch summary`). |

**Verification:** `cd src && bun test tests/shadow-runner.test.ts --test-name-pattern="A3.*seq" 2>&1 | tail -5` → `1 pass [280ms]` (was `5000.14ms timeout` + `expect(...).toContain('[seq 1]')` fail). The full battery: `cd src && bun test 2>&1 | tail -5` → `559 pass / 0 fail / 1725 expect() calls / Ran 559 tests across 33 files [~1s]`.

---

## THE FAILURES + THE ROOT CAUSES (every failure's mechanism — a fresh agent learns from them)

### F1 — THE MODEL-ID MISMATCH (FIXED — M3)

**Symptom:** `SHADOW_PI_NO_MODEL: nvidia/nemotron-3.5-lightning-30b-a3b not in the 5-provider set` — the `runShadowPiAgent` returned `{text: '', errors: ['SHADOW_PI_NO_MODEL: ...']}` → the runner's `PI_LOOP_EMPTY`.

**Root cause (2 parts):**

1. The data JSON values lacked the `id` field → `flattenModelCatalog("nvidia", values)` did `Object.assign({}, ...Object.values({openai-completions: {nemotron...: {name, ...}}}))` → `{nemotron...: {name, ...}}` without `id` → `getModels('nvidia')` returned `[{id: undefined}]`.
2. The id format: I passed the FULL `nvidia/nemotron-3.5-lightning-30b-a3b` (from `SHADOW_MODEL`) to `getModel('nvidia', fullId)` — the pi catalog's `id` is the SHORT `nemotron-3.5-lightning-30b-a3b` (the provider prefix applied separately via `provider: 'nvidia'` in the `Model` object).

**Fix:** the data JSONs carry the complete `Model` shape with the short `id` + the harness's dual-path `models.getModel(provider, opts.modelId) ?? models.getModel(provider, shortId)` → both FULL and SHORT resolve.

**Lesson:** the `Model.id` field is the registry key — a catalog entry without `id` is invisible to `getModel`. The pi convention: the data key + the `Model.id` is the SHORT id; the provider is the `Model.provider` field.

---

### F2 — THE EPHEMERAL CLEANUP (FIXED — M5)

**Symptom:** the A2 test (`A2 THE DEAD-LLM`) expected `{lines: 0, ready: false}` (NO file on a failed generation) but got `{lines: 89}` (the weave's lines) — the `fs.existsSync(outPath) === false` assertion failed.

**Root cause:** the weave was written to the REAL `.md` (`fs.writeFileSync(piFilePath, promptText)` where `piFilePath = path.join(outDir, name + '.md')`) FIRST, so a failed Agent (the `scriptedErrorStream('SHADOW_BRAIN_TIMEOUT')` → the Agent's `errorMessage`) left the file on disk — the runner checked `pi.text` empty but the file already existed.

**Fix:** the weave goes to the real `.md` (the `fs.writeFileSync(piFilePath)` before the Agent) — on `pi.text` empty → `fs.unlinkSync(piFilePath)` (delete the file) → the `errorManifest` with `lines:0, ready:false`. The earlier "temp file" design (`<name>.pi.md` → `renameSync` on success) was simplified to the real file + the `unlinkSync` on failure — the file edited in place IS the deliverable.

**Lesson:** a failed generation must leave NO file — the loud-fail law: "EITHER A LOUD FUCKING ERROR OR IT WORKS."

---

### F3 — THE A3 HANG (FIXED — M7 / Wave-4)

**Symptom:** `A3 THE COHERENCE [5000.14ms] timeout` at `shadow-runner.test.ts:556` — the double-pipeline test (2 sequential `runShadowPipeline` calls in ONE `withSandbox` session) timed out at the 5s default `bun:test` timeout.

**Root causes (3, one sweep):**

1. **The unconditional pacing** — `shadow-pi-agent.ts:223` `if (round < maxRounds) await sleep(1500)` — 2 rounds per pipeline × 2 pipelines = 4 rounds × 1.5s = 6s > the 5s timeout. The pacing was added for the NVIDIA RPM gap (the operator: "nvidia is unlimited it just rate limits on high requests per minute") but applied to the scripted streams (the test's `AssistantMessageEventStream` pushed synchronously, no network — no RPM to gap).

2. **The un-wired demand** — `shadow-pi-agent.ts:218` `await agent.prompt(roundPrompt)` — round 1 sent ONLY the generic "ROUND 1 — FIRST EDIT (mandatory). READ the dispatch prompt file..." (10 words) — the woven brief (`weave` + supremacy + inference + the session chain hydrated from `ShadowMemory.lastPrompts`) never reached the model. The `buildPiDemand(brief, chainText, ingestText)` was computed in `shadow-runner.ts:732` but never passed to `runShadowPiAgent`'s `agent.prompt`.

3. **The stale harness index** — `shadow-runner.test.ts:396-406` `const firstUser = msgs.find(m => m.role==='user')` — `find` returns the FIRST user (the stale round-1 generic `ROUND 1 — FIRST EDIT` from the pi Agent's `prompt(roundPrompt)`). The pi loop's 2-round flow appends a NEW user turn per round (`agent.prompt` → `normalizePromptInput` → `runAgentLoop(messages.push(normalized))`), so the second pipeline's `log.demands` captured the generic, not the demand — `expect(log.demands[1]).toContain('[seq 1]')` failed: `Received: "ROUND 1 — FIRST EDIT..."`.

**Fix (one sweep, 3 edits):**

1. `shadow-pi-agent.ts:223` → `if (round < maxRounds && !opts.streamFn) await sleep(1500)` — the `!opts.streamFn` guard: real transport paces, the scripted test path does not.
2. `shadow-pi-agent.ts:218-219` → `effectivePrompt = round===1 && opts.demand ? opts.demand + '\n\n' + roundPrompt : roundPrompt` — round 1 carries the full demand.
3. `shadow-runner.test.ts:394-420` → reverse scan for `lastUser` + `if (text.includes('THE WOVEN BRIEF')) log.demands.push(text)` — the chain assertions see the demand, not the generic.

**Verification:** `cd src && bun test tests/shadow-runner.test.ts --test-name-pattern="A3.*seq" 2>&1 | tail -5` → `1 pass [280ms]` (was `[5000.14ms] timeout`); `cd src && bun test 2>&1 | tail -5` → `559 pass / 0 fail`.

**Lesson:** the pacing's `!opts.streamFn` guard is the test-aware design — the NVIDIA RPM gap is a LIVE constraint, not a test constraint. The demand wire is the chain's lifeline — without it, the session memory (`lastPrompts` + `epochSummary`) never reaches the model. The harness's `lastUser` + demand filter is the correct capture for the 2-round loop's appended turns.

---

## THE KEY DECISIONS (the architecture choices — why each was made)

1. **The real pi Agent over the monkey-patch loop** — the operator's 50× directive. The pi Agent has the real tool execution (the AI-SDK's native `toolCall` events at `agent-loop.ts:326`, not `[TOOL_CALL]` regex markers), the real `edit` tool (the 6 matching strategies at `vendor/pi/agent/src/harness/tools/edit.ts`), the `AssistantMessageEventStream` (the `EventStream` subclass), the `Models.streamSimple` (the 5-provider transport). The string loop made the model re-emit the whole prompt per round → the edit tool makes it surgical.

2. **The ephemeral spawn** — the `Agent` lives ONLY for the `runShadowPiAgent` call (`new Agent({...})` at `:175` → the `for (round)` loop → `return {text: fs.readFileSync(promptFilePath)}` at `:303` → GC). No `AgentSession` DB, no `pi --mode rpc` process, no lingering state. Only the `.md` files persist. The `ShadowMemory.open` sqlite is the session memory — not the Agent.

3. **The file-on-disk IS the deliverable** — `fs.writeFileSync(piFilePath, promptText)` before the Agent → the Agent edits it via the `edit` tool (`fs.writeFileSync(promptFilePath, updated)` inside `createShadowEditTool.execute`) → `fs.readFileSync(piFilePath)` after the loop. The model's `TEXT` ("DONE", the CoT `Let me...`) NEVER lands in the file — the `editsRan && fileHasContent` check distinguishes a successful polish from a dead-LLM.

4. **The 5-provider strip** — the operator: "keep it lightweight dont complicate it" — nvidia (the primary) + openrouter + deepseek + opencode (Zen) + opencode-go (the 3 already configured + the 2 opencode variants). 70 files removed. Adding a provider = drop the file + its `data/*.json` catalog back in.

5. **The 96 enforcement floor** — the operator: "just bump this to 96" — the LLM generation reference stays 125 (the polisher system prompt "aim for 125 lines" + the `lineShortfall` demand); the MECHANICAL enforcement floor is 96 (`ready = v.passed && lines >= 96` at `shadow-runner.ts:816`). A structurally-complete prompt at 118 lines is dispatched.

6. **The pacing is test-aware + the demand is wired** — Wave-4: the `!opts.streamFn` guard + the `effectivePrompt` wire. The 3 fixes that took the battery from `558 pass / 1 fail` to `559 pass / 0 fail`.

---

## THE HONEST DISCLOSURES (what's NOT yet proven — the fresh agent's backlog)

1. **The live NVIDIA generate** — the tests use the scripted `streamFn` (the operator's "WHAT FUCKING MOCK BRAIN" — deterministic, no network). The real `models.streamSimple` → NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` with the real key (`resolveShadowApiKey()` → `NVAPI-*` or `NVIDIA_API_KEY`) is NOT yet exercised. The next step: the real `generate` → the pi Agent edits the promptFile → verify `te-s1.md` + `te-s2.md` on disk (≥96 lines, DPL1-valid), the edits surgical, the Agent gone, the generate fast.

2. **The dead monkey-patch machinery** — `runPiLoop` dead code (~100 lines) + the `brainToPiStream` era + `shadow-polish-guard.ts` + the regex `DRAFTING_MARKERS`/`detectThinkingLeak` legacy — still DEFINED but no longer called. They're superseded by the real pi Agent + the edit tool's CoT-leak impossibility. Remove after the pi path is proven live (no regression: `bun test` → still 559 pass).

3. **The new dist** — the 3 Wave-4 fixes are in `src/` but the `dist/index.js` is the prior build (the `sha256sum` not yet computed for the new dist). The next step: `bun build` → the new dist (1541 modules, ~18.33MB) + the `sha256sum` proof + deploy to the host plugin.

4. **The Checkpoint sync** — `Checkpoints/promptFile-degeneracy-cleaned-up/` → the final dist + src + docs (pending after deploy + live proof).

5. **The 5-provider live auth** — `resolveKeyForProvider` wired but the live key's validity (`curl https://integrate.api.nvidia.com/v1/chat/completions -H "Authorization: Bearer $NVIDIA_API_KEY"`) not yet checked in this session.

## M9 — THE BUILD SUBAGENT IDENTITY PORT (2026-08-20 — the operator's ruling: the full vanilla identity + warheads ported)

**The milestone:** the build subagent (trident_build) now carries the FULL vanilla Trident identity + the 21 warheads, ported into the build subagent's harness + niched for build execution.

**The changes:**
1. **THE MODEL PINNING (src/agents/definitions.ts):** trident_explore → `nvidia/nemotron-3.5-lightning-30b-a3b` (the runtime sandbox master image's nvidia nemotron, 1M context, 128k max, reasoning effort HIGH); trident_build → `opencode-go/muse-spark-1.2-contributor` (the opencode GO endpoint, 1M context, 128k max, reasoning effort MAX). The model field is the STRING format (the `{providerID, modelID}` object breaks config.get — the operator's launch error proved it).
2. **THE TASK TOOL REMOVED FROM ALL AGENTS:** the build agent's `permission: { task: 'allow' }` + `tools: { task: true }` → `task: 'deny'` + the tools field without `task`. The explore agent's `task: 'deny'` (already). The trident primary's `task: 'deny'` (already). The subagents are LEAF NODES — they never spawn; the wave-manager dispatch owns ALL spawning.
3. **THE DEEP PLANNING + CONTEXT SYNTHESIS REMOVED FROM SUBAGENTS:** the subagents' tools field explicitly DISABLES `trident-deep-planning` + `trident-context-synthesis`; the `trident-problem-solving` + `trident-code-audit` stay.
4. **THE BUILD AGENT OVERHAUL (src/subagents/trident-build/identity/t1-prompt.ts):** the stale 47-line niche prompt ("DO NOT THINK. DO NOT DEVIATE.") is RETIRED — the build agent is a niched specialized Trident for build task execution (the Poseidon infra stripped, ALL the build tools enabled by default, the FULL identity + warheads loaded). The TRIDENT_BUILD_T1 carries the full 21 warheads (adapted for build execution: the Poseidon tool mention REMOVED — Poseidon is the orchestrator's, not the build agent's; the subagent orchestration REMOVED — the leaf node; the deep planning + context synthesis REMOVED — the orchestrator's tools; the build-relevant warheads ADAPTED).
5. **THE BOOT PAYLOAD (src/subagents/trident-build/hooks/system-transform-hook.ts):** the system-transform hook now injects the FULL TRIDENT_BUILD_T1 at the session start (the boot payload — the full identity + the warheads delivered), not the 3-line stub.

**The battery:** 561 pass / 0 fail / 1730 expects [~1s] (the build is green, no regression).

**The dist:** `0572128e3dc4d343...` (18.33MB, 1541 modules, EXIT 0).

**The deploy:** the dist path is `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/dist/index.js` (SHA `0572128e...`). Deploy to `~/.config/opencode/plugins/trident/dist/index.js`.


---

## UPDATE 2026-08-21 00:29 UTC — DIST 3d6555a6fbe9553ab557a1394f773cd3ecc950fe4f3714c80200a24024657c1e — SHIP_APPROVED (mechanical_dispatch_SHIP_APPROVED self-contained)
**Dist:** `3d6555a6fbe9553ab557a1394f773cd3ecc950fe4f3714c80200a24024657c1e` (18,409,458 bytes (18.41 MB, 1542 modules)) — `bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect`
**Battery:** `561 pass / 0 fail / 1737 expect` (34 files) + `12005 pass / 0 fail / 37033 expect` (725 files)
**Source:** `src/tools/shadow/shadow-agent.ts` 548 lines — ONE class `ShadowAgent` (pi SDK verbatim: `createModels()+nvidiaProvider` @ `https://integrate.api.nvidia.com/v1` + `NodeExecutionEnv` + `createReadTool/createEditTool`), `MAX_ROUNDS=4 MIN_MANDATORY_ROUNDS=2 STALL_MS=60000` event-aware, `validateFinalText` 6-marker, per-call `chainedStream` `nvidia→inferx Qwen3.6-35B-A3B-FP8→opencode deepseek-v4-flash-free→openrouter laguna-s-2.1:free` `5×5s` + `brokenRungs` circuit breaker, `thinkingLevel: medium` (R1 38s vs 230s verbose).
**Runner:** `src/tools/shadow/shadow-runner.ts` 868 lines — `runShadowPipeline` 13-step, `buildPiSystemPrompt` step4 MANDATORY FINAL EDIT (surgical EDIT must append `~~~~~~~~~~~` + `[SHADOW INFERENCE]`), `buildPiDemand` step4 MANDATORY, `new ShadowAgent(cwd).run` at 730-741, `PI_MAX_ROUNDS=4`.
**Wave Dispatch:** `src/tools/wave-dispatch.ts` — `CONCURRENT_GENERATIONS=15`, per-agent tether `sessionKey: waveId + '-' + spec.name` → distinct `ShadowMemory` roots → TRUE async-parallel, `slice.map(async (spec,idx)=>{if(idx)await sleep(3+rand*14); …})` 3-17ms stagger, `createWaveRegistry` per-agent manifests.
**Templates:** 9/9 ≥100 (E1 101, E2 115, E3 100, E4 100, B1 108, B2 107, B3 104, B4 106, B5 103) — `~/.config/opencode/skills/trident-dispatch-templates/SKILL.md` 61827 bytes.
**Keys:** `NVIDIA_KEY_B64` = new generator `nvapi-O2zMNoOw...` (separate from dispatched `nvidia/nvidia/nemotron` double-prefix build pin `opencode-go/muse-spark-1.2-contributor`), `INFERX_KEY_B64` front-of-laguna Qwen, `OPENCODE_KEY_B64` zen, `OPENROUTER` laguna.
**Checkpoint:** `Checkpoints/mechanical_dispatch_SHIP_APPROVED` — self-contained with `src/`, `dist-index.js` `48e7`, `sha256.txt`, `context_management/`, `DEBUG_LOG.md` 1421 lines (520-line TOTAL BULLSHIT + 320-line theatrical async flagged), `BUILD_REPORT.md`.
**Verification:** `nohup bun run /tmp/wave-3batch-sidecar.ts` → `ELAPSED 436.3s` `alpha 205s 141l` `beta 247s` `gamma 436s` all `ready:true`; `single-nvidia-check` 107l `ready:true` hasInference true; `curl` to nvidia `200 in 0.64s` with new key; `sha256sum` + `grep -c` + `ls -lh` + `bun test` 561 pass.

## 2026-08-24 — SHIP-APPROVED-v2 (dist ab89acbc)
- THE GO-PRIMARY CHAIN: opencode-go/mimo-v2.5 rung 1 (paid); GO/ZEN env-slot split (the vendored provider fix — the sk-lkZj 429 root); the base64 consts retired from the constructor path (env-only + the one GO const).
- THE PINS: explore+build on opencode-go/muse-spark (high/xhigh) — the zen nemotron pins were dead.
- THE CONTROL PLANE: soft/hard steer (hard = abort-then-deliver, the double-esc), agent-matched deliveries (the dynamic type token — the agent-flip class dead), pure-interrupt pause, session-scoped kill, resume DB sync (markResumed + un-archive).
- THE SCOPE: resolveScopeRoot reads the bash workdir (the project anchor) + path-as-root — live-probed resolving the project root.
- Full record: DEBUG_LOG EN 161-166; the v2 checkpoint is self-contained.

## 2026-08-25 — THE SEALED STATE (dist f41153fb, 633/633)
- THE RETURN-INTEGRITY LEXICON (bible-grade): L-TRUNC-1..5 + DANGLING_CONNECTIVE_LEXICON + the state machine + the evidence triads — wired into wave-read + status sessionId (returnTruncated/truncationSignals); the truncated-return class closed (complete = terminated, the flag = whole).
- THE 0-TRUST AUDIT: battery 633/633 · tsc 0 · the 21-case edge probe (2 adjudicated probe-errors) · the container run (lexicon-verify-ct: the tool surface + the spillover gate live).
- THE PUBLIC-REPO KEY SCRUB: every real key (plaintext + b64) → placeholders across src/dist/config/docs; the zero-residue scan verified; the git-history orphan-squash pending.
- Full session record: DEBUG_LOG EN 161-183 · BUILD_REPORT addendum · README (github) v2 sections.
- **EN 196 (2026-08-26): THE COMPLETION-NOTIFICATION QUESTION RESOLVED.** The opencode.db probe proved the vanilla `TaskTool.execute` background-branch inject fires for EVERY `extra.taskDispatch` agent (15/15 sampled injects = wave agents in their orchestrator sessions). The promptAsync `[WAVE MANAGER]` toast was the double-notification bug — DELETED (wave-cron.ts, 87-line surgical diff; the gate is now a pure observer: bookkeeping + remediation steer, never promptAsync). Skill §21.4/21.5/21.8 re-teaching to the vanilla-inject doctrine. Dist `d375c56f…`. 49 pre-existing battery fails isolated three ways as parallel-session drift (repair queued) — 34/0 + 23/0 on the changed paths.
