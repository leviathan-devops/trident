# CURRENT_STATE — THE ARCHITECTURE AS IT IS (2026-08-09)

**THE DIST: 11fb42e76d2d10e110c8d5e75b620084afe2cd1989ba445d9aa888830a88f5c2 (16.0 MB). THE BATTERY: 175 pass / 0 fail / 638 expect.** This is the per-module status — built/solid/broken/open — with the file:line anchors. The architecture as it ACTUALLY is, every deviation from the original design noted.

---

## THE MODULE INVENTORY (file → status → the proof)

### 1. THE WAVE GENERATOR (src/tools/wave-dispatch.ts — ~590 lines) — SOLID
**What it is:** the ONLY subagent dispatch path — a GENERATOR-ONLY tool. The agents array → the shadow pipeline → the prompt files + the manifest → the BATCH FORM (the task calls with the promptFile channel). The orchestrator dispatches the batch; the tool NEVER spawns.
**The proof:** the generator-only baseline (wave-dispatch.ts:424-443 — the batch form); the bounded-concurrency pool (CONCURRENT_GENERATIONS = 3 at :313 — the provider's queue's cap); the per-agent telemetry (startedAt/finishedAt/durationMs at :317-350 — the async provable); the runOne failure capture (the generationFailures → the failed list); the promptFile channel (the batch form's parameters.promptFile — the exact content from the file, no reproduction); the wave-specific manifest names (`.wave-manifest-<waveId>.json` at :378/:423 — the preservation's foundation); the check-in's "NO subagents have been dispatched" (the purge).
**THE CONTAINER PROOF:** wavegen-fix-ct's 6/6 PASS (the telemetry + the 2-agent wave + the thin-args refusal + the read) + the host's live waves (the th-ctx: durationMs 158724, status ok).
**DO NOT RE-OPEN:** the generator-only baseline, the batch form, the bounded pool, the telemetry, the promptFile, the manifest names.

### 2. THE SHADOW RUNNER (src/tools/shadow/shadow-runner.ts — 1206 lines) — SOLID
**What it is:** the 13-step pipeline: the tether → the sidecar → the session-scoped memory → the reattach gate → the CTX_FLOORS validation → the buildContext → the weave + the supremacy contract + the [SHADOW INFERENCE] → the PI loop (≤4 rounds) → the silentVerify → the echo strip → the atomic append → the manifest.
**The proof:** PI_MAX_TOKENS = 384_000 (:123); the loud-fail PI_LOOP_EMPTY (:1112-1122 — the errorManifest ready:false, no file, no row); the named-partial error (:1192-1201 — the AGENT PARTIAL manifest names the shortfall); the no-fabrication candidate (:671-676); the bracket-tolerant TOOL_CALL_RE (:306).
**DO NOT RE-OPEN:** the loud-fail, the 384K, the no-fabrication, the echo strip, the named-partial.

### 3. THE SHADOW MEMORY (src/tools/shadow/shadow-memory.ts — 330 lines) — SOLID
**What it is:** the session-scoped sqlite (the prompts table + the JSON mirror). THE ATOMIC SEQ: the INSERT computes the seq internally + RETURNING — the caller's seq ignored (the TOCTOU race dead).
**DO NOT RE-OPEN:** the atomic seq.

