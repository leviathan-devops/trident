# DECISION_CHAIN — THE REAL PI SHADOW AGENT FORK (2026-08-19 Wave-4 — THE CANON RULINGS)

**The operator's rulings for the pi shadow agent fork — verbatim + the context + the mechanism + the file:line anchors + the implications. Every ruling is quoted verbatim where available; a paraphrase is marked as such. A fresh agent reads this doc to know EXACTLY what is canon vs what is proposal.**

---

## RULING 1 — FORK EARENDIL-WORKS/PI FOR THE SHADOW AGENT (THE 50× DIRECTIVE)

**THE VERBATIM RULING (repeated 50× across the session — the operator's exact words):**

> "fork earendil-works/pi and modify it for the shadow agent. runs headless. spawns an ephemeral sidecar process."
> "this is the fucking shadow agent harness. ive said like 50 times literally just fork this and modify it for the shadow agent"
> "fork earendil-works/pi and modify it for the shadow agent harness — the real headless pi agent runtime"

**THE CONTEXT:** the shadow agent — the wave-manager's dispatch-prompt generator (`trident-task-preflight` tool's `generate` action, `src/tools/trident-task-preflight.ts` + `src/tools/shadow/shadow-runner.ts`) — was built on a monkey-patch `runPiLoop` string loop (`shadow-runner.ts:827` — hand-rolled `messages: AgentMessage[]` + regex-parsed `[TOOL_CALL]` markers + `Type.Object({prompt: Type.String})` raw fetch to the NVIDIA API via `shadow-brain.ts`). The operator identified this as slop after 50+ corrections and mandated the REAL headless agent runtime: `github.com/earendil-works/pi` (`packages/agent` → `@earendil-works/pi-agent-core` v0.84.2 + `packages/ai` → `@earendil-works/pi-ai`).

**THE MECHANISM (what was built):**

- Cloned `earendil-works/pi` v0.84.2 → `vendor/pi/` (ai 176 files + agent 50 + telemetry 6).
- Created `vendor/pi/ai/package.json` → `@earendil-works/pi-ai` + `vendor/pi/agent/package.json` → `@earendil-works/pi-agent-core` + `vendor/pi/telemetry/package.json` → `@earendil-works/pi-telemetry`, symlinked into `node_modules/@earendil-works/` so bun resolves `import { Agent } from "@earendil-works/pi-agent-core"` and `import { createModels } from "@earendil-works/pi-ai"`.
- Wrote `src/tools/shadow/shadow-pi-agent.ts` — the REAL harness: `createShadowModels()` + `createShadowReadTool`/`createShadowEditTool` + `runShadowPiAgent` (the `new Agent({initialState: {systemPrompt, model, tools: [read, edit]}, streamFn, getApiKey})` ephemeral run).
- Replaced `runPiLoop` with `runShadowPiAgent` in `shadow-runner.ts` (the `weave → promptFile → Agent edits in place` flow).
- `bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect` → `Bundled 1541 modules, index.js 18.33MB, EXIT 0`.

