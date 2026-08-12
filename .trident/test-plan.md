# THE REASONING-TOKEN CONTAMINATION FIX — CONTAINER TEST PLAN (2026-08-07)

## OBJECTIVE
The shadow brain's raw chain-of-thought (drafting markers: "Let me plan the tool calls", "The skeleton provided in the brief", "Let me count the skeleton lines", "I need to expand") leaked into the FINAL generated dispatch prompts — 2 of the 4 live wave prompts were contaminated (the operator's catch). The root cause: `evaluateCandidate` (src/tools/shadow/shadow-runner.ts:539) cut at the FIRST `indexOf('EXECUTE THE FOLLOWING')` — the model QUOTES the output contract early in its thinking, so the cut landed INSIDE the thinking and the whole drafting session rode along. The structural gates PASSED because the contamination CONTAINS the markers.

THE CHANGES (the diff set):
1. `src/tools/shadow/shadow-runner.ts` — NEW `TEMPLATE_OPENER_RE` (the real "EXECUTE THE FOLLOWING <TYPE> VERBATIM" openers for all 9 templates), NEW `extractFinalPrompt()` (the LAST-real-opener extraction + the fence stripping + the trailing-meta strip — idempotent on clean prompts), NEW `detectThinkingLeak()` (the drafting-marker lexicon + the first-line opener check), NEW `SHADOW_INFERENCE_DELIMITER` ('~~~~~~~~~~~') + `INFERENCE_BRIEF_INSTRUCTION` (the operator's [SHADOW INFERENCE] design: the model writes a DENSE forward-map summary after the prompt, delimited — NOT raw reasoning), `evaluateCandidate` + `fallbackExpansion` now use `extractFinalPrompt`, `silentVerify` gained the THINKING-LEAK flag + the re-extraction repair + the model-brief acceptance for the [SHADOW INFERENCE] presence check, the PI system prompt + the demand + both continuation rounds carry `INFERENCE_BRIEF_INSTRUCTION`.
2. `src/tests/shadow-extract.test.ts` — NEW 16-test battery (the live contamination shapes reproduced, the extraction idempotence, the leak detector, the verifier flag + repair, the brief acceptance). The live battery: 157 pass / 0 fail / 553 expect (the 16 checkpoint-snapshot errors excluded — they are module-resolution failures in the Checkpoints' standalone copies, NOT regressions).
3. `dist/index.js` — rebuilt: 341de6f1c1074e14e51409e77efa4187a59c8287e73bfdd56544398b27ccb8ab (15.99 MB).

THE BLAST RADIUS (the importers): `src/tools/wave-dispatch.ts` imports `runShadowPipeline` from the runner and reads the generated prompt FILE (its `shadowGenerate`); `src/tools/trident-task-preflight.ts` is imported BY the runner (unchanged, but its `mechanicallyRepair` participates in the final write); `src/hooks/trident-hooks.ts` imports the wave-dispatch exports. The container suite MUST prove the END-TO-END live generation is clean: wave dispatch → shadow pipeline → prompt file → batch form — with the REAL DeepSeek V4 Flash call (the auth-gated proof), not the unit mocks.

## TOOLS UNDER TEST
- `trident-wave-dispatch` (the generator: the shadow pipeline + the tmp write + the manifest + the batch-form return) — Scenario 1 + Scenario 2 + Scenario 4.
- `src/tools/shadow/shadow-runner.ts` (the extraction + the detector + the verifier + the brief instruction) — Scenario 1 + Scenario 2 + Scenario 4 (the live generation IS the runner).
- The CTX_FLOORS validation (the shared `validateAgentSpec` — the refusal names the thin field) — Scenario 3 (adversarial).
- The [SHADOW INFERENCE] presence + the SUPREMACY contract (the verifier's L4 blocks) — Scenario 2.
- The blast radius: `wave-dispatch.ts`'s file-read path (the batch form's prompts == the file content) — Scenario 4.

## TEST SCENARIOS

### Scenario 1: THE CLEAN GENERATION (the core fix — E1 template, live shadow brain)
- Feature under test: `extractFinalPrompt` + `detectThinkingLeak` + `evaluateCandidate` in shadow-runner.ts, consumed end-to-end by wave-dispatch.ts's `shadowGenerate`. The REAL DeepSeek V4 Flash call generates the prompt; the final prompt FILE must be clean.
- Prompt: "Run trident-wave-dispatch with agents=[{name:'ct-wave-1', template:'E1', filepaths:['/root/.config/opencode/plugins/trident/dist/index.js','/root/.config/opencode/plugins/trident/package.json','/root/.config/opencode/opencode.json'], mission:'Locate the opencode runtime + SDK installation on this machine and extract the complete Client API surface for session spawning — the exact import paths, the sessions.create/prompt/promptAsync signatures, the parentID field, the subtask part shape. Report with file:line references.', knownContext:'The Trident plugin v4.4.2 is mid-overhaul. The previous wave-dispatch spawn attempt created empty child shells + a 15-deep recursion. The current baseline is generator-only: it returns a batch form of task calls. The wave dispatch is the only subagent dispatch path.', doctrine:'READ-ONLY exploration. Never write/edit/mutate anything. Report every finding with file:line references — a claim without a file:line anchor is a fabrication.', measurements:'The complete table of the SDK Client API surface (function name -> import path -> signature -> return type), the runtime install location + version, the exact Client construction code.', acceptance:'The report MUST answer: (1) where the SDK/runtime lives, (2) the exact import + Client construction, (3) the full sessions API surface with signatures, (4) the failure modes of the plugin\'s client acquisition.', taskTargets:'Find: the sessions.create signature and whether parentID is a field; the difference between session.prompt and promptAsync; the parts.create shape; the subscribe/event types; the config.getClient helper.', position:'The first-principles foundation for the correct wave-dispatch implementation — the exact SDK functions to wire into the tool\'s execute pipeline.'}]" — then present the full tool result verbatim.
- Pass token: `"dispatched"` (the generator's return — a tool result, the wave dispatched) AND the artifact check: the prompt file /tmp/trident-task-preflight/ct-wave-1.md (or the wave dispatch's tmp dir file ct-wave-1.md) STARTS with "EXECUTE THE FOLLOWING" (the extraction landed at the real opener).
- Fail token: `Let me plan the tool calls` (a drafting marker — its presence ANYWHERE in the stream or the file = the contamination survived = FAIL).
- Max wait: 480000 ms (the PI loop: up to 4 DeepSeek rounds at 90-240s each + the wave dispatch overhead).
- Pass criteria: the wave dispatch returns `"dispatched"` (the tool result) AND the ct-wave-1 prompt file starts with "EXECUTE THE FOLLOWING".
- Fail criteria: the fail token `Let me plan the tool calls` appears in the stream or the file.
- Evidence capture: action=check pattern="\"dispatched\""; action=files path="/root/.config/opencode/plugins/trident/dist/index.js" read=false then the tmp prompt file read via action=exec cat (the file's first line + the marker grep); action=check pattern="Let me plan the tool calls" (must be NO match).

### Scenario 2: THE [SHADOW INFERENCE] BRIEF + THE SUPREMACY (the operator's design)
- Feature under test: `INFERENCE_BRIEF_INSTRUCTION` + `SHADOW_INFERENCE_DELIMITER` + the verifier's presence checks in shadow-runner.ts — the generated prompt MUST carry the shadow's understanding section (the model-written brief after the ~~~~~~~~~~~ delimiter OR the mechanical fallback) + the frozen L4 supremacy contract.
- Prompt: (no new send — the SAME wave-1 file from Scenario 1 is checked) — the agent is asked: "Read the generated prompt file for ct-wave-1 and report: does it contain the [SHADOW INFERENCE] section and the exact phrase THE FILES ARE THE ONLY GROUND TRUTH? Quote the first 3 lines of the [SHADOW INFERENCE] section."
- Pass token: `[SHADOW INFERENCE]` (in the file / the tool result) AND `THE FILES ARE THE ONLY GROUND TRUTH` (the supremacy — a tool result / the file read).
- Fail token: `SHADOW-INFERENCE: the` (the verifier's missing-section flag — its presence = the repair failed = FAIL).
- Max wait: 120000 ms (a file read + a short report — no generation).
- Pass criteria: the pass tokens `[SHADOW INFERENCE]` AND `THE FILES ARE THE ONLY GROUND TRUTH` appear in the file/tool result.
- Fail criteria: the fail token `SHADOW-INFERENCE: the` appears (the verifier's missing-section flag).
- Evidence capture: action=check pattern="[SHADOW INFERENCE]"; action=check pattern="THE FILES ARE THE ONLY GROUND TRUTH"; action=check pattern="SHADOW-INFERENCE: the" (must be NO match).

### Scenario 3: THE THIN-ARGS REFUSAL (adversarial — the CTX_FLOORS gate)
- Feature under test: `validateAgentSpec` (the shared CTX_FLOORS — the refusal names the thin field + the shortfall) — a wave dispatch with an undersized mission arg MUST be refused BEFORE any generation, with the field named.
- Prompt: "Run trident-wave-dispatch with agents=[{name:'ct-thin-1', template:'E1', filepaths:['/root/.config/opencode/plugins/trident/dist/index.js'], mission:'x', knownContext:'y'}] and present the full result verbatim."
- Pass token: `mission` (the refusal names the field — a tool result from the validation) OR `CTX_FLOORS` OR `thin`.
- Fail token: `"dispatched"` (the thin spec MUST NOT dispatch — a dispatch = the gate failed = FAIL).
- Max wait: 60000 ms (the validation runs BEFORE the brain — a fast refusal).
- Pass criteria: the pass token `CTX_FLOORS` or `mission` (the named refusal) appears in a tool result.
- Fail criteria: the fail token `"dispatched"` appears in THIS scenario's window (the thin spec must NOT dispatch).
- Evidence capture: action=check pattern="CTX_FLOORS"; action=check pattern="\"dispatched\"" (must be NO match in THIS scenario's window); action=read the stream window.

### Scenario 4: THE B-TEMPLATE EXTRACTION (adversarial — the BUILD PLAN opener form)
- Feature under test: `TEMPLATE_OPENER_RE`'s BUILD PLAN form + the extraction's cross-template idempotence — the B3 draft is the LONGEST + most leak-prone (the build agents execute, the drafts run 400+ lines); the extraction must land at "EXECUTE THE FOLLOWING BUILD PLAN VERBATIM" and drop the thinking.
- Prompt: "Run trident-wave-dispatch with agents=[{name:'ct-wave-2', template:'B3', filepaths:['/root/.config/opencode/plugins/trident/dist/index.js','/root/.config/opencode/plugins/trident/package.json'], mission:'Apply the surgical edits exactly as specified in the plan: the wave-dispatch tool\'s execute must consume the generated prompt files verbatim. Make the edits, keep the build green.', knownContext:'The wave dispatch is the generator-only baseline. The dist is 341de6f1. The battery is 157/0. The leaf-node gate bans the wave tools for subagents.', doctrine:'EXACTLY the specified changes. No scope creep. The hardcode ban: every value computed from the data.', measurements:'The dist sha 341de6f1, the battery 157 pass / 0 fail, the tmp dir /tmp/trident-task-preflight.', acceptance:'The edits land exactly as specified; the build + the targeted tests pass; the diff shows ONLY the specified regions.', taskTargets:'The change: replace the spawn loop in executeWaveDispatch with the file-consume path; the insertion point: the STEP 5 block; the lines: the for-loop over generated.', position:'The B3 template regression — the extraction must handle the BUILD PLAN opener form.'}]" — then present the full tool result verbatim.
- Pass token: `"dispatched"` (the B3 wave dispatched — a tool result) AND the artifact: the ct-wave-2 prompt file STARTS with "EXECUTE THE FOLLOWING BUILD PLAN VERBATIM" (the B-form opener — the extraction landed).
- Fail token: `Let me plan the tool calls` OR `I need to expand` (drafting markers — the contamination survived the B-template path = FAIL).
- Max wait: 480000 ms (a second live generation).
- Pass criteria: the wave dispatch returns `"dispatched"` AND the ct-wave-2 prompt file starts with "EXECUTE THE FOLLOWING BUILD PLAN VERBATIM".
- Fail criteria: the fail tokens `Let me plan the tool calls` or `I need to expand` appear (the contamination survived the B-template path).
- Evidence capture: action=check pattern="\"dispatched\""; action=exec cat on the ct-wave-2 prompt file's first line; action=check pattern="Let me plan the tool calls" (must be NO match).

## ADVERSARIAL
- Scenario 3 (the thin-args refusal): the undersized mission arg — the gate must refuse BEFORE any LLM call, naming the field. Pass = the named refusal; FAIL = a dispatch.
- Scenario 4 (the B-template path): the longest draft class + the alternate opener form — the highest leak-risk path. Pass = the B-form opener + zero drafting markers.
- The failTokens across ALL scenarios are the drafting-marker lexicon itself — the contamination's signatures. Any match anywhere = the fix failed.

## EVIDENCE
- The deployment fingerprint: sha256sum dist/index.js == 341de6f1c1074e14e51409e77efa4187a59c8287e73bfdd56544398b27ccb8ab (local == the container's deployed dist — the setup's expectSha).
- Per scenario: the passToken match + the failToken absence in the TUI stream (action=check), the prompt FILE's first line + marker scan (action=exec cat / grep on the tmp file — the file is the ground truth the batch form is built from), the byte offsets of the evidence windows.
- The stream excerpts: the [SHADOW INFERENCE] + the supremacy quotes shown in tool-result context (the wave-dispatch return is a tool result; the file reads are tool results).
- The container: wave-baseline-ct (the existing 12288MB container — the deploy replaces its dist with 341de6f1).

## PASS CRITERIA
- The deployment shaMatch: TRUE (the container runs 341de6f1).
- The auth-gated generation: Scenario 1's wave dispatch completes (the DeepSeek call with the container's credentials worked — the silent-auth-failure check).
- All 4 scenarios: passToken present AND failToken absent, the passTokens verified in tool-result context (the wave-dispatch returns + the file reads are tool results — never the agent's free text alone).
- No timeouts (each scenario within its maxWaitMs).
- The results artifact: .trident/container-test-results.json written with the per-scenario verdicts (passTokenMatch / failTokenAbsent / toolResultContext / verdict).
- Overall: "All 4 scenarios PASS with the passTokens present + the failTokens absent + the container alive at the end. Any failToken match = the suite FAILED (the contamination survived)."