### 4. THE SHADOW BRAIN (src/tools/shadow/shadow-brain.ts — ~480 lines) — SOLID
**What it is:** DeepSeek V4 Flash via opencode-go, effort max. THE SSE STREAMING TRANSPORT (the root-cause fix): stream:true (:179), the armStall/idle re-arm per event (:196-203), the SSE parse (:252-292), the stalled branch (:298-305), the ONE retry-on-500 (:457-476), SHADOW_TIMEOUT_MS 180_000 (:53), SHADOW_FETCH_STALL_MS 45_000 (:59).
**THE PROOF:** the streaming probes (the first byte 1.0s vs the non-streaming 48.9s — the 45s window's geometry); the container 6/6 suite's generations.
**DO NOT RE-OPEN:** the streaming transport, the stall detector, the retry, the 180s ceiling.

### 5. THE CT TOOL (src/tools/container-test.ts — 2400 lines) — SOLID
**What it is:** the single sanctioned container interface. THE FIXES: the DCS-swallow bound, the offset/limit exposure, the cursor resets, the spaced-path cp, the ORDER gate, the session-keyed ct_state, the switch-model/switch-agent actions (the tool implements the two-step Enter + the variant modal — the operator: "this is literally exactly what the tool is supposed to do").
**DO NOT RE-OPEN:** the DCS bound, the session-keyed state, the ORDER gate, the switch actions.

### 6. THE HOOKS (src/hooks/trident-hooks.ts — ~3260 lines) — SOLID + THE DEEP TEST'S TARGET
**What it is:** the enforcement layer. THE FIXES:
- The theatrical v3: the 8 token arrays (REAL_TARGET_SUBJECTS with the lookahead + the bare production, CODE_UNIT_SUBJECTS, CLAIM_VERBS, SUBSTITUTE_NOUNS with the evasion family, SUBSTITUTE_VERBS, SERVER_SHAPE_NOUNS, FUNCTION_MOCK_SHAPES, THEATRICAL_CONFESSIONS with the config-noop), the sentenceVerdict (:518+), detectTheatricalFinding (:576+), the tracker (trackTheatricalArtifacts :637+, markContainerTestSubject :664+, checkDownstreamTheatrical :677+), the THROW-ONLY enforcement (the tool.before ESCALATE throw at :2051-2066 + the accumulated-count check at :2033-2040 — the text.complete + the messages-transform theatrical scans REMOVED per the operator's ban).
- The wave-verbatim: the [WAVE VERBATIM] SHA verification (findWaveManifestEntry :1006+ — the lines-gate: the manifest's lines >= 125), the [WAVE BATCH] enforcement (findWaveAgentsCount :1060+), the question-tool leaf ban (:1552+), the t.e.a. wipe's preservation (:2304+ — the manifests + the prompt files survive, the WAVE_RECORD_WINDOW_MS + the WAVE_RECORD_CAP named).
- The [NO LAZY PROMPTS] firewall (:1757+ — the either/or + the wave-verbatim checks).
- The SSTF claim arming (the completed-message lexicon — the tool-output arming removed).
**THE OPEN ITEM — THE CONTAINER DEEP TEST** (the ACTIVE): the fixtures ready + the model live + the scenarios designed — the run pending the setup's re-validation.
**DO NOT RE-OPEN:** the theatrical v3, the throw-only enforcement, the wave-verbatim firewalls, the lines-gate, the question-ban, the t.e.a. preservation.

### 7. THE SSTF FIREWALL (src/firewalls/semantic-smoke-firewall.ts — 420 lines) — SOLID
**What it is:** the claim gate. UNCHANGED by the theatrical overhaul (the subject-awareness lives in the tracker). The setContainerTestRan/hasClaimWithoutContainerTest at :322-334.
**DO NOT RE-OPEN:** the claim gate's surface (the 175 tests depend on it).

### 8. THE IDENTITY (src/identity/trident/ + src/identity/index.ts + AGENTS.md) — SOLID
**What it is:** the 14 warheads (1-9 the pre-existing, 10 the loud-fail, 11 the async, 12 the density-and-dispatch, 13 the verification-before-declaration, 14 the proven-path), the EXECUTION.md's laws, the FIREWALL_CONTEXT, the TOOLS, the QUALITY, the AGENT_AWARENESS, the INTELLIGENT_SYSTEMS_ENGINEERING_T1. THE INLINE WIRING: the INLINE_WARHEADS_MD in src/identity/index.ts (~:766) regenerated from the disk (the injection's copy — the stale-inline wiring gap found + fixed). The AGENTS.md (the native channel, regenerated).
**DO NOT RE-OPEN:** the identity structure, the warheads' content (the operator-approved finals), the inline regen process.

### 9. THE TESTS (src/tests/ — 15 files, 175 tests) — SOLID
The shadow-extract battery, the shadow-runner (the A2 loud-fail contract), the shadow-memory (the atomic seq), the wave-block/spawn/tracker/telemetry/cron/eta/todowrite, the shadow-brain (the streaming transport's SSE tests + the retry tests). THE NEXT TESTS: the deep test's fixes' tests (if the suite surfaces bugs).

---

## THE PROVEN-MACHINERY INVENTORY (what NOT to re-open + why)

| The machinery | Why it's locked |
|---|---|
| The generator-only baseline (the batch form) | the 15-deep recursion catastrophe's fix |
| The loud-fail (PI_LOOP_EMPTY, no fallback) | the operator's LAW (WARHEAD 10) |
| The atomic seq | the parallel-race fix |
| The 384K ceiling | the truncation root-cause + the operator's ruling |
| The [SHADOW INFERENCE] = the model brief or nothing | the operator's design |
| The stall detector (45s + 90s) | the 16-minute silent-wait fix |
| The session-keyed CT state | the clobbering fix |
| The re-enabled firewall ([NO LAZY PROMPTS]) | the operator's directive |
| The SSTF claim arming (completed-message lexicon) | the false-positive noise fix |
| The task-preflight TOOL removed | the operator's directive (the module = the shared machinery) |
| The theatrical throw-only enforcement | the operator's "ONLY throw errors on tool before" |
| The [WAVE VERBATIM] + the [WAVE BATCH] + the lines-gate | the operator's compression ban + the slop-exemption hole |
| The question-tool leaf ban | the operator's "remove the question tool from subagents" |
| The t.e.a. wipe's preservation | the SHA records + the promptFile channel's survival |
| The warheads 12/13/14 + the inline regen | the operator-approved finals + the wiring gap |

---

## THE OPEN ITEMS (with the blockers + the next attempts)

1. **THE CONTAINER DEEP TEST** — the ACTIVE. The fixtures ready (the container's tmp), the model live (DeepSeek V4 Flash (2x usage) / OpenCode Go — verified), the plan preflighted READY. Blocker: NONE — the setup's re-validation (the ORDER gate) pending. Next: the setup → the 7 scenarios → the bugs fixed → the artifact.
2. **THE HOST DEPLOY of 11fb42e7** — the operator's action (the host runs the GNR dist after the revert).
3. **THE CHECKPOINT + THE PACKAGE SYNC** — STALE at 1878ac92 — the deep test's completion syncs.
4. **THE CANON DOCS' FINAL REFRESH** — after the deep test.

---

## THE ARCHITECTURE AS IT ACTUALLY IS (the deviations from the original design)

1. **THE WAVE DISPATCH IS GENERATOR-ONLY** — the original spec's spawn design superseded by the catastrophe fix (the batch form → the orchestrator's batch dispatch).
2. **THE [SHADOW INFERENCE] IS THE MODEL'S BRIEF OR NOTHING** — the mechanical fallback banned.
3. **THE TASK FIREWALL IS RE-ENABLED** with the [NO LAZY PROMPTS] + the [WAVE VERBATIM]/[WAVE BATCH] checks.
4. **THE TRIDENT-TASK-PREFLIGHT TOOL IS REMOVED** — the shared machinery remains.
5. **THE PI_LOOP'S TOKEN BUDGET IS 384000** — the operator's ruling.
6. **THE STALL DETECTOR (45s + 90s)** — the spec's 240s superseded.
7. **THE THEATRICAL ENFORCEMENT IS THROW-ONLY** — the text.complete + the messages-transform wiring REMOVED (the operator's "ONLY throw errors on tool before are allowed" — the M4/M5 canon superseded for the theatrical gate).
8. **THE WAVE DISPATCHES ARE SHA-VERIFIED** — the [WAVE VERBATIM] + the [WAVE BATCH] + the lines-gate — the compression structurally impossible.
9. **THE T.E.A. WIPE PRESERVES THE RECORDS** — the manifests + the prompt files survive for the verification + the promptFile channel.

---

## THE KEY ANCHORS IN DETAIL (the verification targets per module)

### The theatrical v3's decision machinery (trident-hooks.ts)
- REAL_TARGET_SUBJECTS (:429-447): the lookahead (?!'?s?\s+(?:module|function|...|client|error\s+handling)) on the the-X tokens + the bare production + tencentdb + tdb server — the "the api client"/"the server module" precision.
- CODE_UNIT_SUBJECTS (:447+): the module/function/component/adapter/class/handler/logic/code/tool/pipeline/unit/behavior/error-handling — the legit-unit-test exemption's scope.
- CLAIM_VERBS (:455+): verified/proven/tested/confirmed/works/passed/validated/succeeded/complete/honest/is working/is correct.
- SUBSTITUTE_NOUNS (:463+): the evasion family — shim/facade/proxy/drop-in/replica/emulation/stand-in/standin/synthetic/dummy/double/interceptor/test double/local substitute.
- THEATRICAL_CONFESSIONS (:493+): the 6 spec patterns + the config-noop admission (/(disabled?|bypassed?|turned\s+off)\s+the\s+(real|actual)\s+(call|request|endpoint|api|service|integration)/).
- sentenceVerdict (:518+): the confession-first, the claim check, the subject classification (the real-beats-code), the substitute shape, the verdict table.
- detectTheatricalFinding (:576+): the sentence split (/(?<=[.!?])\s+|\n+/), the first-theatrical-wins.
- The tracker (:611-680): trackTheatricalArtifacts (the write/edit with a substitute + a server shape), markContainerTestSubject (the 30-min window), checkDownstreamTheatrical (the substitute-subject + a claim → the named path).
- The throw-only enforcement (:2033-2070): the accumulated-count check (the thAccState.suggested && count >= 3 → the throw) + the args-arming + the ESCALATE texts.

### The wave-verbatim machinery (trident-hooks.ts)
- findWaveManifestEntry (:1006+): the preserved manifests + the name + the SHA + the LINES-GATE (the manifest's lines >= 125).
- waveAgentExists + findWaveAgentsCount (:1060+): the wave's agent set + the count.
- The [WAVE BATCH] check (:1760+): the single dispatch of a multi-agent wave → the block.
- The t.e.a. wipe (:2304+): the manifests + the prompt files preserved, the WAVE_RECORD_WINDOW_MS (60 min) + the WAVE_RECORD_CAP (20).

### The wave generator's machinery (wave-dispatch.ts)
- executeWaveDispatch (:261-509): the validation (the empty/cap/thin), the bounded pool (:313-365), the runOne telemetry (:317-350), the manifest + the batch form (:367-489), the telemetry + the return (:493-508).
- The batch form (:477-489): the promptFile channel (path.join(tmpDir, name + '.md')).
- The manifest names (:378/:423): the wave-specific (.wave-manifest-<waveId>.json).

---

## THE ARCHITECTURE'S DATA FLOWS (the fresh agent's orientation)

### The wave generation flow
The tool's agents array → validateAgentSpec (the CTX_FLOORS) → the bounded pool (3 at a time) → the shadow pipeline per agent (the tether → the sidecar → the memory → the weave → the PI loop → the verify → the echo strip → the atomic append) → the prompt file + the manifest (the wave-specific name) → the batch form (the promptFile channel + the telemetry) → the orchestrator's batch dispatch (the [WAVE VERBATIM] SHA + the [WAVE BATCH] checks) → the children.

### The theatrical enforcement flow
The tool.before (the non-skipped tools): the accumulated-count check (the count >= 3 → the ESCALATE throw) → the args scan (checkTheatricalPatterns — the v3 sentence verdict on the proposal tools' content) → the arming (the count++) → the tracker's event hooks (the write/CT marking). The throw-only: NO message-surface arming — the text.complete + the messages-transform carry NO theatrical wiring.

### The wave-verbatim flow
The generation → the manifest's sha256 + lines recorded → the t.e.a. wipe preserves the manifests + the prompt files → the dispatch's prompt SHA vs the manifest's sha256 (the [WAVE VERBATIM]) + the wave's agent count (the [WAVE BATCH]) + the manifest's lines >= 125 (the lines-gate) → the verbatim exemption (the structural checks skipped for the generated prompts).

## THE KNOWN DEVIATIONS FROM THE ORIGINAL SPECS
- WAVE_DISPATCH_OVERHAUL_SPEC's Part 3.2 (the spawn design): superseded by the generator-only baseline.
- SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC's 8192 cap: superseded by the 384000.
- The theatrical spec's Part 3.6 (the completed-message surface): the implementation happened + then the throw-only ruling REMOVED the message-surface arming — the current state: the args scan + the ESCALATE throw only.

---

## THE MODULES' VERIFICATION COMMANDS (the fresh agent's checks)

- The wave generator: cd src/tests && bun test wave-telemetry.test.ts (the telemetry + the pool tests).
- The shadow brain: cd src/tests && bun test shadow-brain.test.ts (the SSE transport + the retry tests).
- The hooks: cd src/tests && bun test wave-block.test.ts + wave-spawn.test.ts + wave-tracker.test.ts (the firewall + the dispatch tests).
- The identity: grep -c "WARHEAD 14" src/identity/trident/WARHEADS.md (the warheads' presence) + grep -c "VERIFICATION-BEFORE" src/identity/index.ts (the inline's freshness).
- The build: npm run build:bun + sha256sum dist/index.js.

## THE OPEN ITEMS' DETAIL (the blockers + the next attempts)

1. The container deep test: the fixtures ready + the model live + the plan preflighted — the setup's re-validation is the immediate next action. The earlier attempts' failures are the history (the provider exhaustion + the config fumbling) — the current state is the Go model live.
2. The host deploy: the operator's action — the dist 11fb42e7.
3. The checkpoint/package sync: stale at 1878ac92 — the deep test's completion syncs.
4. The canon docs' final refresh: after the deep test.

## THE ARCHITECTURE'S PROVEN PATHS (the resume's shortcuts)

- The model switch: switch-model modelName='DeepSeek V4 Flash' provider='OpenCode Go' (the display name — the WARHEAD 14's args-check) — the status bar is the truth.
- The wave dispatch: trident-wave-generator → the batch form → the batch tool (the exact prompts, 0 ignore).
- The container suite: the plan first (the preflight READY) → the setup → the scenarios → the artifact.
- The generation: the shadow brain via opencode-go (the embedded key) — the streaming transport.

---

## THE MODULES' KNOWN FAILURE MODES (the fresh agent's diagnostics)

- The wave generator: a generation failure returns the NAMED error (PI_LOOP_EMPTY / the named-partial) — never an empty prompt; the ERROR-<name>.txt files record the details.
- The shadow brain: a provider stall aborts in 45s (the stall detector) — the loud error; the retry-on-500 re-runs once.
- The CT tool: the ORDER gate blocks the ad-hoc actions without the validated setup; the DCS-swallow bound keeps the reads clean.
- The hooks: the [WAVE VERBATIM]/[WAVE BATCH] block the dispatch derailments; the ESCALATE throws at the count >= 3.
- The identity: the inline must match the disk (the regen process) — a stale inline is the wiring gap.

## THE DEEP TEST'S OPERATOR-EXPECTATION (the ship-ready bar)

The operator's "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST" — the deep test's completion is the ship-ready gate: the plan + the full TUI run + the bugs fixed + the regressions zeroed + the artifact. The current build's container verification must be REAL before the next ship.

---

## THE CURRENT-STATE'S CROSS-DOC REFERENCES

- The SHA chain + the frozen machinery: BUILD_STATE.md.
- The evidence + the container provenance: EVIDENCE_STATE.md.
- The deep test's plan + the scenario details: NEXT_STEPS.md + .trident/test-plan.md.
- The doctrine + the laws: DECISION_CHAIN.md + COMPACTION_SURVIVAL.md.
- The resume sequence: POST-COMPACTION_PROMPT.md.

---

## THE STATE'S READER'S NOTE

The current state is the architecture AS IT IS — the modules' statuses, the proven machinery, the deviations. A fresh agent verifies the anchors (the file:line refs) before any claim about the modules.

---

## THE STATE'S VERIFICATION PROTOCOL

1. The anchors: every file:line ref in this document verified against the live source (the L4 supremacy).
2. The SHA: sha256sum dist/index.js == 416ccff7 (the BUILD_STATE/EVIDENCE_STATE agreement; the four-way hash = 1 unique — the project/checkpoint/ship-package/canonical-ship).
3. The battery: cd src/tests && bun test == 175/0.
4. The container: alive + the Go model (the status bar).