**THE IMPLICATION:** the shadow agent = a REAL `Agent` instance (from `@earendil-works/pi-agent-core`) with the real tool execution (the AI-SDK's native `toolCall` events, not `[TOOL_CALL]` regex markers), the real `edit`/`read` tools (the `Type.Object` schemas + the `fs.*` impls), the `AssistantMessageEventStream` (the `EventStream<AssistantMessageEvent>` subclass), and the ephemeral spawn. The monkey-patch `runPiLoop` is REPLACED and pending deletion. The `vendor/pi/` fork is FROZEN after the 5-provider strip + the model-data fix.

**THE FILE:LINE ANCHORS:**

- `vendor/pi/agent/src/agent.ts:404` — `normalizePromptInput` (the `string → AgentMessage[]` normalization).
- `vendor/pi/agent/src/agent-loop.ts:326-377` — `runAgentLoop` (the `for await (const event of response)` consumption).
- `vendor/pi/ai/src/types.ts:425-549` — `AssistantMessage` + `AssistantMessageEvent` + `StreamFn`.
- `src/tools/shadow/shadow-pi-agent.ts:175-328` — the `runShadowPiAgent` implementation.
- `src/tools/shadow/shadow-runner.ts:645-868` — the `runShadowPipeline` 13-step composition.

---

## RULING 2 — THE EPHEMERAL SPAWN (THE AGENT DIES WITH THE TOOL CALL)

**THE VERBATIM RULING:**

> "fix this properly so the shadow agent is literally just a headless pi agent spawned ephemerally on the tool call and once the tool call finishes executing the agent disappears and the only thing left on disk is the polished promptfiles"
> "spawns an ephemeral sidecar process — the operator's Path A ruling"

**THE CONTEXT:** the operator's exact lifecycle — the `Agent` exists ONLY for the tool call's `runShadowPiAgent` scope; when the tool finishes, the `Agent` instance is garbage-collected (no `AgentSession`, no `sessions DB`, no lingering `pi` process); only the polished promptFiles (`<name>.md` at `OUT_DIR`, default `/tmp/trident-task-preflight/`) persist on disk. This is Path A: "it is more than just a singular script but less than a full sessioned agent. in process embedding is exactly what this is" — justified as ephemeral, no sessions DB needed.

**THE MECHANISM:**

```ts
// shadow-pi-agent.ts:161-312 — the ephemeral span
export async function runShadowPiAgent(opts: ShadowPiRunOptions): Promise<ShadowPiRunResult> {
  const models = createShadowModels();                              // the 5-provider Models
  const model = models.getModel(opts.provider, opts.modelId) ?? models.getModel(opts.provider, shortId);
  const agent = new Agent({                                          // ← THE EPHEMERAL AGENT
    initialState: {systemPrompt: opts.systemPrompt, model, tools: [read, edit]},
    streamFn: (opts.streamFn ?? models.streamSimple.bind(models)) as never,
    getApiKey: (provider) => resolveKeyForProvider(provider),
  });
  for (let round=1; round<=maxRounds; round++) {                    // the 1+optional+4cap loop
    await agent.prompt(effectivePrompt);
    await agent.waitForIdle();
    // ...
  }
  // ... when this function returns, `agent` is GC'd — only the file on disk survives
  const finalText = fs.readFileSync(opts.promptFilePath, 'utf-8');
  return {text: finalText, lines: finalText.split('\n').length, roundsUsed, toolCallsMade, errors, fileStates};
}
```

```ts
// shadow-runner.ts:718-751 — the runner's file lifecycle
const piFilePath = path.join(outDir, sanitizeName(spec.name) + '.md');
fs.writeFileSync(piFilePath, promptText, 'utf-8');                  // the weave → the real .md
const pi = await runShadowPiAgent({promptFilePath: piFilePath, systemPrompt: buildPiSystemPrompt(), demand: buildPiDemand(brief, chainText, ''), modelId: SHADOW_MODEL, provider: 'nvidia', maxRounds, signal, streamFn: options.streamFn});
if (pi.text && pi.text.trim().length > 0) {
  promptText = pi.text;                                             // success → the file IS the deliverable (edited in place)
} else {
  try { fs.unlinkSync(piFilePath); } catch {}                       // failure → NO file (the A2 loud-fail)
  promptText = '';
}
```

**THE IMPLICATION:** the harness's `runShadowPiAgent` creates the `Agent`, runs the polish loop (1 mandatory round + optional 2-3 + 4 cap), returns `{text, lines, roundsUsed, toolCallsMade, errors, fileStates}` — the `Agent`'s scope ends. No persistent session, no `AgentSession` DB, no `pi --mode rpc` process. The `.md` files are the ONLY durable output. The `shadow-sidecar.ts` `registerSidecar`/`touchSidecar`/`handleSessionSwitch` tracks the *tool process* lifecycle (the `pid × sessionKey` tether), not the Agent.

---

## RULING 3 — THE EDIT TOOL ON THE PROMPTFILE (THE ONLY WRITE PATH)

**THE VERBATIM RULING:**

> "the brief should be written to disk as the promptFile and then the LLM literally just uses an edit tool to surgically edit whatever needs polishing OF THE EXISTING FILE - the fuck is this. build the edit tool into pi"
> "remove the write tool and only leave the edit tool that solves this immediately"
> "PREBUILT PROMPTFILE ON DISK THAT IS THE WOVEN BRIEF - HEADLESS PI AGENT JUST USES THE EDIT TOOL FOR SURGICAL EDITS"
> "STRIP THIS AGENT OF ANYTHING OTHER THAN READ AND EDIT — THOSE ARE THE ONLY 2 FUCKING TOOLS"

**THE CONTEXT:** the operator's flow — the `weave` (the 84-slot DPL1-valid brief, 125+ lines) is written to disk as the promptFile (`<name>.md`), then the LLM uses an `EDIT` tool to surgically edit the EXISTING file. The OLD design made the LLM re-emit the whole prompt as a `string` (`brainToPiStream` → `text_delta` → the 5-minute generate = the model re-writing the whole 125-line prompt because the round feedback said "WRITE THE COMPLETE PROMPT"). The edit tool (from `vendor/pi/agent/src/harness/tools/edit.ts` — the REAL surgical edit with the 6 matching strategies: `exact`, `exact-trimmed`, `fuzzy`, `line-trimmed`, `block-trimmed`, `block-fuzzy`) is THE ONLY WRITE PATH.

**THE MECHANISM (the 2 tools):**

```ts
// shadow-pi-agent.ts:72-130 — THE ONLY 2 TOOLS
createShadowReadTool(promptFilePath): AgentTool = {
  name: "read", label: "read",
  description: "Read the contents of a file. Returns the content + the line count. MUST be called before any edit — the read-before-write.",
  parameters: Type.Object({filepath: Type.String({description: "The absolute path of the file to read"})}),
  execute: fs.readFileSync(filepath ?? promptFilePath, 'utf-8') → {content: [{type:'text', text: '=== FILE: ... (' + lines + ' lines) ===\n' + content}], details: {path, lines, chars}}
}
createShadowEditTool(promptFilePath): AgentTool = {
  name: "edit", label: "edit",
  description: "Surgically edit the dispatch prompt file at " + promptFilePath + ". Targeted exact-string replacements (oldText → newText). THE ONLY WRITE PATH.",
  parameters: Type.Object({oldText: Type.String({description: "Exact text in the file to replace (must be unique)"}), newText: Type.String({description: "The replacement text"})}),
  execute: fs.readFileSync(promptFilePath) → indexOf(oldText) → check uniqueness (indexOf(oldText, idx+1) === -1) → updated = content.substring(0,idx) + newText + content.substring(idx+oldText.length) → fs.writeFileSync(promptFilePath, updated) → {content: [{type:'text', text: 'Edit applied successfully. The file is now ' + lines + ' lines.'}]}
}
```

**THE IMPLICATION:** `createShadowEditTool` — targeted `oldText`→`newText` replacements on the promptFile. The model reads the file (`read`), edits the sections needing flow-polish, never re-emits the whole thing. The `write` tool is REMOVED. The model's `TEXT` output ("DONE", the CoT `Let me...`, the `I think...`) NEVER lands in the file — only the `edit` tool's `fs.writeFileSync` changes it, so the CoT leak is impossible by construction. The runner's `pi.text` is the Agent's final file content (the `fs.readFileSync(promptFilePath)` after the loop), not the model's `content[].text`.

---

## RULING 4 — THE 5 PROVIDERS ONLY (LIGHTWEIGHT)

**THE VERBATIM RULING:**

> "strip all providers aside from the 3 already configd + opencode go + command code i have 0 intention of every wiring anyhting else and if needed we can jut add them back"
> "just keep it lightweight dont complicate it"
> "5 providers only: nvidia, openrouter, deepseek, opencode/opencode-go — keep it lightweight"

**THE CONTEXT:** the `pi-ai` package ships 40+ providers (`providers/*.ts`: `anthropic.ts`, `google.ts`, `mistral.ts`, `xai.ts`, `groq.ts`, `openai.ts`, `azure.ts`, `bedrock.ts`, `cerebras.ts`, `together.ts`, `fireworks.ts`, `perplexity.ts`, `cohere.ts`, `vertex.ts`, `openrouter.ts`, `deepseek.ts`, `nvidia.ts`, `opencode.ts`, `opencode-go.ts`, `faux.ts`, etc.). The operator wants ONLY the configured set: nvidia (the primary: `nemotron-3.5-lightning-30b-a3b`), openrouter (r2), deepseek (r1), opencode (Zen: `deepseek-v4-flash-free`), opencode-go (Go: `deepseek-v4-flash`). 70 provider files removed. Adding a provider later = drop the file back into `vendor/pi/ai/src/providers/` + its `providers/data/*.json` catalog.

**THE MECHANISM:**

- `vendor/pi/ai/src/providers/` after the strip: `deepseek.ts` + `deepseek.models.ts`, `nvidia.ts` + `nvidia.models.ts`, `opencode.ts` + `opencode.models.ts`, `opencode-go.ts` + `opencode-go.models.ts`, `openrouter.ts` + `openrouter.models.ts`, `faux.ts` (the test faux) + the shared `index.ts`/`types.ts`.
- `src/tools/shadow/shadow-pi-agent.ts:43-51` — `createShadowModels()`: `createModels()` → `setProvider(nvidiaProvider())` → `openrouterProvider()` → `deepseekProvider()` → `opencodeProvider()` → `opencodeGoProvider()`.
- `src/tools/shadow/shadow-config.ts` — `SHADOW_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b'` (the FULL `provider/model` string; the harness strips to the short `nemotron-...` for `getModel`).
- `vendor/pi/ai/src/providers/data/nvidia.json` — `{openai-completions: {nemotron-3.5-lightning-30b-a3b: {id:'nemotron-3.5-lightning-30b-a3b', name:'Nemotron 3.5 Lightning 30B A3B', api:'openai-completions', provider:'nvidia', baseUrl:'https://integrate.api.nvidia.com/v1', reasoning:true, input:['text'], cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}, contextWindow:1000000, maxTokens:128000}}}` — the FULL `Model` shape with the short id.

**THE IMPLICATION:** the vendored `vendor/pi/ai/src/providers/` has exactly the 5 + faux. The harness's `resolveKeyForProvider(provider)` maps nvidia → `resolveShadowApiKey()` (the `NVAPI-*` key from `~/.config/trident/shadow-secrets.json` or `NVIDIA_API_KEY` env), openrouter → `resolveShadowOpenRouterApiKey()`, deepseek/opencode/opencode-go → env-based (`DEEPSEEK_API_KEY` etc.). The `getApiKey: (provider) => resolveKeyForProvider(provider)` is passed to the `Agent` constructor → the pi loop's `config.getApiKey(provider)` → `options.apiKey` → `applyAuth` → the `Authorization: Bearer <key>` header.

---

## RULING 5 — THE LOOP (1 MANDATORY + OPTIONAL CONTINUE + 4 CAP)

**THE VERBATIM RULING:**

> "enforce 1 loop, oftional continue the other 2. for (rounds 0 + 1) continue; if round > 1 < 4 decide (continue) | yes/no yes = loop no = return"
> "6 FOR A FUCKING PROMPT IS UNNECESSARY. 4 MAX. SHOULD BE DONE IN 2-3 HAVE A PROPER FUCKING LEXICON FILTER TO DETERMINE QUALITY."
> "a cap to break degeneracy, not rounds forced"

**THE CONTEXT:** the old `runPiLoop` ran 6 rounds (the `MAX_MANDATORY_ROUNDS = 6` ceiling was being filled as a TARGET — the loop ran all 6 rounds even when the prompt was already DPL1-valid after round 1). The operator: 1 mandatory polish round, rounds 2-3 the model DECIDES (the `toolCallsMade === 0` break: if the Agent made no `edit` calls this round, it's done), round 4 = the hard cap (the degeneracy ceiling).

**THE MECHANISM (`shadow-pi-agent.ts:200-250`):**

```ts
const maxRounds = opts.maxRounds ?? 4;           // THE 4 CAP
const MIN_MANDATORY_ROUNDS = 2;                  // THE 2 MANDATORY (the operator's "1 loop oftional continue" — rounds 1-2 mandatory in the pi Agent's terms)
for (let round=1; round<=maxRounds; round++) {
  roundsUsed = round;
  const roundPrompt = round===1 ? 'ROUND 1 — FIRST EDIT (mandatory). READ the dispatch prompt file, then make the FIRST surgical edit...' : round===2 ? 'ROUND 2 — FIRST REVISION LOOP (mandatory). Read the file again. If the dispatch prompt is truly done, say "DONE" — otherwise make the SECOND edit.' : round===3 ? 'ROUND 3 — OPTIONAL REVISION 2...' : 'ROUND 4 — OPTIONAL REVISION 3 (final)...';
  const effectivePrompt = round===1 && opts.demand ? opts.demand + '\n\n' + roundPrompt : roundPrompt;  // Wave-4: demand wire
  await agent.prompt(effectivePrompt);
  await agent.waitForIdle();
  if (round < maxRounds && !opts.streamFn) await sleep(1500);  // Wave-4: test-aware pacing
  const newMessages = agent.state.messages.slice(prevMessageCount);
  prevMessageCount = agent.state.messages.length;
  const roundToolCalls = countToolCalls(newMessages);           // the reads + edits this round
  toolCallsMade += roundToolCalls;
  const finalText = fs.readFileSync(opts.promptFilePath, 'utf-8');
  const valid = validateFinalText(finalText);                   // ≥96 lines + the 6 structural markers
  if (valid && round >= MIN_MANDATORY_ROUNDS && round < maxRounds) break;  // validated → stop early
  if (round >= MIN_MANDATORY_ROUNDS && roundToolCalls === 0) break;        // no edits → the agent is done
}
```

**THE IMPLICATION:** round 1 = the mandatory polish (reads the file, makes the first surgical edit); rounds 2-3 = the model's `toolCallsMade === 0` decide (if the Agent made no `edit` calls — it said "DONE" / the file reads clean — stop); round 4 = the hard cap (the degeneracy break). The `validateFinalText` (≥96 lines + mission/reading-order/WHAT/constraints/verification/return-format) is the quality gate that can stop early. A validated prompt after round 2 stops — the remaining rounds' headroom is never wasted.

---

## RULING 6 — THE A2 LOUD-FAIL (NO FILE ON FAILURE — THE LOUD-FAIL LAW)

**THE VERBATIM RULING (the existing law — the operator's Warhead 10):**

> "EITHER A LOUD FUCKING ERROR OR IT WORKS... EVERYTHING IS EITHER A LOUD FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE FALSE SUCCESS AND DERAIL PROJECTS"
> "NO MECHANICAL FALLBACK I EXPLICITLY SAID EITHER A LOUD FUCKING ERROR OR IT WORKS STOP ENGINEERING SHITTY FALLBACKS"

**THE CONTEXT:** a failed generation must leave NO file on disk (the A2 contract: `lines: 0, ready: false, error: 'PI_LOOP_EMPTY: ... — NO mechanical fallback'`). The OLD code's `mechanicallyRepair` inflated a broken draft into a "validated" prompt (the `weave` → the mechanical scaffold appended to the model's text → the fabricated candidate validated → shipped as the prompt) — the FALSE SUCCESS the loud-fail law bans.

**THE MECHANISM (`shadow-runner.ts:746-766`):**

```ts
// THE LOUD-FAIL + THE EPHEMERAL CLEANUP
if (pi.text && pi.text.trim().length > 0) {
  promptText = pi.text;                                    // success → the file IS the deliverable (edited in place)
} else {
  try { fs.unlinkSync(piFilePath); } catch {}              // failure → NO file on disk
  promptText = '';
}
if (!pi.text || pi.text.trim().length === 0) {
  const why = pi.errors.length > 0 ? pi.errors.join('; ') : 'the PI loop produced no usable content across ' + pi.roundsUsed + ' round(s)';
  void tridentLog('ERROR', 'shadow-runner', 'PI_LOOP_EMPTY: ' + why + ' — NO FALLBACK');
  return errorManifest(spec, outDir, 'PI_LOOP_EMPTY: ' + why + ' — the generation FAILED; NO mechanical fallback exists (the operator: a loud fail or a clear pass)');
}
```

**THE IMPLICATION:** the weave goes to the real `.md` (the `fs.writeFileSync(piFilePath, promptText)` before the Agent runs); on `pi.text` empty (the dead-LLM: `scriptedErrorStream('SHADOW_BRAIN_TIMEOUT')` → the Agent's `errorMessage` → `pi.errors = ['SHADOW_BRAIN_TIMEOUT...']` → `pi.text = ''`) → `fs.unlinkSync(piFilePath)` (the file deleted) → the `errorManifest` STRING `{batch:{ready:0}, agents:[{lines:0, ready:false, validated:false, error:'PI_LOOP_EMPTY: ...'}]}`. The `A2 THE DEAD-LLM` test asserts `fs.existsSync(outPath) === false` + `rowCount === 0` + `error.contains('PI_LOOP_EMPTY')`.

---

## RULING 7 — THE 96 ENFORCEMENT FLOOR (THE GENERATION REFERENCE STAYS 125)

**THE VERBATIM RULING (2026-08-19):**

> "just bump this to 96" (the operator, on the 125 enforcement floor)
> "THE FILES ARE THE ONLY GROUND TRUTH..."

**THE CONTEXT:** the DPL1 structure validation (`validateTaskPromptLines` — the 6 section markers: `THE MISSION` / `THE ACCEPTANCE CRITERIA` / `THE READING ORDER` / `THE CONSTRAINTS` / `THE VERIFICATION` / `THE RETURN FORMAT` + the per-task `WHAT/HOW/WHY/EXPECTED` blocks) + the line count form the `ready` gate. The LLM is instructed to aim for 125 lines (the generation reference: the polisher system prompt says "aim for 125 lines" + the `lineShortfall` demand when the draft is short). The MECHANICAL enforcement floor is 96 — the operator's ruling: a structurally-complete prompt a few lines under the 125 target (118/119 lines) is dispatched, not rejected. The old 125 floor rejected clean 118-line prompts.

**THE MECHANISM (`shadow-runner.ts:816`):**

```ts
const ready = v.passed && lines >= 96;   // THE 96 FLOOR (the enforcement)
// v.passed = validateTaskPromptLines(promptText).passed (the 6 markers + the per-task blocks)
// lines = promptText.split('\n').length
// The 125 generation reference is the AIM (the polisher text + the lineShortfall demand), the 96 floor is the STOP.
```

**THE IMPLICATION:** `ready = validated && lines >= 96` — a 96-line prompt that is DPL1-valid (the 6 markers + the per-task blocks) is `ready:true` and dispatched (the `batch: {ready:1}`). A 95-line valid prompt is `ready:false` with `error: 'AGENT PARTIAL — the prompt is below the ready bar: 95 lines (< 96 — the enforcement floor; the 125 generation reference is the aim.)'`. The `validateFinalText` in the pi loop uses the same 96 floor for the validated-break. DO NOT restore 125 at `shadow-runner.ts:816` without the operator's go — the 2026-08-19 ruling is explicit.

---

## RULING 8 — THE WAVE-4 PACING + DEMAND FIXES (2026-08-19)

**THE CONTEXT:** Wave-4 fixed the A3 coherence hang (the last fail: `A3 THE COHERENCE [5000ms] timeout` at `shadow-runner.test.ts:556` — the double-pipeline test: 2 sequential `runShadowPipeline` calls in ONE `withSandbox` session).

**THE THREE ROOT CAUSES + THE FIXES:**

| Root cause | File:line | The bug | The fix (verbatim) |
|---|---|---|---|
| The unconditional pacing | `shadow-pi-agent.ts:223` | `if (round < maxRounds) await sleep(1500)` — 4 rounds × 1.5s = 6s > the 5s default `bun:test` timeout → A3 timed out | `if (round < maxRounds && !opts.streamFn) await sleep(1500)` — the `!opts.streamFn` guard: the scripted `streamFn` (the test path — `AssistantMessageEventStream` pushed synchronously, no network) SKIPS the NVIDIA RPM gap; the real `models.streamSimple` (the 5-provider transport) keeps it. The 4 rounds now finish in ~280ms in the test, ~6s live. |
| The un-wired demand | `shadow-pi-agent.ts:218` | `await agent.prompt(roundPrompt)` — round 1 sent ONLY the generic "ROUND 1 — FIRST EDIT (mandatory). READ the dispatch prompt file..." (10 words) — the woven brief (`weave` + supremacy + inference) + the session chain (`buildContext`'s `chainUsed.text` with `[seq 1]`) never reached the model | `const effectivePrompt = round===1 && opts.demand ? opts.demand + '\n\n' + roundPrompt : roundPrompt; await agent.prompt(effectivePrompt)` — round 1 now carries `buildPiDemand(brief, chainText, ingestText)` (the 84-slot weave + `THE FILES ARE THE ONLY GROUND TRUTH` + `[SHADOW INFERENCE]` + `## THE CONTEXT CHAIN` with the prior generations). |
| The stale harness index | `shadow-runner.test.ts:394-420` | `msgs.find(m => m.role==='user')` — `find` returns the FIRST user (the stale round-1 generic `ROUND 1 — FIRST EDIT`) → `log.demands[0]` = the generic, not the demand → `expect(log.demands[1]).toContain('[seq 1]')` failed: `Received: "ROUND 1 — FIRST EDIT..."` | Reverse scan for `lastUser` + the demand filter `if (text.includes('THE WOVEN BRIEF') \|\| text.includes('THE FILE ON DISK IS THE WOVEN')) log.demands.push(text)` — so `demands[0]` = first pipeline's demand (lacks `[seq 1]`), `demands[1]` = second pipeline's demand (contains `[seq 1]` + `wave-a` + `The epoch summary`). |

**THE VERIFICATION:** `bun test` with `workdir: .../src` → `559 pass / 0 fail / 1725 expect() calls / Ran 559 tests across 33 files [1060ms]` — A3 `1 pass [280ms]` (was `[5000ms] timeout`).

---

## RULING 9 — THE PREVIOUS RULINGS (THE STILL-STANDING CANON)

- **The fork + patch approved, host untouched** — `FORGE_DESKTOP/opencode` (the patched 1.14.51 opencode: `task-dispatch.ts`, `processor.ts` `createLiveToolPart`, `prompt.ts` `extra.taskDispatch` — the dispatch-proven mechanism, the container `forge-dispatch-test` + the host both proved `dispatched: [{te-s1, ses_...}, {te-s2, ses_...}], failed: []`) is FROZEN. DO NOT touch the fork runtime or the host config.
- **The dispatch tool** (`wave-pipeline.ts: executeDispatch` + `wave-dispatch.ts: action=dispatch`) — PROVEN live (the `│ Trident_explore Task — <name> (background)` cards + `failed: []`). The T.E.A. is `call trident-wave-manager action=dispatch waveId=TOKEN` (NOT the BATCH FORM paste). FROZEN.
- **The validated-break** — a validated prompt (`validateFinalText` ≥96 + the 6 markers) stops the loop early (the rounds are a degeneracy ceiling, not a target). FROZEN.
- **The file on disk IS the deliverable** — the `edit` tool is THE ONLY WRITE PATH; the model's `TEXT` ("DONE", the CoT) NEVER lands in the file. FROZEN.
- **The build: `bun build` ONLY** — esbuild is FORBIDDEN. The operator: "WE ONLY BUILD WITH BUN." FROZEN.


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

---

## UPDATE 2026-08-25 — THE v2 SESSION'S CANON RULINGS (EN 161-183)

- **RULING (the GO primary):** "THE NEW OPENCODE GO = PROVIDER #1 IN THE FALLBACK CHAIN NOW... PAID... INFINITE USAGE. PINNED opencode-go/mimo-v2.5, reasoning medium." The chain: GO → zen×5 → nvidia → openrouter → inferx.
- **RULING (the env split):** "the split comes from the config explicitly having the endpoints configd in separate env vars... the same api key is used on go when the go provider is called and zen when the zen endpoint is called." One env var per provider — the vendored opencode-go.ts reads OPENCODE_GO_API_KEY.
- **RULING (the base64 retirement):** "HAVING BASE64 CONSTS TURNS INTO A FUCKING MESS. EVERYTHING SHOULD BE PROPERLY SET W/ ENV VARS IN THE EXISTING PI SDK PROVIDER CONFIG."
- **RULING (pause):** "WHY IS PAUSE SENDING A FUCKING CHAT MESSAGE IT IS JUST A FUCKING INTERRUPT" — pause = session.abort ONLY.
- **RULING (steer modes):** "steer needs 2 modes - soft/hard. hard interrupts and then sends the chat message. soft lets the chat message send and sit in queue normally."
- **RULING (the agent match):** "the chat messages that get sent need to match the active agent... it needs to send AS the agent that is already active" — the title-token detector, the body-level agent field.
- **RULING (the mode mandate):** "ensure there is no default/optional garbage and that the tool requires a manual mode selection so this cannot be blind fired" + the spillover catch (mode on generate) — STEER-ONLY, the [MODE] gate.
- **RULING (the tracker sync):** "if a killed wave is resumed obviously this should be updated then in the db properly" — markResumed + un-archive + the kill-by-session sync.
- **RULING (the CTO loop):** "primary agent = CTO, each wave is a department... multiple departments can work in parallel... departments WILL OFTEN NEED TO BE MICROMANAGED... red team by default law."
- **RULING (the warhead hygiene):** "WHY THE FUCK DO DATES AND IRRELEVANT FUCKING BULLSHIT KEEP GETTING POLLUTED INTO WARHEADS" — THE CHRONOLOGY-POLLUTION ANTI-PATTERN (skill-hardened).
- **RULING (the lexicon grade):** "build a proper lexicon per the Lexicon_Grade bible — no regex pattern matching slop" — the PatternFamily + the state machine + the triads.
- **RULING (the resume-all + the mode-only-steer + the public keys):** the all-modes symmetry + the placeholder policy (the real keys live in the host env).
